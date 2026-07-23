use serde_json::{json, Value};
use tauri::State;
use tauri_plugin_sql::Db;

fn this_month() -> String {
    chrono::Local::now().format("%Y-%m").to_string()
}

/// 周期进度聚合：习惯连续天数/完成率、学习进度、本月心情均值、番茄钟累计
#[tauri::command]
pub async fn get_cycle_stats(db: State<'_, Db>) -> Result<Value, String> {
    let habit_rows = db
        .query(
            "SELECT h.id, h.name, h.icon, h.color, h.target_count,
                    (SELECT COUNT(DISTINCT record_date) FROM habit_records hr WHERE hr.habit_id = h.id AND hr.record_date >= date('now','-30 days')) as done_30,
                    (SELECT COUNT(DISTINCT record_date) FROM habit_records hr WHERE hr.habit_id = h.id) as total_days
             FROM habits h",
            &[],
        )
        .await
        .map_err(|e| format!("聚合失败: {}", e))?;

    let habits: Vec<Value> = habit_rows
        .into_iter()
        .map(|r| {
            let target: i64 = r.get("target_count").unwrap_or(1);
            let done_30: i64 = r.get("done_30").unwrap_or(0);
            let rate = if target > 0 {
                ((done_30 as f64) / (target as f64) * 100.0).min(100.0)
            } else {
                0.0
            };
            json!({
                "id": r.get::<String>("id").unwrap_or_default(),
                "name": r.get::<String>("name").unwrap_or_default(),
                "icon": r.get::<String>("icon").unwrap_or_default(),
                "color": r.get::<String>("color").unwrap_or_default(),
                "target_count": target,
                "done_30": done_30,
                "total_days": r.get::<i64>("total_days").unwrap_or(0),
                "rate": rate,
            })
        })
        .collect();

    let learn_rows = db
        .query("SELECT id, title, progress, status FROM learning", &[])
        .await
        .map_err(|e| format!("聚合失败: {}", e))?;
    let learning: Vec<Value> = learn_rows
        .into_iter()
        .map(|r| {
            json!({
                "id": r.get::<String>("id").unwrap_or_default(),
                "title": r.get::<String>("title").unwrap_or_default(),
                "progress": r.get::<f64>("progress").unwrap_or(0.0),
                "status": r.get::<String>("status").unwrap_or_default(),
            })
        })
        .collect();

    let month = this_month();
    let mood_avg: f64 = db
        .query(
            "SELECT AVG(mood) as m FROM moods WHERE log_date LIKE ?",
            vec![format!("{}%", month).as_str().into()],
        )
        .await
        .map_err(|e| format!("聚合失败: {}", e))?
        .first()
        .and_then(|r| r.get("m"))
        .unwrap_or(0.0);

    let pomodoro_total: i64 = db
        .query("SELECT COUNT(*) as c FROM pomodoro_sessions", &[])
        .await
        .map_err(|e| format!("聚合失败: {}", e))?
        .first()
        .and_then(|r| r.get("c"))
        .unwrap_or(0);

    Ok(json!({
        "habits": habits,
        "learning": learning,
        "mood_avg": mood_avg,
        "pomodoro_total": pomodoro_total,
    }))
}
