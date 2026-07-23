use crate::models::{CreateWeeklyReportRequest, WeeklyReport};
use serde::Deserialize;
use tauri::State;
use tauri_plugin_sql::Db;
use uuid::Uuid;

fn now() -> String {
    chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

#[derive(Debug, Deserialize)]
struct GenerateWeeklyRequest {
    week_start: String,
    week_end: String,
}

#[tauri::command]
pub async fn get_weekly_reports(db: State<'_, Db>) -> Result<Vec<WeeklyReport>, String> {
    let rows = db
        .query("SELECT * FROM weekly_reports ORDER BY created_at DESC", &[])
        .await
        .map_err(|e| format!("查询周报失败: {}", e))?;
    Ok(rows
        .into_iter()
        .map(|r| WeeklyReport {
            id: r.get("id").unwrap_or_default(),
            week_start: r.get("week_start").unwrap_or_default(),
            week_end: r.get("week_end").unwrap_or_default(),
            summary: r.get("summary").unwrap_or_default(),
            highlights: r.get("highlights").unwrap_or_default(),
            mood_avg: r.get("mood_avg").unwrap_or(0.0),
            todo_done: r.get("todo_done").unwrap_or(0),
            created_at: r.get("created_at").unwrap_or_default(),
        })
        .collect())
}

#[tauri::command]
pub async fn create_weekly_report(
    db: State<'_, Db>,
    req: CreateWeeklyReportRequest,
) -> Result<WeeklyReport, String> {
    let id = Uuid::new_v4().to_string();
    let now = now();
    db.execute(
        "INSERT INTO weekly_reports (id, week_start, week_end, summary, highlights, mood_avg, todo_done, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        vec![
            id.as_str().into(),
            req.week_start.as_str().into(),
            req.week_end.as_str().into(),
            req.summary.clone().unwrap_or_default().as_str().into(),
            req.highlights.clone().unwrap_or_default().as_str().into(),
            (req.mood_avg.unwrap_or(0.0)).into(),
            (req.todo_done.unwrap_or(0)).into(),
            now.as_str().into(),
        ],
    )
    .await
    .map_err(|e| format!("创建周报失败: {}", e))?;
    Ok(WeeklyReport {
        id,
        week_start: req.week_start,
        week_end: req.week_end,
        summary: req.summary.unwrap_or_default(),
        highlights: req.highlights.unwrap_or_default(),
        mood_avg: req.mood_avg.unwrap_or(0.0),
        todo_done: req.todo_done.unwrap_or(0),
        created_at: now,
    })
}

#[tauri::command]
pub async fn generate_weekly_report(
    db: State<'_, Db>,
    req: GenerateWeeklyRequest,
) -> Result<WeeklyReport, String> {
    let todo_done: i64 = db
        .query(
            "SELECT COUNT(*) as c FROM todos WHERE due_date BETWEEN ? AND ? AND status='done'",
            vec![req.week_start.as_str().into(), req.week_end.as_str().into()],
        )
        .await
        .map_err(|e| format!("周报生成失败: {}", e))?
        .first()
        .and_then(|r| r.get("c"))
        .unwrap_or(0);
    let mood_avg: f64 = db
        .query(
            "SELECT AVG(mood) as m FROM moods WHERE log_date BETWEEN ? AND ?",
            vec![req.week_start.as_str().into(), req.week_end.as_str().into()],
        )
        .await
        .map_err(|e| format!("周报生成失败: {}", e))?
        .first()
        .and_then(|r| r.get("m"))
        .unwrap_or(0.0);
    let id = Uuid::new_v4().to_string();
    let now = now();
    let summary = format!(
        "本周完成待办 {} 项，平均心情 {:.1}/5。继续保持节奏，下周再接再厉！",
        todo_done, mood_avg
    );
    db.execute(
        "INSERT INTO weekly_reports (id, week_start, week_end, summary, highlights, mood_avg, todo_done, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        vec![
            id.as_str().into(),
            req.week_start.as_str().into(),
            req.week_end.as_str().into(),
            summary.as_str().into(),
            "".to_string().as_str().into(),
            mood_avg.into(),
            (todo_done as i32).into(),
            now.as_str().into(),
        ],
    )
    .await
    .map_err(|e| format!("周报生成失败: {}", e))?;
    Ok(WeeklyReport {
        id,
        week_start: req.week_start,
        week_end: req.week_end,
        summary,
        highlights: String::new(),
        mood_avg,
        todo_done: todo_done as i32,
        created_at: now,
    })
}

#[tauri::command]
pub async fn delete_weekly_report(db: State<'_, Db>, id: String) -> Result<(), String> {
    db.execute("DELETE FROM weekly_reports WHERE id = ?", vec![id.as_str().into()])
        .await
        .map_err(|e| format!("删除周报失败: {}", e))?;
    Ok(())
}
