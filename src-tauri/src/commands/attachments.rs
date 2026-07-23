use crate::models::Attachment;
use tauri::State;
use tauri_plugin_sql::{Db, Param};
use uuid::Uuid;

fn now_str() -> String {
    chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

/// 列出某模块（可选按 record_id）的附件，按时间倒序
#[tauri::command]
pub async fn list_attachments(
    db: State<'_, Db>,
    module: String,
    record_id: Option<String>,
) -> Result<Vec<Attachment>, String> {
    let rows = db
        .query(
            "SELECT * FROM attachments WHERE module = ?",
            vec![module.as_str().into()],
        )
        .await
        .map_err(|e| format!("查询附件失败: {}", e))?;

    let mut out: Vec<Attachment> = rows
        .into_iter()
        .filter_map(|row| {
            let rid: String = row.get("record_id").unwrap_or_default();
            if let Some(ref want) = record_id {
                if &rid != want {
                    return None;
                }
            }
            Some(Attachment {
                id: row.get("id").unwrap_or_default(),
                module: row.get("module").unwrap_or_default(),
                record_id: rid,
                name: row.get("name").unwrap_or_default(),
                data: row.get("data").unwrap_or_default(),
                created_at: row.get("created_at").unwrap_or_default(),
            })
        })
        .collect();
    out.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(out)
}

/// 保存一条附件（截图/图片，data 为 dataURL 文本）
#[tauri::command]
pub async fn save_attachment(
    db: State<'_, Db>,
    module: String,
    record_id: String,
    name: String,
    data: String,
) -> Result<Attachment, String> {
    let id = Uuid::new_v4().to_string();
    let ts = now_str();
    db.execute(
        "INSERT INTO attachments (id, module, record_id, name, data, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        vec![
            id.as_str().into(),
            module.as_str().into(),
            record_id.as_str().into(),
            name.as_str().into(),
            data.as_str().into(),
            ts.as_str().into(),
        ],
    )
    .await
    .map_err(|e| format!("保存附件失败: {}", e))?;
    Ok(Attachment {
        id,
        module,
        record_id,
        name,
        data,
        created_at: ts,
    })
}

/// 删除一条附件
#[tauri::command]
pub async fn delete_attachment(db: State<'_, Db>, id: String) -> Result<(), String> {
    db.execute(
        "DELETE FROM attachments WHERE id = ?",
        vec![id.as_str().into()],
    )
    .await
    .map_err(|e| format!("删除附件失败: {}", e))?;
    Ok(())
}
