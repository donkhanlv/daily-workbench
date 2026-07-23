use crate::models::{CreateTransactionRequest, Transaction};
use serde::Serialize;
use tauri::State;
use tauri_plugin_sql::Db;
use uuid::Uuid;

fn now() -> String {
    chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

fn today() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}

#[derive(Debug, Serialize)]
pub struct FinanceSummary {
    pub month: String,
    pub income: f64,
    pub expense: f64,
    pub balance: f64,
}

#[tauri::command]
pub async fn get_transactions(
    db: State<'_, Db>,
    month: Option<String>,
) -> Result<Vec<Transaction>, String> {
    let query = if let Some(m) = &month {
        format!(
            "SELECT * FROM transactions WHERE record_date LIKE '{}%' ORDER BY record_date DESC",
            m
        )
    } else {
        "SELECT * FROM transactions ORDER BY record_date DESC".to_string()
    };
    let rows = db
        .query(query, &[])
        .await
        .map_err(|e| format!("查询账目失败: {}", e))?;
    Ok(rows
        .into_iter()
        .map(|r| Transaction {
            id: r.get("id").unwrap_or_default(),
            r#type: r.get("type").unwrap_or_default(),
            amount: r.get("amount").unwrap_or(0.0),
            category: r.get("category").unwrap_or_default(),
            note: r.get("note").unwrap_or_default(),
            record_date: r.get("record_date").unwrap_or_default(),
            created_at: r.get("created_at").unwrap_or_default(),
        })
        .collect())
}

#[tauri::command]
pub async fn create_transaction(
    db: State<'_, Db>,
    req: CreateTransactionRequest,
) -> Result<Transaction, String> {
    let id = Uuid::new_v4().to_string();
    let now = now();
    let date = req.record_date.clone().unwrap_or_else(today);
    db.execute(
        "INSERT INTO transactions (id, type, amount, category, note, record_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        vec![
            id.as_str().into(),
            req.r#type.as_str().into(),
            req.amount.into(),
            req.category.as_str().into(),
            req.note.clone().unwrap_or_default().as_str().into(),
            date.as_str().into(),
            now.as_str().into(),
        ],
    )
    .await
    .map_err(|e| format!("记账失败: {}", e))?;
    Ok(Transaction {
        id,
        r#type: req.r#type,
        amount: req.amount,
        category: req.category,
        note: req.note.unwrap_or_default(),
        record_date: date,
        created_at: now,
    })
}

#[tauri::command]
pub async fn delete_transaction(db: State<'_, Db>, id: String) -> Result<(), String> {
    db.execute("DELETE FROM transactions WHERE id = ?", vec![id.as_str().into()])
        .await
        .map_err(|e| format!("删除账目失败: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn get_finance_summary(
    db: State<'_, Db>,
    month: Option<String>,
) -> Result<FinanceSummary, String> {
    let m = month.unwrap_or_else(today);
    let rows = db
        .query(
            "SELECT type, SUM(amount) as total FROM transactions WHERE record_date LIKE ? GROUP BY type",
            vec![format!("{}%", m).as_str().into()],
        )
        .await
        .map_err(|e| format!("统计失败: {}", e))?;
    let mut income = 0.0_f64;
    let mut expense = 0.0_f64;
    for r in rows {
        let t: String = r.get("type").unwrap_or_default();
        let total: f64 = r.get("total").unwrap_or(0.0);
        if t == "income" {
            income += total;
        } else {
            expense += total;
        }
    }
    Ok(FinanceSummary {
        month: m,
        income,
        expense,
        balance: income - expense,
    })
}
