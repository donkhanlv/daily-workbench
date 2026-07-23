use crate::models::DashboardStats;
use tauri::State;
use tauri_plugin_sql::Db;

fn today() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}

fn this_month() -> String {
    chrono::Local::now().format("%Y-%m").to_string()
}

#[tauri::command]
pub async fn get_dashboard_stats(db: State<'_, Db>) -> Result<DashboardStats, String> {
    let today = today();
    let month = this_month();

    // 习惯最长连续天数（截至今天，逐日往前数）
    let habit_streak = compute_streak(&db).await?;

    // 进行中的学习项
    let learning_count: i64 = count(
        &db,
        "SELECT COUNT(*) as cnt FROM learning WHERE status = 'active'",
        vec![],
    )
    .await?;

    // 本月灵感
    let this_month_ideas: i64 = count(
        &db,
        "SELECT COUNT(*) as cnt FROM ideas WHERE created_at LIKE ?",
        vec![format!("{}%", month).as_str().into()],
    )
    .await?;

    // 今日心情
    let today_mood: Option<i32> = db
        .query(
            "SELECT mood FROM daily_logs WHERE log_date = ?",
            vec![today.as_str().into()],
        )
        .await
        .map_err(|e| format!("统计失败: {}", e))?
        .into_iter()
        .next()
        .and_then(|r| r.get("mood"));

    Ok(DashboardStats {
        habit_streak,
        learning_count,
        this_month_ideas,
        today_mood,
    })
}

/// 从 habit_records 计算截至今天的连续打卡天数（当前连击）
async fn compute_streak(db: &Db) -> Result<i64, String> {
    let dates: Vec<String> = db
        .query("SELECT DISTINCT record_date FROM habit_records", vec![])
        .await
        .map_err(|e| format!("统计失败: {}", e))?
        .into_iter()
        .filter_map(|r| r.get::<String>("record_date"))
        .collect();
    let set: std::collections::HashSet<String> = dates.into_iter().collect();

    let now = chrono::Local::now();
    let mut d =
        chrono::NaiveDate::from_ymd_opt(now.year(), now.month(), now.day()).unwrap_or_else(|| {
            chrono::Local::now().naive_local().date()
        });
    let mut streak = 0i64;
    loop {
        let key = d.format("%Y-%m-%d").to_string();
        if set.contains(&key) {
            streak += 1;
            d = match d.pred_opt() {
                Some(p) => p,
                None => break,
            };
        } else {
            break;
        }
    }
    Ok(streak)
}

async fn count(
    db: &Db,
    sql: &str,
    params: Vec<tauri_plugin_sql::Param>,
) -> Result<i64, String> {
    let v: Option<i64> = db
        .query(sql, params)
        .await
        .map_err(|e| format!("统计失败: {}", e))?
        .first()
        .and_then(|r| r.get("cnt"));
    Ok(v.unwrap_or(0))
}
