use crate::models::{CreatePomodoroRequest, PomodoroSession};
use tauri::State;
use tauri_plugin_sql::Db;
use uuid::Uuid;

fn now() -> String {
    chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

#[tauri::command]
pub async fn get_pomodoro_sessions(
    db: State<'_, Db>,
) -> Result<Vec<PomodoroSession>, String> {
    let rows = db
        .query("SELECT * FROM pomodoro_sessions ORDER BY started_at DESC", &[])
        .await
        .map_err(|e| format!("查询番茄钟失败: {}", e))?;
    Ok(rows
        .into_iter()
        .map(|r| PomodoroSession {
            id: r.get("id").unwrap_or_default(),
            todo_id: r.get("todo_id").unwrap_or_default(),
            duration: r.get("duration").unwrap_or(25),
            started_at: r.get("started_at").unwrap_or_default(),
            completed_at: r.get("completed_at").unwrap_or_default(),
            status: r.get("status").unwrap_or_default(),
        })
        .collect())
}

#[tauri::command]
pub async fn create_pomodoro_session(
    db: State<'_, Db>,
    req: CreatePomodoroRequest,
) -> Result<PomodoroSession, String> {
    let id = Uuid::new_v4().to_string();
    let now = now();
    let duration = req.duration.unwrap_or(25);
    db.execute(
        "INSERT INTO pomodoro_sessions (id, todo_id, duration, started_at, completed_at, status) VALUES (?, ?, ?, ?, ?, ?)",
        vec![
            id.as_str().into(),
            req.todo_id.clone().unwrap_or_default().as_str().into(),
            (duration).into(),
            now.as_str().into(),
            now.as_str().into(),
            "completed".to_string().as_str().into(),
        ],
    )
    .await
    .map_err(|e| format!("记录番茄钟失败: {}", e))?;
    Ok(PomodoroSession {
        id,
        todo_id: req.todo_id.unwrap_or_default(),
        duration,
        started_at: now.clone(),
        completed_at: now,
        status: "completed".to_string(),
    })
}

#[tauri::command]
pub async fn delete_pomodoro_session(db: State<'_, Db>, id: String) -> Result<(), String> {
    db.execute("DELETE FROM pomodoro_sessions WHERE id = ?", vec![id.as_str().into()])
        .await
        .map_err(|e| format!("删除番茄钟失败: {}", e))?;
    Ok(())
}
