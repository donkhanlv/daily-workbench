use tauri::AppHandle;
use tauri_plugin_sql::{Migration, MigrationKind};

pub async fn initialize_database(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let db = tauri_plugin_sql::Db::new("sqlite:workbench.db".to_string(), app)?;

    let migrations = vec![
        Migration {
            version: 1,
            description: "创建核心表结构",
            sql: "
                CREATE TABLE IF NOT EXISTS todos (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    description TEXT DEFAULT '',
                    priority INTEGER DEFAULT 0,
                    status TEXT DEFAULT 'pending',
                    due_date TEXT DEFAULT '',
                    due_time TEXT DEFAULT '',
                    category TEXT DEFAULT '',
                    tags TEXT DEFAULT '[]',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    completed_at TEXT DEFAULT ''
                );

                CREATE TABLE IF NOT EXISTS events (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    description TEXT DEFAULT '',
                    start_date TEXT NOT NULL,
                    end_date TEXT NOT NULL,
                    all_day INTEGER DEFAULT 0,
                    color TEXT DEFAULT '#5B8DEF',
                    category TEXT DEFAULT '',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS ideas (
                    id TEXT PRIMARY KEY,
                    content TEXT NOT NULL,
                    source TEXT DEFAULT '',
                    tags TEXT DEFAULT '[]',
                    is_favorite INTEGER DEFAULT 0,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS daily_logs (
                    id TEXT PRIMARY KEY,
                    log_date TEXT NOT NULL UNIQUE,
                    mood INTEGER DEFAULT 3,
                    weather TEXT DEFAULT '',
                    highlights TEXT DEFAULT '',
                    summary TEXT DEFAULT '',
                    gratitude TEXT DEFAULT '',
                    sleep_hours REAL DEFAULT 0,
                    water_cups INTEGER DEFAULT 0,
                    exercise_minutes INTEGER DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS habits (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT DEFAULT '',
                    frequency TEXT DEFAULT 'daily',
                    target_count INTEGER DEFAULT 1,
                    color TEXT DEFAULT '#5B8DEF',
                    icon TEXT DEFAULT '✅',
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS habit_records (
                    id TEXT PRIMARY KEY,
                    habit_id TEXT NOT NULL,
                    record_date TEXT NOT NULL,
                    count INTEGER DEFAULT 1,
                    note TEXT DEFAULT '',
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (habit_id) REFERENCES habits(id)
                );

                CREATE TABLE IF NOT EXISTS memos (
                    id TEXT PRIMARY KEY,
                    title TEXT DEFAULT '',
                    content TEXT NOT NULL,
                    color TEXT DEFAULT '#FFF9C4',
                    is_pinned INTEGER DEFAULT 0,
                    remind_at TEXT DEFAULT '',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS learning (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    type TEXT DEFAULT '',
                    subject TEXT DEFAULT '',
                    progress REAL DEFAULT 0,
                    total_pages INTEGER DEFAULT 0,
                    current_page INTEGER DEFAULT 0,
                    notes TEXT DEFAULT '',
                    start_date TEXT DEFAULT '',
                    target_date TEXT DEFAULT '',
                    status TEXT DEFAULT 'active',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS reviews (
                    id TEXT PRIMARY KEY,
                    type TEXT NOT NULL,
                    period_start TEXT NOT NULL,
                    period_end TEXT NOT NULL,
                    achievements TEXT DEFAULT '',
                    improvements TEXT DEFAULT '',
                    goals_next TEXT DEFAULT '',
                    rating INTEGER DEFAULT 5,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS transactions (
                    id TEXT PRIMARY KEY,
                    type TEXT NOT NULL,
                    amount REAL NOT NULL,
                    category TEXT NOT NULL,
                    note TEXT DEFAULT '',
                    record_date TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS moods (
                    id TEXT PRIMARY KEY,
                    mood INTEGER DEFAULT 3,
                    note TEXT DEFAULT '',
                    tags TEXT DEFAULT '[]',
                    log_date TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS health_metrics (
                    id TEXT PRIMARY KEY,
                    metric_type TEXT NOT NULL,
                    value REAL NOT NULL,
                    unit TEXT DEFAULT '',
                    note TEXT DEFAULT '',
                    record_date TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS hobbies (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT DEFAULT '',
                    category TEXT DEFAULT '',
                    icon TEXT DEFAULT '🎨',
                    color TEXT DEFAULT '#8B5CF6',
                    status TEXT DEFAULT 'active',
                    progress INTEGER DEFAULT 0,
                    note TEXT DEFAULT '',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS pomodoro_sessions (
                    id TEXT PRIMARY KEY,
                    todo_id TEXT DEFAULT '',
                    duration INTEGER DEFAULT 25,
                    started_at TEXT NOT NULL,
                    completed_at TEXT DEFAULT '',
                    status TEXT DEFAULT 'completed'
                );

                CREATE TABLE IF NOT EXISTS weekly_reports (
                    id TEXT PRIMARY KEY,
                    week_start TEXT NOT NULL,
                    week_end TEXT NOT NULL,
                    summary TEXT DEFAULT '',
                    highlights TEXT DEFAULT '',
                    mood_avg REAL DEFAULT 0,
                    todo_done INTEGER DEFAULT 0,
                    created_at TEXT NOT NULL
                );

                -- AI 相关表
                CREATE TABLE IF NOT EXISTS ai_generations (
                    id TEXT PRIMARY KEY,
                    scene TEXT NOT NULL,
                    source_type TEXT NOT NULL,
                    source_id TEXT NOT NULL,
                    prompt TEXT DEFAULT '',
                    response TEXT DEFAULT '',
                    model TEXT DEFAULT '',
                    tokens_used INTEGER DEFAULT 0,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS ai_chat_history (
                    id TEXT PRIMARY KEY,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "为检索/分页常用日期列与分类列建立索引",
            sql: "
                CREATE INDEX IF NOT EXISTS idx_todos_due_date ON todos(due_date);
                CREATE INDEX IF NOT EXISTS idx_events_start_date ON events(start_date);
                CREATE INDEX IF NOT EXISTS idx_ideas_created_at ON ideas(created_at);
                CREATE INDEX IF NOT EXISTS idx_memos_created_at ON memos(created_at);
                CREATE INDEX IF NOT EXISTS idx_daily_logs_log_date ON daily_logs(log_date);
                CREATE INDEX IF NOT EXISTS idx_learning_start_date ON learning(start_date);
                CREATE INDEX IF NOT EXISTS idx_reviews_period_start ON reviews(period_start);
                CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
                CREATE INDEX IF NOT EXISTS idx_moods_log_date ON moods(log_date);
                CREATE INDEX IF NOT EXISTS idx_health_metrics_record_date ON health_metrics(record_date);
                CREATE INDEX IF NOT EXISTS idx_weekly_week_start ON weekly_reports(week_start);
                CREATE INDEX IF NOT EXISTS idx_todos_category ON todos(category);
                CREATE INDEX IF NOT EXISTS idx_events_category ON events(category);
                CREATE INDEX IF NOT EXISTS idx_learning_category ON learning(category);
                CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "新增附件表（截图/图片上传）",
            sql: "
                CREATE TABLE IF NOT EXISTS attachments (
                    id TEXT PRIMARY KEY,
                    module TEXT NOT NULL,
                    record_id TEXT NOT NULL,
                    name TEXT DEFAULT '',
                    data TEXT DEFAULT '',
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_attachments_mod_rec ON attachments(module, record_id);
            ",
            kind: MigrationKind::Up,
        },
    ];

    db.run_migrations(migrations).await?;
    println!("✅ 数据库初始化完成");
    Ok(())
}
