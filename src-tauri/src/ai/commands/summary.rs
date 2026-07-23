use crate::ai::prompts::PromptTemplate;
use crate::ai::provider::{self, AIProvider, AIProviderConfig, ChatMessage, ChatRequest};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::State;
use tauri_plugin_sql::Db;
use tauri_plugin_store::StoreExt;

fn today() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}

/// 获取 AI Provider 配置
async fn get_ai_config(app: &tauri::AppHandle) -> Result<AIProviderConfig, String> {
    let store = app
        .store("settings.json")
        .map_err(|e| format!("读取设置失败: {}", e))?;

    let provider = store
        .get("ai_provider")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_else(|| "openai".to_string());

    let api_key = store
        .get("ai_api_key")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_default();

    let api_base = store
        .get("ai_api_base")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_else(|| "https://api.openai.com/v1".to_string());

    let model = store
        .get("ai_model")
        .and_then(|v| v.as_str().map(|s| s.to_string()))
        .unwrap_or_else(|| "gpt-4o-mini".to_string());

    let temperature = store
        .get("ai_temperature")
        .and_then(|v| v.as_f64().map(|f| f as f32))
        .unwrap_or(0.7);

    let max_tokens = store
        .get("ai_max_tokens")
        .and_then(|v| v.as_u64().map(|u| u as u32))
        .unwrap_or(2048);

    Ok(AIProviderConfig {
        provider,
        api_key,
        api_base,
        model,
        temperature,
        max_tokens,
    })
}

/// 保存 AI 生成记录到数据库
async fn save_generation(
    db: &Db,
    scene: &str,
    source_type: &str,
    source_id: &str,
    prompt: &str,
    response: &str,
    model: &str,
    tokens: u32,
) -> Result<(), String> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    
    db.execute(
        "INSERT INTO ai_generations (id, scene, source_type, source_id, prompt, response, model, tokens_used, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        vec![
            id.as_str().into(),
            scene.into(),
            source_type.into(),
            source_id.into(),
            prompt.into(),
            response.into(),
            model.into(),
            (tokens as i64).into(),
            now.as_str().into(),
        ],
    )
    .await
    .map_err(|e| format!("保存 AI 生成记录失败: {}", e))?;

    Ok(())
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AISummaryRequest {
    pub date: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AISummaryResponse {
    pub content: String,
    pub model: String,
}

/// 生成每日总结
#[tauri::command]
pub async fn generate_daily_summary(
    app: tauri::AppHandle,
    db: tauri::State<'_, Db>,
    req: AISummaryRequest,
) -> Result<AISummaryResponse, String> {
    let date = req.date.unwrap_or_else(today);

    // 1. 获取 AI 配置
    let config = get_ai_config(&app).await?;

    // 2. 查询当日数据
    let todo_rows = db
        .query(
            "SELECT COUNT(*) as total, SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) as done FROM todos WHERE due_date = ?",
            vec![date.as_str().into()],
        )
        .await
        .map_err(|e| format!("查询待办失败: {}", e))?;

    let total_todos: i64 = todo_rows.first().and_then(|r| r.get("total")).unwrap_or(0);
    let done_todos: i64 = todo_rows.first().and_then(|r| r.get("done")).unwrap_or(0);

    let mood: String = db
        .query("SELECT mood FROM daily_logs WHERE log_date = ?", vec![date.as_str().into()])
        .await
        .map_err(|e| format!("查询心情失败: {}", e))?
        .first()
        .and_then(|r| {
            let m: Option<i32> = r.get("mood");
            m.map(|v| v.to_string())
        })
        .unwrap_or_else(|| "未记录".to_string());

    let habit_rows = db
        .query(
            "SELECT COUNT(*) as cnt FROM habit_records WHERE record_date = ?",
            vec![date.as_str().into()],
        )
        .await
        .map_err(|e| format!("查询习惯失败: {}", e))?;
    let habit_count: i64 = habit_rows.first().and_then(|r| r.get("cnt")).unwrap_or(0);

    let highlights: String = db
        .query("SELECT highlights FROM daily_logs WHERE log_date = ?", vec![date.as_str().into()])
        .await
        .map_err(|e| format!("查询高光失败: {}", e))?
        .first()
        .and_then(|r| r.get("highlights"))
        .unwrap_or_default();

    // 3. 组装 Prompt 变量
    let mut vars = HashMap::new();
    vars.insert("date".to_string(), date);
    vars.insert(
        "todo_summary".to_string(),
        format!("共 {} 项，已完成 {} 项", total_todos, done_todos),
    );
    vars.insert("mood".to_string(), mood);
    vars.insert(
        "habit_summary".to_string(),
        format!("今日打卡 {} 个习惯", habit_count),
    );
    vars.insert("highlights".to_string(), highlights);

    // 4. 调用 AI
    let prompt = PromptTemplate::daily_summary();
    let request = prompt.build_request(&vars);
    let provider = provider::create_provider(&config).map_err(|e| e.message)?;
    let response = provider.chat(request).await.map_err(|e| e.message)?;

    // 5. 保存记录
    save_generation(
        &db,
        "daily_summary",
        "daily_log",
        &today(),
        &prompt.render(&vars),
        &response.content,
        &response.model,
        response.usage.as_ref().map(|u| u.total_tokens).unwrap_or(0),
    )
    .await?;

    Ok(AISummaryResponse {
        content: response.content,
        model: response.model,
    })
}
