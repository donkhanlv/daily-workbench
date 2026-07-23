use crate::ai::prompts::PromptTemplate;
use crate::ai::provider::{self, AIProvider, AIProviderConfig};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::State;
use tauri_plugin_sql::Db;
use tauri_plugin_store::StoreExt;

fn today() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}

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
pub struct TagSuggestion {
    pub tags: Vec<String>,
}

/// 为灵感内容推荐标签
#[tauri::command]
pub async fn suggest_idea_tags(
    app: tauri::AppHandle,
    content: String,
) -> Result<TagSuggestion, String> {
    let config = get_ai_config(&app).await?;

    let mut vars = HashMap::new();
    vars.insert("content".to_string(), content);

    let prompt = PromptTemplate::idea_tagger();
    let request = prompt.build_request(&vars);
    let provider = provider::create_provider(&config).map_err(|e| e.message)?;
    let response = provider.chat(request).await.map_err(|e| e.message)?;

    // 解析 JSON 标签
    let tags: Vec<String> = serde_json::from_str(&response.content).unwrap_or_else(|_| vec![]);

    Ok(TagSuggestion { tags })
}

/// 生成情绪洞察
#[tauri::command]
pub async fn generate_mood_insight(
    app: tauri::AppHandle,
    db: tauri::State<'_, Db>,
) -> Result<String, String> {
    let config = get_ai_config(&app).await?;

    // 查询最近 7 天心情
    let week_ago = {
        let mut d = chrono::Local::now();
        d -= chrono::Duration::days(7);
        d.format("%Y-%m-%d").to_string()
    };

    let rows = db
        .query(
            "SELECT log_date, mood, highlights FROM daily_logs WHERE log_date >= ? ORDER BY log_date ASC",
            vec![week_ago.as_str().into()],
        )
        .await
        .map_err(|e| format!("查询心情数据失败: {}", e))?;

    let mood_data: Vec<String> = rows
        .iter()
        .map(|r| {
            let date: String = r.get("log_date").unwrap_or_default();
            let mood: i32 = r.get("mood").unwrap_or(3);
            format!("{}: {}分", date, mood)
        })
        .collect();

    let diary_excerpt: Vec<String> = rows
        .iter()
        .filter_map(|r| {
            let h: String = r.get("highlights").unwrap_or_default();
            if h.is_empty() { None } else { Some(h) }
        })
        .collect();

    let mut vars = HashMap::new();
    vars.insert(
        "mood_data".to_string(),
        if mood_data.is_empty() {
            "暂无数据".to_string()
        } else {
            mood_data.join("; ")
        },
    );
    vars.insert(
        "diary_excerpt".to_string(),
        if diary_excerpt.is_empty() {
            "暂无日记记录".to_string()
        } else {
            diary_excerpt.join("\n")
        },
    );

    let prompt = PromptTemplate::mood_insight();
    let request = prompt.build_request(&vars);
    let provider = provider::create_provider(&config).map_err(|e| e.message)?;
    let response = provider.chat(request).await.map_err(|e| e.message)?;

    Ok(response.content)
}
