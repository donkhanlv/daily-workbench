use crate::models::{CreateTodoRequest, Todo, UpdateTodoRequest};
use tauri::State;
use tauri_plugin_sql::Db;
use uuid::Uuid;

fn now() -> String {
    chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

fn today() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}

#[tauri::command]
pub async fn get_todos(db: tauri::State<'_, Db>, status: Option<String>) -> Result<Vec<Todo>, String> {
    let query = if let Some(ref s) = status {
        format!("SELECT * FROM todos WHERE status = '{}' ORDER BY priority DESC, created_at DESC", s)
    } else {
        "SELECT * FROM todos ORDER BY priority DESC, created_at DESC".to_string()
    };
    
    db.query(query, &[])
        .await
        .map_err(|e| format!("查询待办失败: {}", e))
        .map(|rows| {
            rows.into_iter().map(|row| Todo {
                id: row.get("id").unwrap_or_default(),
                title: row.get("title").unwrap_or_default(),
                description: row.get("description").unwrap_or_default(),
                priority: row.get("priority").unwrap_or(0),
                status: row.get("status").unwrap_or_default(),
                due_date: row.get("due_date").unwrap_or_default(),
                due_time: row.get("due_time").unwrap_or_default(),
                category: row.get("category").unwrap_or_default(),
                tags: row.get("tags").unwrap_or_default(),
                created_at: row.get("created_at").unwrap_or_default(),
                updated_at: row.get("updated_at").unwrap_or_default(),
                completed_at: row.get("completed_at").unwrap_or_default(),
            }).collect()
        })
}

#[tauri::command]
pub async fn create_todo(db: tauri::State<'_, Db>, req: CreateTodoRequest) -> Result<Todo, String> {
    let id = Uuid::new_v4().to_string();
    let now = now();
    let tags = req.tags.unwrap_or_default();
    let tags_json = serde_json::to_string(&tags).unwrap_or_else(|_| "[]".to_string());

    db.execute(
        "INSERT INTO todos (id, title, description, priority, due_date, due_time, category, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        vec![
            id.as_str().into(),
            req.title.as_str().into(),
            req.description.unwrap_or_default().as_str().into(),
            (req.priority.unwrap_or(0)).into(),
            req.due_date.unwrap_or_default().as_str().into(),
            req.due_time.unwrap_or_default().as_str().into(),
            req.category.unwrap_or_default().as_str().into(),
            tags_json.as_str().into(),
            now.as_str().into(),
            now.as_str().into(),
        ],
    )
    .await
    .map_err(|e| format!("创建待办失败: {}", e))?;

    Ok(Todo {
        id,
        title: req.title,
        description: req.description.unwrap_or_default(),
        priority: req.priority.unwrap_or(0),
        status: "pending".to_string(),
        due_date: req.due_date.unwrap_or_default(),
        due_time: req.due_time.unwrap_or_default(),
        category: req.category.unwrap_or_default(),
        tags: tags_json,
        created_at: now.clone(),
        updated_at: now,
        completed_at: String::new(),
    })
}

#[tauri::command]
pub async fn update_todo(db: tauri::State<'_, Db>, req: UpdateTodoRequest) -> Result<(), String> {
    let now = now();
    db.execute(
        "UPDATE todos SET title=?, description=?, priority=?, status=?, due_date=?, due_time=?, category=?, updated_at=? WHERE id=?",
        vec![
            req.title.unwrap_or_default().as_str().into(),
            req.description.unwrap_or_default().as_str().into(),
            req.priority.unwrap_or(0).into(),
            req.status.unwrap_or_default().as_str().into(),
            req.due_date.unwrap_or_default().as_str().into(),
            req.due_time.unwrap_or_default().as_str().into(),
            req.category.unwrap_or_default().as_str().into(),
            now.as_str().into(),
            req.id.as_str().into(),
        ],
    )
    .await
    .map_err(|e| format!("更新待办失败: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn delete_todo(db: tauri::State<'_, Db>, id: String) -> Result<(), String> {
    db.execute("DELETE FROM todos WHERE id = ?", vec![id.as_str().into()])
        .await
        .map_err(|e| format!("删除待办失败: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn toggle_todo(db: tauri::State<'_, Db>, id: String) -> Result<(), String> {
    let now = now();
    // 先查询当前状态
    let rows = db
        .query("SELECT status FROM todos WHERE id = ?", vec![id.as_str().into()])
        .await
        .map_err(|e| format!("查询待办失败: {}", e))?;

    if let Some(row) = rows.first() {
        let status: String = row.get("status").unwrap_or_default();
        if status == "pending" {
            db.execute(
                "UPDATE todos SET status='done', completed_at=?, updated_at=? WHERE id=?",
                vec![now.as_str().into(), now.as_str().into(), id.as_str().into()],
            )
            .await
            .map_err(|e| format!("更新待办失败: {}", e))?;
        } else {
            db.execute(
                "UPDATE todos SET status='pending', completed_at='', updated_at=? WHERE id=?",
                vec![now.as_str().into(), id.as_str().into()],
            )
            .await
            .map_err(|e| format!("更新待办失败: {}", e))?;
        }
    }
    Ok(())
}
