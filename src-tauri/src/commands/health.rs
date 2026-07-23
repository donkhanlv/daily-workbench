use crate::models::{CreateHealthMetricRequest, HealthMetric};
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
pub async fn get_health_metrics(
    db: State<'_, Db>,
    metric_type: Option<String>,
) -> Result<Vec<HealthMetric>, String> {
    let query = if let Some(t) = &metric_type {
        format!(
            "SELECT * FROM health_metrics WHERE metric_type = '{}' ORDER BY record_date DESC",
            t
        )
    } else {
        "SELECT * FROM health_metrics ORDER BY record_date DESC".to_string()
    };
    let rows = db
        .query(query, &[])
        .await
        .map_err(|e| format!("查询健康数据失败: {}", e))?;
    Ok(rows
        .into_iter()
        .map(|r| HealthMetric {
            id: r.get("id").unwrap_or_default(),
            metric_type: r.get("metric_type").unwrap_or_default(),
            value: r.get("value").unwrap_or(0.0),
            unit: r.get("unit").unwrap_or_default(),
            note: r.get("note").unwrap_or_default(),
            record_date: r.get("record_date").unwrap_or_default(),
            created_at: r.get("created_at").unwrap_or_default(),
        })
        .collect())
}

#[tauri::command]
pub async fn create_health_metric(
    db: State<'_, Db>,
    req: CreateHealthMetricRequest,
) -> Result<HealthMetric, String> {
    let id = Uuid::new_v4().to_string();
    let now = now();
    let date = req.record_date.clone().unwrap_or_else(today);
    db.execute(
        "INSERT INTO health_metrics (id, metric_type, value, unit, note, record_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        vec![
            id.as_str().into(),
            req.metric_type.as_str().into(),
            req.value.into(),
            req.unit.clone().unwrap_or_default().as_str().into(),
            req.note.clone().unwrap_or_default().as_str().into(),
            date.as_str().into(),
            now.as_str().into(),
        ],
    )
    .await
    .map_err(|e| format!("记录健康数据失败: {}", e))?;
    Ok(HealthMetric {
        id,
        metric_type: req.metric_type,
        value: req.value,
        unit: req.unit.unwrap_or_default(),
        note: req.note.unwrap_or_default(),
        record_date: date,
        created_at: now,
    })
}

#[tauri::command]
pub async fn delete_health_metric(db: State<'_, Db>, id: String) -> Result<(), String> {
    db.execute("DELETE FROM health_metrics WHERE id = ?", vec![id.as_str().into()])
        .await
        .map_err(|e| format!("删除健康数据失败: {}", e))?;
    Ok(())
}
