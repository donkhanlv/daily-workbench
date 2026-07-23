use crate::models::{CreateLearningRequest, Learning};
use serde::Deserialize;
use tauri::State;
use tauri_plugin_sql::Db;
use uuid::Uuid;

fn now() -> String {
    chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

#[derive(Debug, Deserialize)]
struct UpdateLearningRequest {
    id: String,
    title: Option<String>,
    progress: Option<f64>,
    current_page: Option<i32>,
    status: Option<String>,
    notes: Option<String>,
    target_date: Option<String>,
}

#[tauri::command]
pub async fn get_learning(db: State<'_, Db>) -> Result<Vec<Learning>, String> {
    let rows = db.query("SELECT * FROM learning ORDER BY updated_at DESC", &[])
        .await
        .map_err(|e| format!("查询学习失败: {}", e))?;
    Ok(rows
        .into_iter()
        .map(|r| Learning {
            id: r.get("id").unwrap_or_default(),
            title: r.get("title").unwrap_or_default(),
            r#type: r.get("type").unwrap_or_default(),
            subject: r.get("subject").unwrap_or_default(),
            progress: r.get("progress").unwrap_or(0.0),
            total_pages: r.get("total_pages").unwrap_or(0),
            current_page: r.get("current_page").unwrap_or(0),
            notes: r.get("notes").unwrap_or_default(),
            start_date: r.get("start_date").unwrap_or_default(),
            target_date: r.get("target_date").unwrap_or_default(),
            status: r.get("status").unwrap_or_default(),
            created_at: r.get("created_at").unwrap_or_default(),
            updated_at: r.get("updated_at").unwrap_or_default(),
        })
        .collect())
}

#[tauri::command]
pub async fn create_learning(db: State<'_, Db>, req: CreateLearningRequest) -> Result<Learning, String> {
    let id = Uuid::new_v4().to_string();
    let now = now();
    let status = req.status.clone().unwrap_or_else(|| "active".to_string());
    db.execute(
        "INSERT INTO learning (id, title, type, subject, progress, total_pages, current_page, notes, start_date, target_date, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        vec![
            id.as_str().into(),
            req.title.as_str().into(),
            req.r#type.clone().unwrap_or_default().as_str().into(),
            req.subject.clone().unwrap_or_default().as_str().into(),
            0.0_f64.into(),
            (req.total_pages.unwrap_or(0)).into(),
            (req.current_page.unwrap_or(0)).into(),
            req.notes.clone().unwrap_or_default().as_str().into(),
            req.start_date.clone().unwrap_or_default().as_str().into(),
            req.target_date.clone().unwrap_or_default().as_str().into(),
            status.as_str().into(),
            now.as_str().into(),
            now.as_str().into(),
        ],
    )
    .await
    .map_err(|e| format!("创建学习失败: {}", e))?;
    Ok(Learning {
        id,
        title: req.title,
        r#type: req.r#type.unwrap_or_default(),
        subject: req.subject.unwrap_or_default(),
        progress: 0.0,
        total_pages: req.total_pages.unwrap_or(0),
        current_page: req.current_page.unwrap_or(0),
        notes: req.notes.unwrap_or_default(),
        start_date: req.start_date.unwrap_or_default(),
        target_date: req.target_date.unwrap_or_default(),
        status,
        created_at: now.clone(),
        updated_at: now,
    })
}

#[tauri::command]
pub async fn update_learning(db: State<'_, Db>, req: UpdateLearningRequest) -> Result<(), String> {
    let now = now();
    db.execute(
        "UPDATE learning SET title=?, progress=?, current_page=?, status=?, notes=?, target_date=?, updated_at=? WHERE id=?",
        vec![
            req.title.unwrap_or_default().as_str().into(),
            (req.progress.unwrap_or(0.0)).into(),
            (req.current_page.unwrap_or(0)).into(),
            req.status.unwrap_or_default().as_str().into(),
            req.notes.unwrap_or_default().as_str().into(),
            req.target_date.unwrap_or_default().as_str().into(),
            now.as_str().into(),
            req.id.as_str().into(),
        ],
    )
    .await
    .map_err(|e| format!("更新学习失败: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn delete_learning(db: State<'_, Db>, id: String) -> Result<(), String> {
    db.execute("DELETE FROM learning WHERE id = ?", vec![id.as_str().into()])
        .await
        .map_err(|e| format!("删除学习失败: {}", e))?;
    Ok(())
}
