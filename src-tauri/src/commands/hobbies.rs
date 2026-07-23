use crate::models::{CreateHobbyRequest, Hobby};
use serde::Deserialize;
use tauri::State;
use tauri_plugin_sql::Db;
use uuid::Uuid;

fn now() -> String {
    chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

#[derive(Debug, Deserialize)]
struct UpdateHobbyRequest {
    id: String,
    name: Option<String>,
    description: Option<String>,
    category: Option<String>,
    status: Option<String>,
    progress: Option<i32>,
    note: Option<String>,
}

#[tauri::command]
pub async fn get_hobbies(db: State<'_, Db>) -> Result<Vec<Hobby>, String> {
    let rows = db
        .query("SELECT * FROM hobbies ORDER BY updated_at DESC", &[])
        .await
        .map_err(|e| format!("查询爱好失败: {}", e))?;
    Ok(rows
        .into_iter()
        .map(|r| Hobby {
            id: r.get("id").unwrap_or_default(),
            name: r.get("name").unwrap_or_default(),
            description: r.get("description").unwrap_or_default(),
            category: r.get("category").unwrap_or_default(),
            icon: r.get("icon").unwrap_or_default(),
            color: r.get("color").unwrap_or_default(),
            status: r.get("status").unwrap_or_default(),
            progress: r.get("progress").unwrap_or(0),
            note: r.get("note").unwrap_or_default(),
            created_at: r.get("created_at").unwrap_or_default(),
            updated_at: r.get("updated_at").unwrap_or_default(),
        })
        .collect())
}

#[tauri::command]
pub async fn create_hobby(db: State<'_, Db>, req: CreateHobbyRequest) -> Result<Hobby, String> {
    let id = Uuid::new_v4().to_string();
    let now = now();
    let icon = req.icon.clone().unwrap_or_else(|| "🎨".to_string());
    let color = req.color.clone().unwrap_or_else(|| "#8B5CF6".to_string());
    let status = req
        .status
        .clone()
        .unwrap_or_else(|| "active".to_string());
    db.execute(
        "INSERT INTO hobbies (id, name, description, category, icon, color, status, progress, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        vec![
            id.as_str().into(),
            req.name.as_str().into(),
            req.description.clone().unwrap_or_default().as_str().into(),
            req.category.clone().unwrap_or_default().as_str().into(),
            icon.as_str().into(),
            color.as_str().into(),
            status.as_str().into(),
            (req.progress.unwrap_or(0)).into(),
            req.note.clone().unwrap_or_default().as_str().into(),
            now.as_str().into(),
            now.as_str().into(),
        ],
    )
    .await
    .map_err(|e| format!("创建爱好失败: {}", e))?;
    Ok(Hobby {
        id,
        name: req.name,
        description: req.description.unwrap_or_default(),
        category: req.category.unwrap_or_default(),
        icon,
        color,
        status,
        progress: req.progress.unwrap_or(0),
        note: req.note.unwrap_or_default(),
        created_at: now.clone(),
        updated_at: now,
    })
}

#[tauri::command]
pub async fn update_hobby(db: State<'_, Db>, req: UpdateHobbyRequest) -> Result<(), String> {
    let now = now();
    db.execute(
        "UPDATE hobbies SET name=?, description=?, category=?, status=?, progress=?, note=?, updated_at=? WHERE id=?",
        vec![
            req.name.unwrap_or_default().as_str().into(),
            req.description.unwrap_or_default().as_str().into(),
            req.category.unwrap_or_default().as_str().into(),
            req.status.unwrap_or_default().as_str().into(),
            (req.progress.unwrap_or(0)).into(),
            req.note.unwrap_or_default().as_str().into(),
            now.as_str().into(),
            req.id.as_str().into(),
        ],
    )
    .await
    .map_err(|e| format!("更新爱好失败: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn delete_hobby(db: State<'_, Db>, id: String) -> Result<(), String> {
    db.execute("DELETE FROM hobbies WHERE id = ?", vec![id.as_str().into()])
        .await
        .map_err(|e| format!("删除爱好失败: {}", e))?;
    Ok(())
}
