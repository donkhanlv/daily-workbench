use serde::{Deserialize, Serialize};

// ===== 待办任务 =====
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Todo {
    pub id: String,
    pub title: String,
    pub description: String,
    pub priority: i32,
    pub status: String,
    pub due_date: String,
    pub due_time: String,
    pub category: String,
    pub tags: String,
    pub created_at: String,
    pub updated_at: String,
    pub completed_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateTodoRequest {
    pub title: String,
    pub description: Option<String>,
    pub priority: Option<i32>,
    pub due_date: Option<String>,
    pub due_time: Option<String>,
    pub category: Option<String>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateTodoRequest {
    pub id: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub priority: Option<i32>,
    pub status: Option<String>,
    pub due_date: Option<String>,
    pub due_time: Option<String>,
    pub category: Option<String>,
}

// ===== 日历事件 =====
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Event {
    pub id: String,
    pub title: String,
    pub description: String,
    pub start_date: String,
    pub end_date: String,
    pub all_day: i32,
    pub color: String,
    pub category: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateEventRequest {
    pub title: String,
    pub description: Option<String>,
    pub start_date: String,
    pub end_date: String,
    pub all_day: Option<bool>,
    pub color: Option<String>,
    pub category: Option<String>,
}

// ===== 灵感 =====
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Idea {
    pub id: String,
    pub content: String,
    pub source: String,
    pub tags: String,
    pub is_favorite: i32,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateIdeaRequest {
    pub content: String,
    pub source: Option<String>,
    pub tags: Option<Vec<String>>,
}

// ===== 习惯 =====
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Habit {
    pub id: String,
    pub name: String,
    pub description: String,
    pub frequency: String,
    pub target_count: i32,
    pub color: String,
    pub icon: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateHabitRequest {
    pub name: String,
    pub description: Option<String>,
    pub frequency: Option<String>,
    pub target_count: Option<i32>,
    pub color: Option<String>,
    pub icon: Option<String>,
}

// ===== 备忘录 =====
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Memo {
    pub id: String,
    pub title: String,
    pub content: String,
    pub color: String,
    pub is_pinned: i32,
    pub remind_at: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateMemoRequest {
    pub title: Option<String>,
    pub content: String,
    pub color: Option<String>,
    pub remind_at: Option<String>,
}

// ===== 每日日志（每日生活） =====
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DailyLog {
    pub id: String,
    pub log_date: String,
    pub mood: i32,
    pub weather: String,
    pub highlights: String,
    pub summary: String,
    pub gratitude: String,
    pub sleep_hours: f64,
    pub water_cups: i32,
    pub exercise_minutes: i32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SaveDailyLogRequest {
    pub log_date: String,
    pub mood: Option<i32>,
    pub weather: Option<String>,
    pub highlights: Option<String>,
    pub summary: Option<String>,
    pub gratitude: Option<String>,
    pub sleep_hours: Option<f64>,
    pub water_cups: Option<i32>,
    pub exercise_minutes: Option<i32>,
}

// ===== 仪表盘统计（字段名与前端 renderDashboard 读取的完全一致） =====
#[derive(Debug, Serialize, Deserialize)]
pub struct DashboardStats {
    /// 习惯最长连续天数（截至今天）
    pub habit_streak: i64,
    /// 进行中的学习项数
    pub learning_count: i64,
    /// 本月灵感条数
    pub this_month_ideas: i64,
    /// 今日心情（1-5，未记录为 null）
    pub today_mood: Option<i32>,
}

// ===== 学习提升 =====
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Learning {
    pub id: String,
    pub title: String,
    pub r#type: String,
    pub subject: String,
    pub progress: f64,
    pub total_pages: i32,
    pub current_page: i32,
    pub notes: String,
    pub start_date: String,
    pub target_date: String,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateLearningRequest {
    pub title: String,
    pub r#type: Option<String>,
    pub subject: Option<String>,
    pub total_pages: Option<i32>,
    pub current_page: Option<i32>,
    pub notes: Option<String>,
    pub start_date: Option<String>,
    pub target_date: Option<String>,
    pub status: Option<String>,
}

// ===== 内容复盘 =====
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Review {
    pub id: String,
    pub r#type: String,
    pub period_start: String,
    pub period_end: String,
    pub achievements: String,
    pub improvements: String,
    pub goals_next: String,
    pub rating: i32,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateReviewRequest {
    pub r#type: String,
    pub period_start: String,
    pub period_end: String,
    pub achievements: Option<String>,
    pub improvements: Option<String>,
    pub goals_next: Option<String>,
    pub rating: Option<i32>,
}

// ===== 极简记账 =====
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Transaction {
    pub id: String,
    pub r#type: String,
    pub amount: f64,
    pub category: String,
    pub note: String,
    pub record_date: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateTransactionRequest {
    pub r#type: String,
    pub amount: f64,
    pub category: String,
    pub note: Option<String>,
    pub record_date: Option<String>,
}

// ===== 心情追踪 =====
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Mood {
    pub id: String,
    pub mood: i32,
    pub note: String,
    pub tags: String,
    pub log_date: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateMoodRequest {
    pub mood: i32,
    pub note: Option<String>,
    pub tags: Option<Vec<String>>,
    pub log_date: Option<String>,
}

// ===== 健康习惯（健康指标） =====
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HealthMetric {
    pub id: String,
    pub metric_type: String,
    pub value: f64,
    pub unit: String,
    pub note: String,
    pub record_date: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateHealthMetricRequest {
    pub metric_type: String,
    pub value: f64,
    pub unit: Option<String>,
    pub note: Option<String>,
    pub record_date: Option<String>,
}

// ===== 兴趣爱好 =====
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Hobby {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    pub icon: String,
    pub color: String,
    pub status: String,
    pub progress: i32,
    pub note: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateHobbyRequest {
    pub name: String,
    pub description: Option<String>,
    pub category: Option<String>,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub status: Option<String>,
    pub progress: Option<i32>,
    pub note: Option<String>,
}

// ===== 番茄钟会话 =====
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PomodoroSession {
    pub id: String,
    pub todo_id: String,
    pub duration: i32,
    pub started_at: String,
    pub completed_at: String,
    pub status: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreatePomodoroRequest {
    pub todo_id: Option<String>,
    pub duration: Option<i32>,
}

// ===== 周报 =====
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WeeklyReport {
    pub id: String,
    pub week_start: String,
    pub week_end: String,
    pub summary: String,
    pub highlights: String,
    pub mood_avg: f64,
    pub todo_done: i32,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateWeeklyReportRequest {
    pub week_start: String,
    pub week_end: String,
    pub summary: Option<String>,
    pub highlights: Option<String>,
    pub mood_avg: Option<f64>,
    pub todo_done: Option<i32>,
}

// ===== 附件（截图/图片） =====
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Attachment {
    pub id: String,
    pub module: String,
    pub record_id: String,
    pub name: String,
    pub data: String,
    pub created_at: String,
}
