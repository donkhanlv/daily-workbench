use serde_json::{json, Value};
use tauri::State;
use tauri_plugin_sql::{Db, Param};

#[derive(Clone, Copy)]
enum Kind {
    Str,
    Int,
    Real,
}

/// 15 张业务表的规范化导出/导入规格（列名与 db/mod.rs 的 CREATE TABLE 完全一致）
const SPECS: &[(&str, &[&str], &[Kind])] = &[
    (
        "todos",
        &["id", "title", "description", "priority", "status", "due_date", "due_time", "category", "tags", "created_at", "updated_at", "completed_at"],
        &[Kind::Str, Kind::Str, Kind::Str, Kind::Int, Kind::Str, Kind::Str, Kind::Str, Kind::Str, Kind::Str, Kind::Str, Kind::Str, Kind::Str],
    ),
    (
        "events",
        &["id", "title", "description", "start_date", "end_date", "all_day", "color", "category", "created_at", "updated_at"],
        &[Kind::Str, Kind::Str, Kind::Str, Kind::Str, Kind::Str, Kind::Int, Kind::Str, Kind::Str, Kind::Str, Kind::Str],
    ),
    (
        "ideas",
        &["id", "content", "source", "tags", "is_favorite", "created_at"],
        &[Kind::Str, Kind::Str, Kind::Str, Kind::Str, Kind::Int, Kind::Str],
    ),
    (
        "daily_logs",
        &["id", "log_date", "mood", "weather", "highlights", "summary", "gratitude", "sleep_hours", "water_cups", "exercise_minutes", "created_at", "updated_at"],
        &[Kind::Str, Kind::Str, Kind::Int, Kind::Str, Kind::Str, Kind::Str, Kind::Str, Kind::Real, Kind::Int, Kind::Int, Kind::Str, Kind::Str],
    ),
    (
        "habits",
        &["id", "name", "description", "frequency", "target_count", "color", "icon", "created_at"],
        &[Kind::Str, Kind::Str, Kind::Str, Kind::Str, Kind::Int, Kind::Str, Kind::Str, Kind::Str],
    ),
    (
        "habit_records",
        &["id", "habit_id", "record_date", "count", "note", "created_at"],
        &[Kind::Str, Kind::Str, Kind::Str, Kind::Int, Kind::Str, Kind::Str],
    ),
    (
        "memos",
        &["id", "title", "content", "color", "is_pinned", "remind_at", "created_at", "updated_at"],
        &[Kind::Str, Kind::Str, Kind::Str, Kind::Str, Kind::Int, Kind::Str, Kind::Str, Kind::Str],
    ),
    (
        "learning",
        &["id", "title", "type", "subject", "progress", "total_pages", "current_page", "notes", "start_date", "target_date", "status", "created_at", "updated_at"],
        &[Kind::Str, Kind::Str, Kind::Str, Kind::Str, Kind::Real, Kind::Int, Kind::Int, Kind::Str, Kind::Str, Kind::Str, Kind::Str, Kind::Str, Kind::Str],
    ),
    (
        "reviews",
        &["id", "type", "period_start", "period_end", "achievements", "improvements", "goals_next", "rating", "created_at"],
        &[Kind::Str, Kind::Str, Kind::Str, Kind::Str, Kind::Str, Kind::Str, Kind::Str, Kind::Int, Kind::Str],
    ),
    (
        "transactions",
        &["id", "type", "amount", "category", "note", "record_date", "created_at"],
        &[Kind::Str, Kind::Str, Kind::Real, Kind::Str, Kind::Str, Kind::Str, Kind::Str],
    ),
    (
        "moods",
        &["id", "mood", "note", "tags", "log_date", "created_at"],
        &[Kind::Str, Kind::Int, Kind::Str, Kind::Str, Kind::Str, Kind::Str],
    ),
    (
        "health_metrics",
        &["id", "metric_type", "value", "unit", "note", "record_date", "created_at"],
        &[Kind::Str, Kind::Str, Kind::Real, Kind::Str, Kind::Str, Kind::Str, Kind::Str],
    ),
    (
        "hobbies",
        &["id", "name", "description", "category", "icon", "color", "status", "progress", "note", "created_at", "updated_at"],
        &[Kind::Str, Kind::Str, Kind::Str, Kind::Str, Kind::Str, Kind::Str, Kind::Str, Kind::Int, Kind::Str, Kind::Str, Kind::Str],
    ),
    (
        "pomodoro_sessions",
        &["id", "todo_id", "duration", "started_at", "completed_at", "status"],
        &[Kind::Str, Kind::Str, Kind::Int, Kind::Str, Kind::Str, Kind::Str],
    ),
    (
        "weekly_reports",
        &["id", "week_start", "week_end", "summary", "highlights", "mood_avg", "todo_done", "created_at"],
        &[Kind::Str, Kind::Str, Kind::Str, Kind::Str, Kind::Str, Kind::Real, Kind::Int, Kind::Str],
    ),
    (
        "attachments",
        &["id", "module", "record_id", "name", "data", "created_at"],
        &[Kind::Str, Kind::Str, Kind::Str, Kind::Str, Kind::Str, Kind::Str],
    ),
];

fn now_str() -> String {
    chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

/// 读取整表并序列化为 JSON 数组（忠实保留原始列值）
async fn dump_table(db: &Db, table: &str, cols: &[&str], kinds: &[Kind]) -> Result<Value, String> {
    let rows = db
        .query(&format!("SELECT * FROM {}", table), &[])
        .await
        .map_err(|e| format!("读取{}失败: {}", table, e))?;
    let mut out: Vec<Value> = Vec::new();
    for row in rows {
        let mut obj = serde_json::Map::new();
        for (c, k) in cols.iter().zip(kinds.iter()) {
            let v = match *k {
                Kind::Str => Value::String(row.get::<String>(*c).unwrap_or_default()),
                Kind::Int => Value::Number((row.get::<i32>(*c).unwrap_or_default() as i64).into()),
                Kind::Real => {
                    let n = row.get::<f64>(*c).unwrap_or_default();
                    serde_json::Number::from_f64(n).map(Value::Number).unwrap_or(Value::Null)
                }
            };
            obj.insert((*c).to_string(), v);
        }
        out.push(Value::Object(obj));
    }
    Ok(Value::Array(out))
}

fn to_param(v: &Value, kind: Kind) -> Param {
    match kind {
        Kind::Str => v.as_str().unwrap_or("").into(),
        Kind::Int => (v.as_i64().unwrap_or(0) as i32).into(),
        Kind::Real => (v.as_f64().unwrap_or(0.0)).into(),
    }
}

/// 清空整表后按原始数据还原（保留原 ID 与时间戳）
async fn load_table(db: &Db, table: &str, cols: &[&str], kinds: &[Kind], rows: &[Value]) -> Result<(), String> {
    db.execute(&format!("DELETE FROM {}", table), vec![])
        .await
        .map_err(|e| format!("清空{}失败: {}", table, e))?;
    for row in rows {
        let mut params: Vec<Param> = Vec::new();
        for (c, k) in cols.iter().zip(kinds.iter()) {
            let val = row.get(*c).cloned().unwrap_or(Value::Null);
            params.push(to_param(&val, *k));
        }
        let placeholders: String = (0..cols.len()).map(|_| "?").collect::<Vec<&str>>().join(", ");
        let sql = format!("INSERT INTO {} ({}) VALUES ({})", table, cols.join(", "), placeholders);
        db.execute(&sql, params)
            .await
            .map_err(|e| format!("导入{}失败: {}", table, e))?;
    }
    Ok(())
}

#[tauri::command]
pub async fn export_data(db: State<'_, Db>) -> Result<Value, String> {
    let mut data = serde_json::Map::new();
    for spec in SPECS {
        let (table, cols, kinds) = *spec;
        let arr = dump_table(db.inner(), table, cols, kinds).await?;
        data.insert(table.to_string(), arr);
    }
    Ok(json!({ "version": 1, "exported_at": now_str(), "data": Value::Object(data) }))
}

#[tauri::command]
pub async fn import_data(db: State<'_, Db>, payload: Value, _mode: Option<String>) -> Result<Value, String> {
    let data = payload.as_object().ok_or("无效的备份数据")?;
    for spec in SPECS {
        let (table, cols, kinds) = *spec;
        let rows = data
            .get(table)
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        load_table(db.inner(), table, cols, kinds, &rows).await?;
    }
    Ok(json!({ "ok": true }))
}
