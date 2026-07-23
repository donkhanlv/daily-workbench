mod ai;
mod commands;
mod db;
mod models;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // 初始化数据库
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = db::initialize_database(&handle).await {
                    eprintln!("数据库初始化失败: {}", e);
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Todo 命令
            commands::todos::get_todos,
            commands::todos::create_todo,
            commands::todos::update_todo,
            commands::todos::delete_todo,
            commands::todos::toggle_todo,
            // Event 命令
            commands::events::get_events,
            commands::events::create_event,
            commands::events::update_event,
            commands::events::delete_event,
            // Idea 命令
            commands::ideas::get_ideas,
            commands::ideas::create_idea,
            commands::ideas::delete_idea,
            // Habit 命令
            commands::habits::get_habits,
            commands::habits::create_habit,
            commands::habits::toggle_habit,
            // Memo 命令
            commands::memos::get_memos,
            commands::memos::create_memo,
            commands::memos::delete_memo,
            // Daily log 命令
            commands::daily::get_daily_log,
            commands::daily::save_daily_log,
            // Learning 命令
            commands::learning::get_learning,
            commands::learning::create_learning,
            commands::learning::update_learning,
            commands::learning::delete_learning,
            // Review 命令
            commands::review::get_reviews,
            commands::review::create_review,
            commands::review::update_review,
            commands::review::delete_review,
            // Finance 命令
            commands::finance::get_transactions,
            commands::finance::create_transaction,
            commands::finance::delete_transaction,
            commands::finance::get_finance_summary,
            // Mood 命令
            commands::mood::get_moods,
            commands::mood::create_mood,
            commands::mood::delete_mood,
            // Health 命令
            commands::health::get_health_metrics,
            commands::health::create_health_metric,
            commands::health::delete_health_metric,
            // Hobbies 命令
            commands::hobbies::get_hobbies,
            commands::hobbies::create_hobby,
            commands::hobbies::update_hobby,
            commands::hobbies::delete_hobby,
            // Pomodoro 命令
            commands::pomodoro::get_pomodoro_sessions,
            commands::pomodoro::create_pomodoro_session,
            commands::pomodoro::delete_pomodoro_session,
            // Weekly 命令
            commands::weekly::get_weekly_reports,
            commands::weekly::create_weekly_report,
            commands::weekly::generate_weekly_report,
            commands::weekly::delete_weekly_report,
            // 数据备份（导出/导入 JSON）
            commands::backup::export_data,
            commands::backup::import_data,
            // Cycle 命令
            commands::cycle::get_cycle_stats,
            // Stats 命令
            commands::stats::get_dashboard_stats,
            // AI 命令
            ai::commands::summary::generate_daily_summary,
            ai::commands::insight::suggest_idea_tags,
            ai::commands::insight::generate_mood_insight,
            ai::commands::chat::ai_chat,
            // 统一检索（后端 SQL 分页 + 知识库上下文）
            commands::search::search_items,
            commands::search::get_knowledge_context,
            // 附件（截图/图片上传）命令
            commands::attachments::list_attachments,
            commands::attachments::save_attachment,
            commands::attachments::delete_attachment,
        ])
        .run(tauri::generate_context!())
        .expect("启动日常工作台时发生错误");
}
