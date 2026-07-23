use crate::models::{CreateMemoRequest, Memo};
use tauri::State;
use tauri_plugin_sql::Db;
use uuid::Uuid;

fn now() -> String {
    chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

#[tauri::command]
pub async fn get_memos(db: tauri::State<'_, Db>) -> Result<Vec<Memo>, String> {
    db.query(
        "SELECT * FROM memos ORDER BY is_pinned DESC, created_at DESC",
        &[],
    )
    .await
    .map_err(|e| format!("查询备忘录失败: {}", e))
    .map(|rows| {
        rows.into_iter().map(|row| Memo {
            id: row.get("id").unwrap_or_default(),
            title: row.get("title").unwrap_or_default(),
            content: row.get("content").unwrap_or_default(),
            color: row.get("color").unwrap_or_default(),
            is_pinned: row.get("is_pinned").unwrap_or(0),
            remind_at: row.get("remind_at").unwrap_or_default(),
            created_at: row.get("created_at").unwrap_or_default(),
            updated_at: row.get("updated_at").unwrap_or_default(),
        }).collect()
    })
}

#[tauri::command]
pub async fn create_memo(db: tauri::State<'_, Db>, req: CreateMemoRequest) -> Result<Memo, String> {
    let id = Uuid::new_v4().to_string();
    let now = now();

    db.execute(
        "INSERT INTO memos (id, title, content, color, remind_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        vec![
            id.as_str().into(),
            req.title.unwrap_or_default().as_str().into(),
            req.content.as_str().into(),
            req.color.unwrap_or_else(|| "#FFF9C4".to_string()).as_str().into(),
            req.remind_at.unwrap_or_default().as_str().into(),
            now.as_str().into(),
            now.as_str().into(),
        ],
    )
    .await
    .map_err(|e| format!("创建备忘录失败: {}", e))?;

    Ok(Memo {
        id,
        title: req.title.unwrap_or_default(),
        content: req.content,
        color: req.color.unwrap_or_else(|| "#FFF9C4".to_string()),
        is_pinned: 0,
        remind_at: req.remind_at.unwrap_or_default(),
        created_at: now.clone(),
        updated_at: now,
    })
}

#[tauri::command]
pub async fn delete_memo(db: tauri::State<'_, Db>, id: String) -> Result<(), String> {
    db.execute("DELETE FROM memos WHERE id = ?", vec![id.as_str().into()])
        .await
        .map_err(|e| format!("删除备忘录失败: {}", e))?;
    Ok(())
}
