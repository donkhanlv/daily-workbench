use crate::models::{CreateMoodRequest, Mood};
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
pub async fn get_moods(
    db: State<'_, Db>,
    month: Option<String>,
) -> Result<Vec<Mood>, String> {
    let query = if let Some(m) = &month {
        format!(
            "SELECT * FROM moods WHERE log_date LIKE '{}%' ORDER BY log_date DESC",
            m
        )
    } else {
        "SELECT * FROM moods ORDER BY log_date DESC".to_string()
    };
    let rows = db
        .query(query, &[])
        .await
        .map_err(|e| format!("查询心情失败: {}", e))?;
    Ok(rows
        .into_iter()
        .map(|r| Mood {
            id: r.get("id").unwrap_or_default(),
            mood: r.get("mood").unwrap_or(3),
            note: r.get("note").unwrap_or_default(),
            tags: r.get("tags").unwrap_or_default(),
            log_date: r.get("log_date").unwrap_or_default(),
            created_at: r.get("created_at").unwrap_or_default(),
        })
        .collect())
}

#[tauri::command]
pub async fn create_mood(db: State<'_, Db>, req: CreateMoodRequest) -> Result<Mood, String> {
    let id = Uuid::new_v4().to_string();
    let now = now();
    let date = req.log_date.clone().unwrap_or_else(today);
    let tags = req.tags.clone().unwrap_or_default();
    let tags_json = serde_json::to_string(&tags).unwrap_or_else(|_| "[]".to_string());
    // 同一天只保留一条记录
    db.execute("DELETE FROM moods WHERE log_date = ?", vec![date.as_str().into()])
        .await
        .map_err(|e| format!("记录心情失败: {}", e))?;
    db.execute(
        "INSERT INTO moods (id, mood, note, tags, log_date, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        vec![
            id.as_str().into(),
            (req.mood).into(),
            req.note.clone().unwrap_or_default().as_str().into(),
            tags_json.as_str().into(),
            date.as_str().into(),
            now.as_str().into(),
        ],
    )
    .await
    .map_err(|e| format!("记录心情失败: {}", e))?;
    Ok(Mood {
        id,
        mood: req.mood,
        note: req.note.unwrap_or_default(),
        tags: tags_json,
        log_date: date,
        created_at: now,
    })
}

#[tauri::command]
pub async fn delete_mood(db: State<'_, Db>, id: String) -> Result<(), String> {
    db.execute("DELETE FROM moods WHERE id = ?", vec![id.as_str().into()])
        .await
        .map_err(|e| format!("删除心情失败: {}", e))?;
    Ok(())
}
