use crate::models::{CreateIdeaRequest, Idea};
use tauri::State;
use tauri_plugin_sql::Db;
use uuid::Uuid;

fn now() -> String {
    chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

#[tauri::command]
pub async fn get_ideas(db: tauri::State<'_, Db>) -> Result<Vec<Idea>, String> {
    db.query("SELECT * FROM ideas ORDER BY created_at DESC", &[])
        .await
        .map_err(|e| format!("查询灵感失败: {}", e))
        .map(|rows| {
            rows.into_iter().map(|row| Idea {
                id: row.get("id").unwrap_or_default(),
                content: row.get("content").unwrap_or_default(),
                source: row.get("source").unwrap_or_default(),
                tags: row.get("tags").unwrap_or_default(),
                is_favorite: row.get("is_favorite").unwrap_or(0),
                created_at: row.get("created_at").unwrap_or_default(),
            }).collect()
        })
}

#[tauri::command]
pub async fn create_idea(db: tauri::State<'_, Db>, req: CreateIdeaRequest) -> Result<Idea, String> {
    let id = Uuid::new_v4().to_string();
    let now = now();
    let tags = req.tags.unwrap_or_default();
    let tags_json = serde_json::to_string(&tags).unwrap_or_else(|_| "[]".to_string());

    db.execute(
        "INSERT INTO ideas (id, content, source, tags, created_at) VALUES (?, ?, ?, ?, ?)",
        vec![
            id.as_str().into(),
            req.content.as_str().into(),
            req.source.unwrap_or_default().as_str().into(),
            tags_json.as_str().into(),
            now.as_str().into(),
        ],
    )
    .await
    .map_err(|e| format!("创建灵感失败: {}", e))?;

    Ok(Idea {
        id,
        content: req.content,
        source: req.source.unwrap_or_default(),
        tags: tags_json,
        is_favorite: 0,
        created_at: now,
    })
}

#[tauri::command]
pub async fn delete_idea(db: tauri::State<'_, Db>, id: String) -> Result<(), String> {
    db.execute("DELETE FROM ideas WHERE id = ?", vec![id.as_str().into()])
        .await
        .map_err(|e| format!("删除灵感失败: {}", e))?;
    Ok(())
}
