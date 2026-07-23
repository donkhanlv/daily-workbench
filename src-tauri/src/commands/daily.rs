use crate::models::{DailyLog, SaveDailyLogRequest};
use tauri::State;
use tauri_plugin_sql::Db;
use uuid::Uuid;

fn now() -> String {
    chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

#[tauri::command]
pub async fn get_daily_log(db: tauri::State<'_, Db>, log_date: String) -> Result<Option<DailyLog>, String> {
    let rows = db
        .query(
            "SELECT * FROM daily_logs WHERE log_date = ?",
            vec![log_date.as_str().into()],
        )
        .await
        .map_err(|e| format!("查询日志失败: {}", e))?;

    if let Some(row) = rows.into_iter().next() {
        Ok(Some(DailyLog {
            id: row.get("id").unwrap_or_default(),
            log_date: row.get("log_date").unwrap_or_default(),
            mood: row.get("mood").unwrap_or(3),
            weather: row.get("weather").unwrap_or_default(),
            highlights: row.get("highlights").unwrap_or_default(),
            summary: row.get("summary").unwrap_or_default(),
            gratitude: row.get("gratitude").unwrap_or_default(),
            sleep_hours: row.get("sleep_hours").unwrap_or(0.0),
            water_cups: row.get("water_cups").unwrap_or(0),
            exercise_minutes: row.get("exercise_minutes").unwrap_or(0),
            created_at: row.get("created_at").unwrap_or_default(),
            updated_at: row.get("updated_at").unwrap_or_default(),
        }))
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub async fn save_daily_log(db: tauri::State<'_, Db>, req: SaveDailyLogRequest) -> Result<DailyLog, String> {
    let now = now();

    // 检查是否已存在
    let existing = db
        .query(
            "SELECT id FROM daily_logs WHERE log_date = ?",
            vec![req.log_date.as_str().into()],
        )
        .await
        .map_err(|e| format!("查询日志失败: {}", e))?;

    if let Some(row) = existing.into_iter().next() {
        let id: String = row.get("id").unwrap_or_default();
        // 更新
        db.execute(
            "UPDATE daily_logs SET mood=?, weather=?, highlights=?, summary=?, gratitude=?, sleep_hours=?, water_cups=?, exercise_minutes=?, updated_at=? WHERE id=?",
            vec![
                req.mood.unwrap_or(3).into(),
                req.weather.unwrap_or_default().as_str().into(),
                req.highlights.unwrap_or_default().as_str().into(),
                req.summary.unwrap_or_default().as_str().into(),
                req.gratitude.unwrap_or_default().as_str().into(),
                req.sleep_hours.unwrap_or(0.0).into(),
                req.water_cups.unwrap_or(0).into(),
                req.exercise_minutes.unwrap_or(0).into(),
                now.as_str().into(),
                id.as_str().into(),
            ],
        )
        .await
        .map_err(|e| format!("更新日志失败: {}", e))?;

        get_daily_log(db, req.log_date.clone())
            .await
            .map(|opt| opt.unwrap())
    } else {
        let id = Uuid::new_v4().to_string();
        db.execute(
            "INSERT INTO daily_logs (id, log_date, mood, weather, highlights, summary, gratitude, sleep_hours, water_cups, exercise_minutes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            vec![
                id.as_str().into(),
                req.log_date.as_str().into(),
                req.mood.unwrap_or(3).into(),
                req.weather.unwrap_or_default().as_str().into(),
                req.highlights.unwrap_or_default().as_str().into(),
                req.summary.unwrap_or_default().as_str().into(),
                req.gratitude.unwrap_or_default().as_str().into(),
                req.sleep_hours.unwrap_or(0.0).into(),
                req.water_cups.unwrap_or(0).into(),
                req.exercise_minutes.unwrap_or(0).into(),
                now.as_str().into(),
                now.as_str().into(),
            ],
        )
        .await
        .map_err(|e| format!("创建日志失败: {}", e))?;

        get_daily_log(db, req.log_date)
            .await
            .map(|opt| opt.unwrap())
    }
}
