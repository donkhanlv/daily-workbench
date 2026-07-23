use crate::models::{CreateHabitRequest, Habit};
use serde::{Deserialize, Serialize};
use tauri::State;
use tauri_plugin_sql::Db;
use uuid::Uuid;

fn now() -> String {
    chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

fn today() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}

#[derive(Debug, Serialize, Deserialize)]
pub struct HabitWithStatus {
    pub habit: Habit,
    pub done_today: bool,
    pub streak: i64,
    pub today_count: i32,
}

#[tauri::command]
pub async fn get_habits(db: tauri::State<'_, Db>) -> Result<Vec<HabitWithStatus>, String> {
    let today = today();
    let habits: Vec<Habit> = db
        .query("SELECT * FROM habits ORDER BY created_at ASC", &[])
        .await
        .map_err(|e| format!("查询习惯失败: {}", e))?
        .into_iter()
        .map(|row| Habit {
            id: row.get("id").unwrap_or_default(),
            name: row.get("name").unwrap_or_default(),
            description: row.get("description").unwrap_or_default(),
            frequency: row.get("frequency").unwrap_or_default(),
            target_count: row.get("target_count").unwrap_or(1),
            color: row.get("color").unwrap_or_default(),
            icon: row.get("icon").unwrap_or_default(),
            created_at: row.get("created_at").unwrap_or_default(),
        })
        .collect();

    let mut result = Vec::new();
    for habit in habits {
        // 检查今天是否打卡
        let count_rows = db
            .query(
                "SELECT COALESCE(SUM(count), 0) as cnt FROM habit_records WHERE habit_id = ? AND record_date = ?",
                vec![habit.id.as_str().into(), today.as_str().into()],
            )
            .await
            .map_err(|e| format!("查询打卡状态失败: {}", e))?;
        let today_count: i32 = count_rows
            .first()
            .and_then(|r| r.get("cnt"))
            .unwrap_or(0);
        let done_today = today_count >= habit.target_count;

        // 计算连续打卡天数（简化版）
        let streak_rows = db
            .query(
                "SELECT COUNT(DISTINCT record_date) as cnt FROM habit_records WHERE habit_id = ?",
                vec![habit.id.as_str().into()],
            )
            .await
            .map_err(|e| format!("查询连续天数失败: {}", e))?;
        let streak: i64 = streak_rows
            .first()
            .and_then(|r| r.get("cnt"))
            .unwrap_or(0);

        result.push(HabitWithStatus {
            habit,
            done_today,
            streak,
            today_count,
        });
    }
    Ok(result)
}

#[tauri::command]
pub async fn create_habit(db: tauri::State<'_, Db>, req: CreateHabitRequest) -> Result<Habit, String> {
    let id = Uuid::new_v4().to_string();
    let now = now();

    db.execute(
        "INSERT INTO habits (id, name, description, frequency, target_count, color, icon, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        vec![
            id.as_str().into(),
            req.name.as_str().into(),
            req.description.unwrap_or_default().as_str().into(),
            req.frequency.unwrap_or_else(|| "daily".to_string()).as_str().into(),
            req.target_count.unwrap_or(1).into(),
            req.color.unwrap_or_else(|| "#5B8DEF".to_string()).as_str().into(),
            req.icon.unwrap_or_else(|| "✅".to_string()).as_str().into(),
            now.as_str().into(),
        ],
    )
    .await
    .map_err(|e| format!("创建习惯失败: {}", e))?;

    Ok(Habit {
        id,
        name: req.name,
        description: req.description.unwrap_or_default(),
        frequency: req.frequency.unwrap_or_else(|| "daily".to_string()),
        target_count: req.target_count.unwrap_or(1),
        color: req.color.unwrap_or_else(|| "#5B8DEF".to_string()),
        icon: req.icon.unwrap_or_else(|| "✅".to_string()),
        created_at: now,
    })
}

#[tauri::command]
pub async fn toggle_habit(db: tauri::State<'_, Db>, habit_id: String) -> Result<bool, String> {
    let today = today();
    let now = now();

    // 查询今天是否已经打卡
    let rows = db
        .query(
            "SELECT COUNT(*) as cnt FROM habit_records WHERE habit_id = ? AND record_date = ?",
            vec![habit_id.as_str().into(), today.as_str().into()],
        )
        .await
        .map_err(|e| format!("查询打卡记录失败: {}", e))?;

    let count: i64 = rows.first().and_then(|r| r.get("cnt")).unwrap_or(0);

    if count > 0 {
        // 取消打卡
        db.execute(
            "DELETE FROM habit_records WHERE habit_id = ? AND record_date = ?",
            vec![habit_id.as_str().into(), today.as_str().into()],
        )
        .await
        .map_err(|e| format!("取消打卡失败: {}", e))?;
        Ok(false)
    } else {
        // 打卡
        let record_id = Uuid::new_v4().to_string();
        db.execute(
            "INSERT INTO habit_records (id, habit_id, record_date, count, created_at) VALUES (?, ?, ?, 1, ?)",
            vec![
                record_id.as_str().into(),
                habit_id.as_str().into(),
                today.as_str().into(),
                now.as_str().into(),
            ],
        )
        .await
        .map_err(|e| format!("打卡失败: {}", e))?;
        Ok(true)
    }
}
