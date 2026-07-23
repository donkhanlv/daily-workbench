/// Prompt 模板管理
use std::collections::HashMap;

pub struct PromptTemplate {
    pub system_prompt: String,
    pub user_prompt_template: String,
}

impl PromptTemplate {
    pub fn render(&self, variables: &HashMap<String, String>) -> String {
        let mut result = self.user_prompt_template.clone();
        for (key, value) in variables {
            result = result.replace(&format!("{{{{{}}}}}", key), value);
        }
        result
    }

    pub fn build_request(&self, variables: &HashMap<String, String>) -> super::provider::ChatRequest {
        super::provider::ChatRequest {
            model: "gpt-4o-mini".to_string(),
            messages: vec![
                super::provider::ChatMessage {
                    role: "system".to_string(),
                    content: self.system_prompt.clone(),
                },
                super::provider::ChatMessage {
                    role: "user".to_string(),
                    content: self.render(variables),
                },
            ],
            temperature: Some(0.7),
            max_tokens: Some(2048),
            stream: Some(false),
        }
    }
}

// ===== Prompt 模板库 =====
impl PromptTemplate {
    /// 日总结生成
    pub fn daily_summary() -> Self {
        Self {
            system_prompt: "你是一个温和贴心的个人生活助手。根据用户提供的今日数据，生成一段温暖、有洞察力的日总结。控制在 150 字以内，用第二人称「你」。".to_string(),
            user_prompt_template: [
                "今天是 {{date}}。",
                "待办完成情况：{{todo_summary}}",
                "今日心情：{{mood}}（1-5分）",
                "习惯打卡：{{habit_summary}}",
                "今日高光：{{highlights}}",
                "",
                "请根据以上信息生成今日总结："
            ].join("\n"),
        }
    }

    /// 周报生成
    pub fn weekly_review() -> Self {
        Self {
            system_prompt: "你是一个高效的个人数据分析师。根据用户提供的本周数据，生成一份结构化的周报。包含：本周概况、亮点成就、待改进、下周建议。用第二人称「你」。".to_string(),
            user_prompt_template: [
                "本周 ({{start_date}} ~ {{end_date}}) 数据：",
                "待办完成率：{{completion_rate}}%",
                "完成 {{completed_todos}} 项 / 共 {{total_todos}} 项",
                "心情平均分：{{avg_mood}}/5",
                "连续打卡天数：{{streak_days}}天",
                "新增灵感：{{ideas_count}}条",
                "学习进度：{{learning_progress}}",
                "",
                "请生成周报："
            ].join("\n"),
        }
    }

    /// 灵感标签建议
    pub fn idea_tagger() -> Self {
        Self {
            system_prompt: "你是一个知识管理专家。为用户的灵感内容推荐 1-3 个中文标签（不含#号），只返回标签列表 JSON 格式，如 [\"技术\", \"效率\"]。不要其他内容。".to_string(),
            user_prompt_template: "请为以下灵感推荐标签：\n\n{{content}}".to_string(),
        }
    }

    /// 任务拆分建议
    pub fn todo_suggester() -> Self {
        Self {
            system_prompt: "你是一个项目管理专家。根据用户的任务描述，将其拆分为 2-4 个更具体的子任务。用简洁的列表形式返回。".to_string(),
            user_prompt_template: "请将以下任务具体化、拆分为可执行的子任务：\n\n{{title}}\n\n{{description}}".to_string(),
        }
    }

    /// 情绪洞察分析
    pub fn mood_insight() -> Self {
        Self {
            system_prompt: "你是一个温暖的心理健康伙伴。根据用户的心情记录和日记内容，给出温和的洞察和建议。控制在 100 字以内，语气温暖支持。".to_string(),
            user_prompt_template: [
                "本周心情数据：{{mood_data}}",
                "最近日记摘要：{{diary_excerpt}}",
                "",
                "请给出情绪洞察："
            ].join("\n"),
        }
    }

    /// 通用助手 System Prompt
    pub fn chat_assistant() -> Self {
        Self {
            system_prompt: [
                "你是一个集成在个人工作台中的 AI 助手，名字叫「胖达」。",
                "你可以访问用户的以下数据：待办任务、日历事件、灵感记录、习惯打卡、日记、备忘录。",
                "回答要简洁温暖，用中文，控制在 200 字以内。",
                "如果用户问的问题需要查询数据，引导用户使用对应功能模块。",
            ].join("\n"),
            user_prompt_template: "{{user_message}}".to_string(),
        }
    }
}
