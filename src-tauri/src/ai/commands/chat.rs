use crate::ai::prompts::PromptTemplate;
use crate::ai::provider::{self, AIProvider, AIProviderConfig, ChatMessage, ChatRequest};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri_plugin_store::StoreExt;

async fn get_ai_config(app: &tauri::AppHandle) -> Result<AIProviderConfig, String> {
    let store = app
        .store("settings.json")
        .map_err(|e| format!("读取设置失败: {}", e))?;

    Ok(AIProviderConfig {
        provider: store
            .get("ai_provider")
            .and_then(|v| v.as_str().map(|s| s.to_string()))
            .unwrap_or_else(|| "openai".to_string()),
        api_key: store
            .get("ai_api_key")
            .and_then(|v| v.as_str().map(|s| s.to_string()))
            .unwrap_or_default(),
        api_base: store
            .get("ai_api_base")
            .and_then(|v| v.as_str().map(|s| s.to_string()))
            .unwrap_or_else(|| "https://api.openai.com/v1".to_string()),
        model: store
            .get("ai_model")
            .and_then(|v| v.as_str().map(|s| s.to_string()))
            .unwrap_or_else(|| "gpt-4o-mini".to_string()),
        temperature: store
            .get("ai_temperature")
            .and_then(|v| v.as_f64().map(|f| f as f32))
            .unwrap_or(0.7),
        max_tokens: store
            .get("ai_max_tokens")
            .and_then(|v| v.as_u64().map(|u| u as u32))
            .unwrap_or(2048),
    })
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatRequest2 {
    pub message: String,
    pub history: Option<Vec<ChatMessage>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatResponse2 {
    pub reply: String,
    pub model: String,
}

/// AI 对话助手
#[tauri::command]
pub async fn ai_chat(
    app: tauri::AppHandle,
    req: ChatRequest2,
) -> Result<ChatResponse2, String> {
    let config = get_ai_config(&app).await?;
    let prompt = PromptTemplate::chat_assistant();

    let mut messages = vec![ChatMessage {
        role: "system".to_string(),
        content: prompt.system_prompt.clone(),
    }];

    // 添加历史消息
    if let Some(history) = req.history {
        messages.extend(history);
    }

    // 添加当前消息
    messages.push(ChatMessage {
        role: "user".to_string(),
        content: req.message,
    });

    let request = ChatRequest {
        model: config.model.clone(),
        messages,
        temperature: Some(config.temperature),
        max_tokens: Some(config.max_tokens),
        stream: Some(false),
    };

    let provider = provider::create_provider(&config).map_err(|e| e.message)?;
    let response = provider.chat(request).await.map_err(|e| e.message)?;

    Ok(ChatResponse2 {
        reply: response.content,
        model: response.model,
    })
}
