use crate::models::{CreateReviewRequest, Review};
use serde::Deserialize;
use tauri::State;
use tauri_plugin_sql::Db;
use uuid::Uuid;

fn now() -> String {
    chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

#[derive(Debug, Deserialize)]
struct UpdateReviewRequest {
    id: String,
    achievements: Option<String>,
    improvements: Option<String>,
    goals_next: Option<String>,
    rating: Option<i32>,
}

#[tauri::command]
pub async fn get_reviews(db: State<'_, Db>) -> Result<Vec<Review>, String> {
    let rows = db.query("SELECT * FROM reviews ORDER BY created_at DESC", &[])
        .await
        .map_err(|e| format!("查询复盘失败: {}", e))?;
    Ok(rows
        .into_iter()
        .map(|r| Review {
            id: r.get("id").unwrap_or_default(),
            r#type: r.get("type").unwrap_or_default(),
            period_start: r.get("period_start").unwrap_or_default(),
            period_end: r.get("period_end").unwrap_or_default(),
            achievements: r.get("achievements").unwrap_or_default(),
            improvements: r.get("improvements").unwrap_or_default(),
            goals_next: r.get("goals_next").unwrap_or_default(),
            rating: r.get("rating").unwrap_or(5),
            created_at: r.get("created_at").unwrap_or_default(),
        })
        .collect())
}

#[tauri::command]
pub async fn create_review(db: State<'_, Db>, req: CreateReviewRequest) -> Result<Review, String> {
    let id = Uuid::new_v4().to_string();
    let now = now();
    db.execute(
        "INSERT INTO reviews (id, type, period_start, period_end, achievements, improvements, goals_next, rating, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        vec![
            id.as_str().into(),
            req.r#type.as_str().into(),
            req.period_start.as_str().into(),
            req.period_end.as_str().into(),
            req.achievements.clone().unwrap_or_default().as_str().into(),
            req.improvements.clone().unwrap_or_default().as_str().into(),
            req.goals_next.clone().unwrap_or_default().as_str().into(),
            (req.rating.unwrap_or(5)).into(),
            now.as_str().into(),
        ],
    )
    .await
    .map_err(|e| format!("创建复盘失败: {}", e))?;
    Ok(Review {
        id,
        r#type: req.r#type,
        period_start: req.period_start,
        period_end: req.period_end,
        achievements: req.achievements.unwrap_or_default(),
        improvements: req.improvements.unwrap_or_default(),
        goals_next: req.goals_next.unwrap_or_default(),
        rating: req.rating.unwrap_or(5),
        created_at: now,
    })
}

#[tauri::command]
pub async fn update_review(db: State<'_, Db>, req: UpdateReviewRequest) -> Result<(), String> {
    db.execute(
        "UPDATE reviews SET achievements=?, improvements=?, goals_next=?, rating=? WHERE id=?",
        vec![
            req.achievements.unwrap_or_default().as_str().into(),
            req.improvements.unwrap_or_default().as_str().into(),
            req.goals_next.unwrap_or_default().as_str().into(),
            (req.rating.unwrap_or(5)).into(),
            req.id.as_str().into(),
        ],
    )
    .await
    .map_err(|e| format!("更新复盘失败: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn delete_review(db: State<'_, Db>, id: String) -> Result<(), String> {
    db.execute("DELETE FROM reviews WHERE id = ?", vec![id.as_str().into()])
        .await
        .map_err(|e| format!("删除复盘失败: {}", e))?;
    Ok(())
}
