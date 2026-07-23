// ============================================================
// 统一检索：跨模块 SQL 分页检索 + AI 知识库上下文
// 安全要点：模块名 / 表名 / 列名全部来自白名单(ModuleDef)，
// 用户输入的关键词、日期、分类仅以参数绑定(?)传入，杜绝 SQL 注入。
// ============================================================
use serde::{Deserialize, Serialize};
use tauri::State;
use tauri_plugin_sql::{Db, Param};

#[derive(Serialize)]
pub struct SearchItem {
    pub id: String,
    pub module: String,
    pub title: String,
    pub body: String,
    pub item_date: String,
    pub category: String,
}

#[derive(Serialize)]
pub struct SearchResult {
    pub items: Vec<SearchItem>,
    pub total: i64,
    pub page: i64,
    pub page_size: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchRequest {
    #[serde(default)]
    pub modules: Option<Vec<String>>,
    #[serde(default)]
    pub q: Option<String>,
    #[serde(default)]
    pub start_date: Option<String>,
    #[serde(default)]
    pub end_date: Option<String>,
    #[serde(default)]
    pub category: Option<String>,
    #[serde(default)]
    pub page: Option<i64>,
    #[serde(default)]
    pub page_size: Option<i64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeRequest {
    #[serde(default)]
    pub start_date: Option<String>,
    #[serde(default)]
    pub end_date: Option<String>,
    #[serde(default)]
    pub modules: Option<Vec<String>>,
    #[serde(default)]
    pub max_items: Option<i64>,
}

#[derive(Serialize)]
pub struct KnowledgeItem {
    pub module: String,
    pub item_date: String,
    pub title: String,
    pub body: String,
}

#[derive(Serialize)]
pub struct KnowledgeContext {
    pub text: String,
    pub items: Vec<KnowledgeItem>,
    pub total: i64,
}

// 每个模块的白名单定义：表、日期列、标题表达式、正文列、是否带分类列
struct ModuleDef {
    table: &'static str,
    date_col: &'static str,
    title_expr: &'static str,
    body_col: &'static str,
    has_category: bool,
}

fn module_defs() -> Vec<(&'static str, ModuleDef)> {
    vec![
        ("todo", ModuleDef { table: "todos", date_col: "due_date", title_expr: "COALESCE(NULLIF(title,''), description)", body_col: "description", has_category: true }),
        ("event", ModuleDef { table: "events", date_col: "start_date", title_expr: "title", body_col: "description", has_category: true }),
        ("idea", ModuleDef { table: "ideas", date_col: "created_at", title_expr: "content", body_col: "content", has_category: false }),
        ("memo", ModuleDef { table: "memos", date_col: "created_at", title_expr: "COALESCE(NULLIF(title,''), content)", body_col: "content", has_category: false }),
        ("diary", ModuleDef { table: "daily_logs", date_col: "log_date", title_expr: "COALESCE(NULLIF(highlights,''), '每日生活日志')", body_col: "summary", has_category: false }),
        ("learning", ModuleDef { table: "learning", date_col: "start_date", title_expr: "title", body_col: "notes", has_category: true }),
        ("review", ModuleDef { table: "reviews", date_col: "period_start", title_expr: "COALESCE(NULLIF(type,''), '复盘')", body_col: "achievements", has_category: false }),
        ("finance", ModuleDef { table: "transactions", date_col: "created_at", title_expr: "COALESCE(NULLIF(note,''), '记账记录')", body_col: "note", has_category: true }),
        ("mood", ModuleDef { table: "moods", date_col: "log_date", title_expr: "COALESCE(NULLIF(note,''), '心情记录')", body_col: "note", has_category: false }),
        ("health", ModuleDef { table: "health_metrics", date_col: "record_date", title_expr: "metric_type", body_col: "note", has_category: false }),
        ("weekly", ModuleDef { table: "weekly_reports", date_col: "week_start", title_expr: "COALESCE(NULLIF(summary,''), '周报')", body_col: "highlights", has_category: false }),
    ]
}

// 构建统一的 CTE（WITH matched AS (... UNION ALL ...)）以及对应的参数列表
fn build_query(defs: &[(&'static str, ModuleDef)], req: &SearchRequest) -> (String, Vec<Param>) {
    let modules: Vec<String> = match &req.modules {
        Some(m) => m.iter().filter(|x| defs.iter().any(|(k, _)| *k == x.as_str())).cloned().collect(),
        None => defs.iter().map(|(k, _)| k.to_string()).collect(),
    };
    let modules = if modules.is_empty() { defs.iter().map(|(k, _)| k.to_string()).collect() } else { modules };

    let mut union = String::new();
    let mut params: Vec<Param> = Vec::new();
    for (i, m) in modules.iter().enumerate() {
        let def = match defs.iter().find(|(k, _)| *k == m.as_str()) { Some((_, d)) => d, None => continue };
        let cat_expr = if def.has_category { "category" } else { "'' AS category" };
        if i > 0 { union.push_str(" UNION ALL "); }
        union.push_str(&format!(
            "SELECT '{m}' AS module, id, {title} AS title, {body} AS body, {date} AS item_date, {cat} FROM {table}",
            m = m, title = def.title_expr, body = def.body_col, date = def.date_col, cat = cat_expr, table = def.table
        ));
        if let Some(q) = &req.q {
            let q = q.trim();
            if !q.is_empty() {
                // 关键词同时匹配标题与正文
                let like = format!("%{}%", q);
                union.push_str(" WHERE (title LIKE ? OR body LIKE ?)");
                params.push(like.as_str().into());
                params.push(like.as_str().into());
            }
        }
        if let Some(sd) = &req.start_date {
            let sd = sd.trim();
            if !sd.is_empty() {
                union.push_str(&format!(" AND {date} >= ?", date = def.date_col));
                params.push(sd.as_str().into());
            }
        }
        if let Some(ed) = &req.end_date {
            let ed = ed.trim();
            if !ed.is_empty() {
                union.push_str(&format!(" AND {date} <= ?", date = def.date_col));
                params.push(format!("{} 23:59:59", ed).as_str().into());
            }
        }
        if def.has_category {
            if let Some(cat) = &req.category {
                let cat = cat.trim();
                if !cat.is_empty() {
                    union.push_str(" AND category = ?");
                    params.push(cat.as_str().into());
                }
            }
        }
    }
    (format!("WITH matched AS ({}) ", union), params)
}

#[tauri::command]
pub async fn search_items(db: State<'_, Db>, req: SearchRequest) -> Result<SearchResult, String> {
    let defs = module_defs();
    let page = req.page.unwrap_or(1).max(1);
    let page_size = req.page_size.unwrap_or(30).clamp(1, 200);
    let offset = (page - 1) * page_size;

    let (matched, params) = build_query(&defs, &req);

    // 先取总数
    let count_sql = format!("{}SELECT COUNT(*) AS cnt FROM matched", matched);
    let count_rows = db.query(&count_sql, &params).await.map_err(|e| format!("统计检索结果失败: {}", e))?;
    let total: i64 = count_rows.into_iter().next().and_then(|r| r.get("cnt")).unwrap_or(0);

    // 再取本页（按日期倒序，虚拟滚动可无限续拉）
    let page_sql = format!(
        "{}SELECT id, module, title, body, item_date, category FROM matched ORDER BY item_date DESC LIMIT ? OFFSET ?",
        matched
    );
    let mut page_params = params;
    page_params.push((page_size as i32).into());
    page_params.push((offset as i32).into());

    let rows = db.query(&page_sql, &page_params).await.map_err(|e| format!("检索失败: {}", e))?;
    let items: Vec<SearchItem> = rows
        .into_iter()
        .map(|r| SearchItem {
            id: r.get("id").unwrap_or_default(),
            module: r.get("module").unwrap_or_default(),
            title: r.get("title").unwrap_or_default(),
            body: r.get("body").unwrap_or_default(),
            item_date: r.get("item_date").unwrap_or_default(),
            category: r.get("category").unwrap_or_default(),
        })
        .collect();

    Ok(SearchResult { items, total, page, page_size })
}

#[tauri::command]
pub async fn get_knowledge_context(db: State<'_, Db>, req: KnowledgeRequest) -> Result<KnowledgeContext, String> {
    let search_req = SearchRequest {
        modules: req.modules,
        q: None,
        start_date: req.start_date,
        end_date: req.end_date,
        category: None,
        page: Some(1),
        page_size: req.max_items.unwrap_or(300).clamp(1, 1000),
    };
    let defs = module_defs();
    let (matched, params) = build_query(&defs, &search_req);
    let sql = format!(
        "{}SELECT id, module, title, body, item_date, category FROM matched ORDER BY item_date DESC",
        matched
    );
    let rows = db.query(&sql, &params).await.map_err(|e| format!("构建知识库上下文失败: {}", e))?;
    let items: Vec<KnowledgeItem> = rows
        .into_iter()
        .map(|r| KnowledgeItem {
            module: r.get("module").unwrap_or_default(),
            item_date: r.get("item_date").unwrap_or_default(),
            title: r.get("title").unwrap_or_default(),
            body: r.get("body").unwrap_or_default(),
        })
        .collect();
    let total = items.len() as i64;
    let text = build_knowledge_text(&items);
    Ok(KnowledgeContext { text, items, total })
}

fn build_knowledge_text(items: &[KnowledgeItem]) -> String {
    if items.is_empty() {
        return "（暂无记录）".to_string();
    }
    let mut s = String::from("以下是用户在工作台中沉淀的历史记录，可作为回答的底层数据与知识库：\n");
    for it in items {
        let date = if it.item_date.is_empty() { "未知日期".to_string() } else { it.item_date.clone() };
        let title = if it.title.trim().is_empty() { "（无标题）".to_string() } else { it.title.trim().to_string() };
        let body = if it.body.trim().is_empty() { String::new() } else { format!("：{}", it.body.trim()) };
        s.push_str(&format!("- [{}][{}] {}{}\n", it.module, date, title, body));
    }
    s
}
