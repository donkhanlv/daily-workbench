use crate::models::{CreateEventRequest, Event};
use tauri::State;
use tauri_plugin_sql::Db;
use uuid::Uuid;

fn now() -> String {
    chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

#[tauri::command]
pub async fn get_events(db: tauri::State<'_, Db>, month: Option<String>) -> Result<Vec<Event>, String> {
    let query = if let Some(ref m) = month {
        format!(
            "SELECT * FROM events WHERE start_date LIKE '{}%' OR end_date LIKE '{}%' ORDER BY start_date ASC",
            m, m
        )
    } else {
        "SELECT * FROM events ORDER BY start_date ASC".to_string()
    };

    db.query(query, &[])
        .await
        .map_err(|e| format!("查询事件失败: {}", e))
        .map(|rows| {
            rows.into_iter().map(|row| Event {
                id: row.get("id").unwrap_or_default(),
                title: row.get("title").unwrap_or_default(),
                description: row.get("description").unwrap_or_default(),
                start_date: row.get("start_date").unwrap_or_default(),
                end_date: row.get("end_date").unwrap_or_default(),
                all_day: row.get("all_day").unwrap_or(0),
                color: row.get("color").unwrap_or_default(),
                category: row.get("category").unwrap_or_default(),
                created_at: row.get("created_at").unwrap_or_default(),
                updated_at: row.get("updated_at").unwrap_or_default(),
            }).collect()
        })
}

#[tauri::command]
pub async fn create_event(db: tauri::State<'_, Db>, req: CreateEventRequest) -> Result<Event, String> {
    let id = Uuid::new_v4().to_string();
    let now = now();
    let all_day = if req.all_day.unwrap_or(false) { 1 } else { 0 };

    db.execute(
        "INSERT INTO events (id, title, description, start_date, end_date, all_day, color, category, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        vec![
            id.as_str().into(),
            req.title.as_str().into(),
            req.description.unwrap_or_default().as_str().into(),
            req.start_date.as_str().into(),
            req.end_date.as_str().into(),
            all_day.into(),
            req.color.unwrap_or_else(|| "#5B8DEF".to_string()).as_str().into(),
            req.category.unwrap_or_default().as_str().into(),
            now.as_str().into(),
            now.as_str().into(),
        ],
    )
    .await
    .map_err(|e| format!("创建事件失败: {}", e))?;

    Ok(Event {
        id,
        title: req.title,
        description: req.description.unwrap_or_default(),
        start_date: req.start_date,
        end_date: req.end_date,
        all_day,
        color: req.color.unwrap_or_else(|| "#5B8DEF".to_string()),
        category: req.category.unwrap_or_default(),
        created_at: now.clone(),
        updated_at: now,
    })
}

#[tauri::command]
pub async fn update_event(db: tauri::State<'_, Db>, id: String, title: String, start_date: String, end_date: String) -> Result<(), String> {
    let now = now();
    db.execute(
        "UPDATE events SET title=?, start_date=?, end_date=?, updated_at=? WHERE id=?",
        vec![
            title.as_str().into(),
            start_date.as_str().into(),
            end_date.as_str().into(),
            now.as_str().into(),
            id.as_str().into(),
        ],
    )
    .await
    .map_err(|e| format!("更新事件失败: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn delete_event(db: tauri::State<'_, Db>, id: String) -> Result<(), String> {
    db.execute("DELETE FROM events WHERE id = ?", vec![id.as_str().into()])
        .await
        .map_err(|e| format!("删除事件失败: {}", e))?;
    Ok(())
}
