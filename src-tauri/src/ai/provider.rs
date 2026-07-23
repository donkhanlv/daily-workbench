use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ===== AI Provider 接口 =====
#[async_trait::async_trait]
pub trait AIProvider: Send + Sync {
    /// 发送聊天请求，返回文本响应
    async fn chat(&self, req: ChatRequest) -> Result<ChatResponse, AIError>;

    /// 流式聊天（预留）
    async fn chat_stream(&self, req: ChatRequest) -> Result<Vec<ChatResponse>, AIError> {
        // 默认实现：回退到非流式
        let resp = self.chat(req).await?;
        Ok(vec![resp])
    }
}

// ===== 请求/响应模型 =====
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatMessage {
    pub role: String, // "system" / "user" / "assistant"
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatRequest {
    pub model: String,
    pub messages: Vec<ChatMessage>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
    pub stream: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatResponse {
    pub content: String,
    pub model: String,
    pub usage: Option<TokenUsage>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TokenUsage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AIError {
    pub message: String,
    pub code: String,
}

impl std::fmt::Display for AIError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[{}] {}", self.code, self.message)
    }
}

impl std::error::Error for AIError {}

// ===== Provider 配置 =====
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AIProviderConfig {
    pub provider: String,           // openai / claude / deepseek / ollama
    pub api_key: String,            // API Key（加密存储）
    pub api_base: String,           // API 地址
    pub model: String,              // 模型名称
    pub temperature: f32,           // 温度参数
    pub max_tokens: u32,            // 最大 Token
}

impl Default for AIProviderConfig {
    fn default() -> Self {
        Self {
            provider: "openai".to_string(),
            api_key: String::new(),
            api_base: "https://api.openai.com/v1".to_string(),
            model: "gpt-4o-mini".to_string(),
            temperature: 0.7,
            max_tokens: 2048,
        }
    }
}

// ===== Provider 工厂 =====
pub fn create_provider(config: &AIProviderConfig) -> Result<Box<dyn AIProvider>, AIError> {
    match config.provider.as_str() {
        "openai" => Ok(Box::new(OpenAIProvider::new(config))),
        "deepseek" => {
            let mut cfg = config.clone();
            if cfg.api_base.is_empty() || cfg.api_base == "https://api.openai.com/v1" {
                cfg.api_base = "https://api.deepseek.com".to_string();
            }
            Ok(Box::new(OpenAIProvider::new(&cfg))) // DeepSeek 兼容 OpenAI 接口
        }
        "ollama" => {
            let mut cfg = config.clone();
            cfg.api_base = config.api_base.trim_end_matches('/').to_string();
            Ok(Box::new(OllamaProvider::new(&cfg)))
        }
        _ => Err(AIError {
            message: format!("不支持的 AI Provider: {}", config.provider),
            code: "UNSUPPORTED_PROVIDER".to_string(),
        }),
    }
}

// ===== OpenAI 兼容 Provider =====
pub struct OpenAIProvider {
    config: AIProviderConfig,
}

impl OpenAIProvider {
    pub fn new(config: &AIProviderConfig) -> Self {
        Self {
            config: config.clone(),
        }
    }
}

#[async_trait::async_trait]
impl AIProvider for OpenAIProvider {
    async fn chat(&self, req: ChatRequest) -> Result<ChatResponse, AIError> {
        let client = reqwest::Client::new();
        let url = format!("{}/chat/completions", self.config.api_base.trim_end_matches('/'));

        let body = serde_json::json!({
            "model": req.model,
            "messages": req.messages,
            "temperature": req.temperature.unwrap_or(self.config.temperature),
            "max_tokens": req.max_tokens.unwrap_or(self.config.max_tokens),
            "stream": false,
        });

        let resp = client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.config.api_key))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| AIError {
                message: format!("AI 请求失败: {}", e),
                code: "NETWORK_ERROR".to_string(),
            })?;

        let status = resp.status();
        let json: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| AIError {
                message: format!("解析响应失败: {}", e),
                code: "PARSE_ERROR".to_string(),
            })?;

        if !status.is_success() {
            return Err(AIError {
                message: format!("AI API 错误 ({}): {}", status, json),
                code: "API_ERROR".to_string(),
            });
        }

        let content = json["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or("")
            .to_string();

        let usage = json["usage"].as_object().map(|u| TokenUsage {
            prompt_tokens: u["prompt_tokens"].as_u64().unwrap_or(0) as u32,
            completion_tokens: u["completion_tokens"].as_u64().unwrap_or(0) as u32,
            total_tokens: u["total_tokens"].as_u64().unwrap_or(0) as u32,
        });

        Ok(ChatResponse {
            content,
            model: json["model"].as_str().unwrap_or(&req.model).to_string(),
            usage,
        })
    }
}

// ===== Ollama Provider (本地模型) =====
pub struct OllamaProvider {
    config: AIProviderConfig,
}

impl OllamaProvider {
    pub fn new(config: &AIProviderConfig) -> Self {
        Self {
            config: config.clone(),
        }
    }
}

#[async_trait::async_trait]
impl AIProvider for OllamaProvider {
    async fn chat(&self, req: ChatRequest) -> Result<ChatResponse, AIError> {
        let client = reqwest::Client::new();
        let url = format!("{}/api/chat", self.config.api_base.trim_end_matches('/'));

        let ollama_messages: Vec<serde_json::Value> = req
            .messages
            .iter()
            .map(|m| {
                serde_json::json!({
                    "role": m.role,
                    "content": m.content,
                })
            })
            .collect();

        let body = serde_json::json!({
            "model": req.model,
            "messages": ollama_messages,
            "stream": false,
        });

        let resp = client
            .post(&url)
            .json(&body)
            .send()
            .await
            .map_err(|e| AIError {
                message: format!("Ollama 请求失败: {}", e),
                code: "NETWORK_ERROR".to_string(),
            })?;

        let json: serde_json::Value = resp.json().await.map_err(|e| AIError {
            message: format!("解析 Ollama 响应失败: {}", e),
            code: "PARSE_ERROR".to_string(),
        })?;

        let content = json["message"]["content"]
            .as_str()
            .unwrap_or("")
            .to_string();

        Ok(ChatResponse {
            content,
            model: json["model"].as_str().unwrap_or(&req.model).to_string(),
            usage: None,
        })
    }
}
