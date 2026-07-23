/**
 * API 层 - Tauri IPC 调用的统一封装
 * 双轨运行：
 *  - Tauri 环境：invoke 调用 Rust 后端（SQLite 持久化）
 *  - 浏览器环境：LocalStorage 持久化仓库（无需 Rust 即可完整使用）
 */
const API = (() => {
  const isTauri = () => typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__;

  const invoke = async (cmd, args = {}) => {
    if (isTauri()) {
      const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
      return tauriInvoke(cmd, args);
    }
    return LocalBackend.handle(cmd, args);
  };

  // Tauri plugin-store（settings.json）——与 Rust 端 AI 配置读取同源。
  // 关键修复：桌面端 AI 密钥必须写进 plugin-store，写 localStorage 会被 Rust 忽略。
  let _tauriStorePromise = null;
  const getTauriStore = async () => {
    if (!_tauriStorePromise) {
      _tauriStorePromise = (async () => {
        const { load } = await import('@tauri-apps/plugin-store');
        return load('settings.json', { autoSave: true });
      })();
    }
    return _tauriStorePromise;
  };
  const readLocalSettings = () => {
    try { return JSON.parse(localStorage.getItem('dw_settings') || '{}'); } catch (e) { return {}; }
  };

  return {
    todos: {
      getAll: (status) => invoke('get_todos', { status }),
      create: (req) => invoke('create_todo', { req }),
      update: (req) => invoke('update_todo', { req }),
      delete: (id) => invoke('delete_todo', { id }),
      toggle: (id) => invoke('toggle_todo', { id }),
    },
    events: {
      getAll: (month) => invoke('get_events', { month }),
      create: (req) => invoke('create_event', { req }),
      update: (id, title, start_date, end_date) => invoke('update_event', { id, title, start_date, end_date }),
      delete: (id) => invoke('delete_event', { id }),
    },
    ideas: {
      getAll: () => invoke('get_ideas'),
      create: (req) => invoke('create_idea', { req }),
      delete: (id) => invoke('delete_idea', { id }),
    },
    habits: {
      getAll: () => invoke('get_habits'),
      create: (req) => invoke('create_habit', { req }),
      toggle: (habit_id) => invoke('toggle_habit', { habit_id }),
    },
    memos: {
      getAll: () => invoke('get_memos'),
      create: (req) => invoke('create_memo', { req }),
      delete: (id) => invoke('delete_memo', { id }),
    },
    daily: {
      get: (log_date) => invoke('get_daily_log', { log_date }),
      save: (req) => invoke('save_daily_log', { req }),
    },
    learning: {
      getAll: () => invoke('get_learning'),
      create: (req) => invoke('create_learning', { req }),
      update: (req) => invoke('update_learning', { req }),
      delete: (id) => invoke('delete_learning', { id }),
    },
    reviews: {
      getAll: () => invoke('get_reviews'),
      create: (req) => invoke('create_review', { req }),
      update: (req) => invoke('update_review', { req }),
      delete: (id) => invoke('delete_review', { id }),
    },
    finance: {
      getTransactions: (month) => invoke('get_transactions', { month }),
      create: (req) => invoke('create_transaction', { req }),
      delete: (id) => invoke('delete_transaction', { id }),
      summary: (month) => invoke('get_finance_summary', { month }),
    },
    mood: {
      getAll: (month) => invoke('get_moods', { month }),
      create: (req) => invoke('create_mood', { req }),
      delete: (id) => invoke('delete_mood', { id }),
    },
    health: {
      getAll: (type) => invoke('get_health_metrics', { type }),
      create: (req) => invoke('create_health_metric', { req }),
      delete: (id) => invoke('delete_health_metric', { id }),
    },
    hobbies: {
      getAll: () => invoke('get_hobbies'),
      create: (req) => invoke('create_hobby', { req }),
      update: (req) => invoke('update_hobby', { req }),
      delete: (id) => invoke('delete_hobby', { id }),
    },
    pomodoro: {
      getAll: () => invoke('get_pomodoro_sessions'),
      create: (req) => invoke('create_pomodoro_session', { req }),
      delete: (id) => invoke('delete_pomodoro_session', { id }),
    },
    weekly: {
      getAll: () => invoke('get_weekly_reports'),
      create: (req) => invoke('create_weekly_report', { req }),
      generate: (req) => invoke('generate_weekly_report', { req }),
      delete: (id) => invoke('delete_weekly_report', { id }),
    },
    cycle: {
      stats: () => invoke('get_cycle_stats'),
    },
    stats: {
      dashboard: () => invoke('get_dashboard_stats'),
    },
    settings: {
      get: (key, def) => LocalBackend.getSetting(key, def),
      set: (key, val) => LocalBackend.setSetting(key, val),
      // 导出/导入 JSON 备份（双模式：浏览器走 LocalBackend，桌面走 Rust export_data/import_data）
      exportAll: async () => {
        const payload = await invoke('export_data');
        try { payload.settings = JSON.parse(localStorage.getItem('dw_settings') || '{}'); } catch (e) { payload.settings = {}; }
        return payload;
      },
      importAll: async (payload, mode = 'replace') => {
        await invoke('import_data', { payload: payload.data, mode });
        if (payload.settings) { try { localStorage.setItem('dw_settings', JSON.stringify(payload.settings)); } catch (e) { /* ignore */ } }
        return { ok: true };
      },
    },
    ai: {
      dailySummary: (date) => invoke('generate_daily_summary', { req: { date } }),
      suggestTags: (content) => invoke('suggest_idea_tags', { content }),
      moodInsight: () => invoke('generate_mood_insight'),
      chat: (message, history) => invoke('ai_chat', { req: { message, history } }),
      // 读取 AI 配置：Tauri 走 plugin-store（与 Rust 同源），浏览器回退 localStorage
      getConfig: async () => {
        const def = { provider: 'openai', api_key: '', api_base: '', model: 'gpt-4o-mini', temperature: 0.7, max_tokens: 2048 };
        if (isTauri()) {
          try {
            const store = await getTauriStore();
            return {
              provider: (await store.get('ai_provider')) || def.provider,
              api_key: (await store.get('ai_api_key')) || '',
              api_base: (await store.get('ai_api_base')) || '',
              model: (await store.get('ai_model')) || def.model,
              temperature: parseFloat(await store.get('ai_temperature')) || def.temperature,
              max_tokens: parseInt(await store.get('ai_max_tokens'), 10) || def.max_tokens,
            };
          } catch (e) { console.warn('[AI配置] 读取失败', e); return def; }
        }
        const s = readLocalSettings();
        return {
          provider: s.ai_provider || def.provider,
          api_key: s.ai_api_key || '',
          api_base: s.ai_api_base || '',
          model: s.ai_model || def.model,
          temperature: s.ai_temperature || def.temperature,
          max_tokens: s.ai_max_tokens || def.max_tokens,
        };
      },
      // 保存 AI 配置：写入与 Rust 完全一致的键名
      saveConfig: async (cfg) => {
        if (isTauri()) {
          const store = await getTauriStore();
          await store.set('ai_provider', cfg.provider || 'openai');
          await store.set('ai_api_key', cfg.api_key || '');
          await store.set('ai_api_base', cfg.api_base || '');
          await store.set('ai_model', cfg.model || 'gpt-4o-mini');
          await store.set('ai_temperature', cfg.temperature != null ? cfg.temperature : 0.7);
          await store.set('ai_max_tokens', cfg.max_tokens != null ? cfg.max_tokens : 2048);
          await store.save();
          return;
        }
        const s = readLocalSettings();
        Object.assign(s, {
          ai_provider: cfg.provider || 'openai',
          ai_api_key: cfg.api_key || '',
          ai_api_base: cfg.api_base || '',
          ai_model: cfg.model || 'gpt-4o-mini',
          ai_temperature: cfg.temperature != null ? cfg.temperature : 0.7,
          ai_max_tokens: cfg.max_tokens != null ? cfg.max_tokens : 2048,
        });
        localStorage.setItem('dw_settings', JSON.stringify(s));
      },
    },
    search: {
      items: (req) => invoke('search_items', { req }),
      knowledge: (req) => invoke('get_knowledge_context', { req }),
    },
    attachments: {
      list: (module, record_id) => invoke('list_attachments', { module, record_id: record_id ?? null }),
      save: (module, record_id, name, data) => invoke('save_attachment', { module, record_id, name, data }),
      delete: (id) => invoke('delete_attachment', { id }),
    },
    init: async () => {
      if (!isTauri()) {
        try { LocalBackend.seed(); } catch (e) { console.warn('[seed] 失败', e); }
        try { await LocalBackend.loadAttachments(); } catch (e) { console.warn('[附件加载] 失败', e); }
      }
    },
  };
})();

/* ============================================================
 * 浏览器模式：LocalStorage 持久化仓库（与 Rust 后端返回结构一致）
 * ============================================================ */
const LocalBackend = (() => {
  // 统一检索：模块 -> 本地仓储 key + 字段映射（与 Rust commands/search.rs 的白名单保持一致）
  const SEARCH_DEFS = {
    todo:     { repo: 'todos',          date: 'due_date',     title: 'title',      body: 'description', cat: true },
    event:    { repo: 'events',         date: 'start_date',   title: 'title',      body: 'description', cat: true },
    idea:     { repo: 'ideas',          date: 'created_at',   title: 'content',    body: 'content',     cat: false },
    memo:     { repo: 'memos',          date: 'created_at',   title: 'title',      body: 'content',     cat: false },
    diary:    { repo: 'daily_logs',     date: 'log_date',     title: 'highlights', body: 'summary',     cat: false },
    learning: { repo: 'learning',       date: 'start_date',   title: 'title',      body: 'notes',       cat: true },
    review:   { repo: 'reviews',        date: 'period_start', title: 'type',       body: 'achievements',cat: false },
    finance:  { repo: 'transactions',   date: 'created_at',   title: 'note',       body: 'note',        cat: true },
    mood:     { repo: 'moods',          date: 'log_date',     title: 'note',       body: 'note',        cat: false },
    health:   { repo: 'health_metrics', date: 'record_date',  title: 'metric_type',body: 'note',        cat: false },
    weekly:   { repo: 'weekly',         date: 'week_start',   title: 'summary',    body: 'highlights',  cat: false },
  };

  class Repo {
    constructor(key) { this.key = key; }
    all() { try { return JSON.parse(localStorage.getItem(this.key) || '[]'); } catch (e) { return []; } }
    find(id) { return this.all().find((x) => x.id === id) || null; }
    insert(obj) { const a = this.all(); a.push(obj); this.save(a); return obj; }
    update(id, patch) {
      const a = this.all(); const i = a.findIndex((x) => x.id === id);
      if (i < 0) return null; a[i] = { ...a[i], ...patch }; this.save(a); return a[i];
    }
    remove(id) { this.save(this.all().filter((x) => x.id !== id)); return true; }
    save(a) { localStorage.setItem(this.key, JSON.stringify(a)); }
  }

  /* 附件存储：内存缓存 + IndexedDB 持久化（localStorage 回退）
   * 解决 localStorage 单键 ~5MB 上限；保持同步接口 all/insert/remove 不变。 */
  const AttachmentStore = (() => {
    const LS_KEY = 'dw_attachments';
    let cache = null;     // 内存数组：会话内同步读写
    let backend = 'local';
    const hasIDB = () => (typeof indexedDB !== 'undefined');

    let dbPromise = null; // 缓存单一连接，避免每次操作新建且不关闭（连接-per-op 在内存压力下可能中断事务）
    function idbOpen() {
      if (dbPromise) return dbPromise;
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open('dw_attachments_db', 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('att')) db.createObjectStore('att', { keyPath: 'id' });
        };
        req.onsuccess = () => {
          const db = req.result;
          db.onversionchange = () => { try { db.close(); } catch (e) {} };
          resolve(db);
        };
        req.onerror = () => { dbPromise = null; reject(req.error); };
      });
      return dbPromise;
    }
    function idbAll() {
      return idbOpen().then((db) => new Promise((resolve, reject) => {
        const tx = db.transaction('att', 'readonly');
        const r = tx.objectStore('att').getAll();
        r.onsuccess = () => resolve(r.result || []);
        r.onerror = () => reject(r.error);
      }));
    }
    function idbPut(obj) {
      return idbOpen().then((db) => new Promise((resolve, reject) => {
        const tx = db.transaction('att', 'readwrite');
        tx.objectStore('att').put(obj);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      }));
    }
    function idbDelete(id) {
      return idbOpen().then((db) => new Promise((resolve, reject) => {
        const tx = db.transaction('att', 'readwrite');
        tx.objectStore('att').delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      }));
    }

    async function load() {
      if (cache) return cache;
      if (hasIDB()) {
        try {
          const arr = await idbAll();
          cache = Array.isArray(arr) ? arr : [];
          backend = 'idb';
          // 旧版 localStorage 数据迁移到 IDB（仅当 IDB 为空时）
          if (cache.length === 0) {
            try {
              const legacy = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
              if (Array.isArray(legacy) && legacy.length) {
                cache = legacy;
                legacy.forEach((o) => idbPut(o).catch(() => {}));
              }
            } catch (e) { /* ignore */ }
          }
          return cache;
        } catch (e) { /* 落到 localStorage */ }
      }
      try { cache = JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch (e) { cache = []; }
      backend = 'local';
      return cache;
    }

    function ensure() {
      if (cache === null) {
        try { cache = JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch (e) { cache = []; }
      }
      return cache;
    }
    function all() { return ensure(); }
    function insert(obj) {
      const c = ensure();
      c.push(obj);
      if (backend === 'idb') idbPut(obj).catch(() => {});
      else { try { localStorage.setItem(LS_KEY, JSON.stringify(c)); } catch (e) { console.warn('[附件] 存储失败(可能超出 localStorage 上限)', e); } }
      return obj;
    }
    function remove(id) {
      const c = ensure();
      cache = c.filter((x) => x.id !== id);
      if (backend === 'idb') idbDelete(id).catch(() => {});
      else { try { localStorage.setItem(LS_KEY, JSON.stringify(cache)); } catch (e) {} }
      return true;
    }
    return { load, all, insert, remove };
  })();

  const uid = () => 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const now = () => new Date().toISOString();
  const nowLocal = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  };
  const today = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
  const month = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}`; };

  const repos = {
    todos: new Repo('dw_todos'),
    events: new Repo('dw_events'),
    ideas: new Repo('dw_ideas'),
    habits: new Repo('dw_habits'),
    habit_records: new Repo('dw_habit_records'),
    memos: new Repo('dw_memos'),
    daily_logs: new Repo('dw_daily_logs'),
    learning: new Repo('dw_learning'),
    reviews: new Repo('dw_reviews'),
    transactions: new Repo('dw_transactions'),
    moods: new Repo('dw_moods'),
    health_metrics: new Repo('dw_health_metrics'),
    hobbies: new Repo('dw_hobbies'),
    pomodoro: new Repo('dw_pomodoro'),
    weekly: new Repo('dw_weekly'),
    attachments: AttachmentStore,
  };

  /* 规范化表名 -> localStorage 键（与 Rust SQLite 表名一致，便于浏览器↔桌面互通） */
  const KEY_MAP = {
    todos: 'dw_todos', events: 'dw_events', ideas: 'dw_ideas', habits: 'dw_habits',
    habit_records: 'dw_habit_records', memos: 'dw_memos', daily_logs: 'dw_daily_logs',
    learning: 'dw_learning', reviews: 'dw_reviews', transactions: 'dw_transactions',
    moods: 'dw_moods', health_metrics: 'dw_health_metrics', hobbies: 'dw_hobbies',
    pomodoro_sessions: 'dw_pomodoro', weekly_reports: 'dw_weekly',
  };

  /* ---------- 首次运行填充示例数据 ---------- */
  function seedIfNeeded() {
    if (localStorage.getItem('dw_seeded')) return;
    const t = today();
    repos.todos.insert({ id: uid(), title: '完成日常工作台开发', description: '', priority: 3, status: 'pending', due_date: t, due_time: '', category: 'work', tags: '[]', created_at: now(), updated_at: now(), completed_at: '' });
    repos.todos.insert({ id: uid(), title: '阅读《设计模式》第 5 章', description: '', priority: 2, status: 'pending', due_date: t, due_time: '21:00', category: 'study', tags: '["阅读"]', created_at: now(), updated_at: now(), completed_at: '' });
    repos.todos.insert({ id: uid(), title: '整理本周周报', description: '', priority: 2, status: 'done', due_date: t, due_time: '', category: 'work', tags: '[]', created_at: now(), updated_at: now(), completed_at: now() });

    const h1 = repos.habits.insert({ id: uid(), name: '喝水 8 杯', description: '', frequency: 'daily', target_count: 8, color: '#5B8DEF', icon: '💧', created_at: now() });
    repos.habits.insert({ id: uid(), name: '运动 30 分钟', description: '', frequency: 'daily', target_count: 1, color: '#10B981', icon: '🏃', created_at: now() });
    const h3 = repos.habits.insert({ id: uid(), name: '阅读 30 分钟', description: '', frequency: 'daily', target_count: 1, color: '#F59E0B', icon: '📖', created_at: now() });
    repos.habit_records.insert({ id: uid(), habit_id: h1.id, record_date: t, count: 5, note: '', created_at: now() });
    repos.habit_records.insert({ id: uid(), habit_id: h3.id, record_date: t, count: 1, note: '', created_at: now() });

    repos.ideas.insert({ id: uid(), content: '可以用番茄钟的完成提醒来做专注仪式感 🍅', source: '技术', tags: '["效率"]', is_favorite: 0, created_at: now() });
    repos.ideas.insert({ id: uid(), content: '周末去爬山吧，好久没亲近大自然了 🏔️', source: '生活', tags: '["生活"]', is_favorite: 0, created_at: now() });

    repos.memos.insert({ id: uid(), title: '购物清单', content: '牛奶、鸡蛋、咖啡豆、水果', color: '#FFF9C4', is_pinned: 1, remind_at: '', created_at: now(), updated_at: now() });

    repos.moods.insert({ id: uid(), mood: 4, note: '今天状态不错，完成了不少事！', tags: '[]', log_date: t, created_at: now() });

    repos.daily_logs.insert({ id: uid(), log_date: t, mood: 4, weather: '晴', highlights: '顺利完成模块开发', summary: '', gratitude: '感谢一直坚持的自己', sleep_hours: 7.5, water_cups: 5, exercise_minutes: 30, created_at: now(), updated_at: now() });

    repos.learning.insert({ id: uid(), title: 'Rust 程序设计', type: '课程', subject: '编程', progress: 35, total_pages: 600, current_page: 210, notes: '所有权与生命周期是重点', start_date: t, target_date: '', status: 'active', created_at: now(), updated_at: now() });

    repos.hobbies.insert({ id: uid(), name: '摄影', description: '记录生活中的光影', category: '艺术', icon: '📷', color: '#8B5CF6', status: 'active', progress: 20, note: '', created_at: now(), updated_at: now() });

    repos.transactions.insert({ id: uid(), type: 'income', amount: 12000, category: '工资', note: '本月工资', record_date: t, created_at: now() });
    repos.transactions.insert({ id: uid(), type: 'expense', amount: 3580, category: '房租', note: '房租', record_date: t, created_at: now() });

    repos.health_metrics.insert({ id: uid(), metric_type: 'water', value: 5, unit: '杯', note: '', record_date: t, created_at: now() });
    repos.health_metrics.insert({ id: uid(), metric_type: 'sleep', value: 7.5, unit: '小时', note: '', record_date: t, created_at: now() });

    repos.pomodoro.insert({ id: uid(), todo_id: '', duration: 25, started_at: now(), completed_at: now(), status: 'completed' });

    localStorage.setItem('dw_seeded', '1');
  }
  // 种子数据由 API.init() 在浏览器模式下触发（Tauri 模式不写 localStorage）

  /* ---------- 习惯进度计算 ---------- */
  function buildHabitWithStatus(habit) {
    const recs = repos.habit_records.all().filter((r) => r.habit_id === habit.id);
    const t = today();
    const todayRecs = recs.filter((r) => r.record_date === t);
    const today_count = todayRecs.reduce((s, r) => s + (r.count || 1), 0);
    const dates = new Set(recs.map((r) => r.record_date));
    let streak = 0;
    const d = new Date();
    const fmt = (dt) => {
      const p = (n) => String(n).padStart(2, '0');
      return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
    };
    while (dates.has(fmt(d))) { streak++; d.setDate(d.getDate() - 1); }
    return { habit, done_today: today_count > 0, streak, today_count };
  }

  /* ---------- 设置（始终用 localStorage） ---------- */
  function getSettings() { try { return JSON.parse(localStorage.getItem('dw_settings') || '{}'); } catch (e) { return {}; } }
  function getSetting(key, def) { const s = getSettings(); return key in s ? s[key] : def; }
  function setSetting(key, val) { const s = getSettings(); s[key] = val; localStorage.setItem('dw_settings', JSON.stringify(s)); return val; }

  /* ---------- AI 轻量本地生成 ---------- */
  function aiDailySummary() {
    const t = today();
    const all = repos.todos.all();
    const todayTodos = all.filter((x) => x.due_date === t);
    const done = todayTodos.filter((x) => x.status === 'done').length;
    const pending = todayTodos.length - done;
    const habitDone = repos.habits.all().filter((h) => buildHabitWithStatus(h).done_today).length;
    const habitTotal = repos.habits.all().length;
    return {
      content: `☀️ 今日小结：你安排了 ${todayTodos.length} 项待办，已完成 ${done} 项${pending > 0 ? `，还有 ${pending} 项待推进` : '，全部完成，太棒了！'}。\n习惯打卡 ${habitDone}/${habitTotal} 项已完成 🔥。\n建议：把最重要的 1-2 件事优先收尾，晚上留点时间放松和复盘~ 🌙`,
      model: 'local-summary',
    };
  }
  function aiMoodInsight() {
    const ms = repos.moods.all().slice(0, 14);
    if (!ms.length) return '还没有心情记录哦，今天不妨记一笔吧 😊';
    const avg = (ms.reduce((s, m) => s + m.mood, 0) / ms.length).toFixed(1);
    const faces = ['😢', '🙁', '😐', '🙂', '😊'];
    return `最近 ${ms.length} 天你的平均心情为 ${avg}/5 ${faces[Math.min(4, Math.round(avg) - 1)]}。保持记录，能更了解自己的情绪节奏，记得多给自己一点温柔 🌿`;
  }
  function aiSuggestTags(content) {
    const map = [
      [['代码', 'bug', '开发', '程序', 'rust', 'js'], '技术'],
      [['书', '阅读', '学习', '课程', '笔记'], '学习'],
      [['运动', '跑步', '健身', '瑜伽'], '健康'],
      [['旅行', '爬山', '咖啡', '电影', '美食'], '生活'],
      [['效率', '专注', '番茄'], '效率'],
    ];
    const tags = [];
    const c = (content || '').toLowerCase();
    map.forEach(([keys, tag]) => { if (keys.some((k) => c.includes(k))) tags.push(tag); });
    if (!tags.length) tags.push('灵感');
    return { tags };
  }
  function aiChat(message) {
    const m = (message || '').toLowerCase();
    let reply = '收到～我是你的 AI 助手胖达 🐼 你可以问我关于任务、习惯或心情的问题，也可以让我帮你总结一天。';
    if (m.includes('总结') || m.includes('今天')) reply = '今天你已经做得很棒啦！可以打开「仪表盘」看看待办和习惯完成情况，需要的话我帮你写一段日简报 ✨';
    else if (m.includes('心情') || m.includes('情绪')) reply = '情绪没有对错，记录本身就是一种照顾自己 💗 试着每天记一笔心情，慢慢会看到自己的节奏。';
    else if (m.includes('计划') || m.includes('todo') || m.includes('待办')) reply = '把大任务拆成小步骤，用「每日计划」列出今天最重要的 3 件事，专注完成它们就好 💪';
    return { reply, model: 'local-chat' };
  }

  /* ---------- 命令路由 ---------- */
  async function handle(cmd, args = {}) {
    switch (cmd) {
      case 'get_todos':
        return args.status ? repos.todos.all().filter((x) => x.status === args.status) : repos.todos.all();
      case 'create_todo':
        return repos.todos.insert({ id: uid(), title: args.req.title, description: args.req.description || '', priority: args.req.priority || 0, status: 'pending', due_date: args.req.due_date || today(), due_time: args.req.due_time || '', category: args.req.category || '', tags: JSON.stringify(args.req.tags || []), created_at: now(), updated_at: now(), completed_at: '' });
      case 'update_todo':
        return repos.todos.update(args.req.id, { title: args.req.title, description: args.req.description, priority: args.req.priority, status: args.req.status, due_date: args.req.due_date, due_time: args.req.due_time, category: args.req.category, updated_at: now() });
      case 'delete_todo':
        return repos.todos.remove(args.id);
      case 'toggle_todo': {
        const t = repos.todos.find(args.id);
        if (!t) return null;
        const done = t.status === 'done';
        return repos.todos.update(args.id, { status: done ? 'pending' : 'done', completed_at: done ? '' : now(), updated_at: now() });
      }

      case 'get_events':
        return args.month ? repos.events.all().filter((e) => e.start_date.startsWith(args.month)) : repos.events.all();
      case 'create_event':
        return repos.events.insert({ id: uid(), title: args.req.title, description: args.req.description || '', start_date: args.req.start_date, end_date: args.req.end_date, all_day: args.req.all_day ? 1 : 0, color: args.req.color || '#5B8DEF', category: args.req.category || '', created_at: now(), updated_at: now() });
      case 'update_event':
        return repos.events.update(args.id, { title: args.title, start_date: args.start_date, end_date: args.end_date, updated_at: now() });
      case 'delete_event':
        return repos.events.remove(args.id);

      case 'get_ideas':
        return repos.ideas.all();
      case 'create_idea':
        return repos.ideas.insert({ id: uid(), content: args.req.content, source: args.req.source || '', tags: JSON.stringify(args.req.tags || []), is_favorite: 0, created_at: now() });
      case 'delete_idea':
        return repos.ideas.remove(args.id);

      case 'get_habits':
        return repos.habits.all().map(buildHabitWithStatus);
      case 'create_habit':
        return repos.habits.insert({ id: uid(), name: args.req.name, description: args.req.description || '', frequency: args.req.frequency || 'daily', target_count: args.req.target_count || 1, color: args.req.color || '#5B8DEF', icon: args.req.icon || '✅', created_at: now() });
      case 'toggle_habit': {
        const recs = repos.habit_records.all();
        const t = today();
        const has = recs.some((r) => r.habit_id === args.habit_id && r.record_date === t);
        if (has) {
          repos.habit_records.save(recs.filter((r) => !(r.habit_id === args.habit_id && r.record_date === t)));
          return false;
        }
        repos.habit_records.insert({ id: uid(), habit_id: args.habit_id, record_date: t, count: 1, note: '', created_at: now() });
        return true;
      }

      case 'get_memos':
        return repos.memos.all();
      case 'create_memo':
        return repos.memos.insert({ id: uid(), title: args.req.title || '', content: args.req.content, color: args.req.color || '#FFF9C4', is_pinned: 0, remind_at: args.req.remind_at || '', created_at: now(), updated_at: now() });
      case 'delete_memo':
        return repos.memos.remove(args.id);

      case 'get_daily_log': {
        const found = repos.daily_logs.all().find((x) => x.log_date === args.log_date);
        return found || null;
      }
      case 'save_daily_log': {
        const existing = repos.daily_logs.all().find((x) => x.log_date === args.req.log_date);
        const patch = {
          mood: args.req.mood, weather: args.req.weather, highlights: args.req.highlights,
          summary: args.req.summary, gratitude: args.req.gratitude, sleep_hours: args.req.sleep_hours,
          water_cups: args.req.water_cups, exercise_minutes: args.req.exercise_minutes, updated_at: now(),
        };
        if (existing) return repos.daily_logs.update(existing.id, patch);
        return repos.daily_logs.insert({ id: uid(), log_date: args.req.log_date, mood: args.req.mood || 3, weather: args.req.weather || '', highlights: args.req.highlights || '', summary: args.req.summary || '', gratitude: args.req.gratitude || '', sleep_hours: args.req.sleep_hours || 0, water_cups: args.req.water_cups || 0, exercise_minutes: args.req.exercise_minutes || 0, created_at: now(), updated_at: now() });
      }

      case 'get_learning':
        return repos.learning.all();
      case 'create_learning':
        return repos.learning.insert({ id: uid(), title: args.req.title, type: args.req.type || '', subject: args.req.subject || '', progress: 0, total_pages: args.req.total_pages || 0, current_page: args.req.current_page || 0, notes: args.req.notes || '', start_date: args.req.start_date || today(), target_date: args.req.target_date || '', status: args.req.status || 'active', created_at: now(), updated_at: now() });
      case 'update_learning':
        return repos.learning.update(args.req.id, { title: args.req.title, progress: args.req.progress, current_page: args.req.current_page, status: args.req.status, notes: args.req.notes, target_date: args.req.target_date, updated_at: now() });
      case 'delete_learning':
        return repos.learning.remove(args.id);

      case 'get_reviews':
        return repos.reviews.all();
      case 'create_review':
        return repos.reviews.insert({ id: uid(), type: args.req.type, period_start: args.req.period_start, period_end: args.req.period_end, achievements: args.req.achievements || '', improvements: args.req.improvements || '', goals_next: args.req.goals_next || '', rating: args.req.rating || 5, created_at: now() });
      case 'update_review':
        return repos.reviews.update(args.req.id, { achievements: args.req.achievements, improvements: args.req.improvements, goals_next: args.req.goals_next, rating: args.req.rating });
      case 'delete_review':
        return repos.reviews.remove(args.id);

      case 'get_transactions':
        return args.month ? repos.transactions.all().filter((x) => x.record_date.startsWith(args.month)) : repos.transactions.all();
      case 'create_transaction':
        return repos.transactions.insert({ id: uid(), type: args.req.type, amount: args.req.amount, category: args.req.category, note: args.req.note || '', record_date: args.req.record_date || today(), created_at: now() });
      case 'delete_transaction':
        return repos.transactions.remove(args.id);
      case 'get_finance_summary': {
        const m = args.month || month();
        const list = repos.transactions.all().filter((x) => x.record_date.startsWith(m));
        let income = 0, expense = 0;
        list.forEach((t) => { if (t.type === 'income') income += t.amount; else expense += t.amount; });
        return { month: m, income, expense, balance: income - expense };
      }

      case 'get_moods':
        return args.month ? repos.moods.all().filter((x) => x.log_date.startsWith(args.month)) : repos.moods.all();
      case 'create_mood': {
        repos.moods.save(repos.moods.all().filter((x) => x.log_date !== (args.req.log_date || today())));
        return repos.moods.insert({ id: uid(), mood: args.req.mood, note: args.req.note || '', tags: JSON.stringify(args.req.tags || []), log_date: args.req.log_date || today(), created_at: now() });
      }
      case 'delete_mood':
        return repos.moods.remove(args.id);

      case 'get_health_metrics':
        return args.metric_type ? repos.health_metrics.all().filter((x) => x.metric_type === args.metric_type) : repos.health_metrics.all();
      case 'create_health_metric':
        return repos.health_metrics.insert({ id: uid(), metric_type: args.req.metric_type, value: args.req.value, unit: args.req.unit || '', note: args.req.note || '', record_date: args.req.record_date || today(), created_at: now() });
      case 'delete_health_metric':
        return repos.health_metrics.remove(args.id);

      case 'get_hobbies':
        return repos.hobbies.all();
      case 'create_hobby':
        return repos.hobbies.insert({ id: uid(), name: args.req.name, description: args.req.description || '', category: args.req.category || '', icon: args.req.icon || '🎨', color: args.req.color || '#8B5CF6', status: args.req.status || 'active', progress: args.req.progress || 0, note: args.req.note || '', created_at: now(), updated_at: now() });
      case 'update_hobby':
        return repos.hobbies.update(args.req.id, { name: args.req.name, description: args.req.description, category: args.req.category, status: args.req.status, progress: args.req.progress, note: args.req.note, updated_at: now() });
      case 'delete_hobby':
        return repos.hobbies.remove(args.id);

      case 'get_pomodoro_sessions':
        return repos.pomodoro.all();
      case 'create_pomodoro_session':
        return repos.pomodoro.insert({ id: uid(), todo_id: args.req.todo_id || '', duration: args.req.duration || 25, started_at: now(), completed_at: now(), status: 'completed' });
      case 'delete_pomodoro_session':
        return repos.pomodoro.remove(args.id);

      case 'get_weekly_reports':
        return repos.weekly.all();
      case 'create_weekly_report':
        return repos.weekly.insert({ id: uid(), week_start: args.req.week_start, week_end: args.req.week_end, summary: args.req.summary || '', highlights: args.req.highlights || '', mood_avg: args.req.mood_avg || 0, todo_done: args.req.todo_done || 0, created_at: now() });
      case 'generate_weekly_report': {
        const t = today();
        const weekStart = args.req.week_start, weekEnd = args.req.week_end;
        const done = repos.todos.all().filter((x) => x.due_date >= weekStart && x.due_date <= weekEnd && x.status === 'done').length;
        const moodRows = repos.moods.all().filter((x) => x.log_date >= weekStart && x.log_date <= weekEnd);
        const moodAvg = moodRows.length ? moodRows.reduce((s, m) => s + m.mood, 0) / moodRows.length : 0;
        return repos.weekly.insert({ id: uid(), week_start: weekStart, week_end: weekEnd, summary: `本周完成待办 ${done} 项，平均心情 ${moodAvg.toFixed(1)}/5。继续保持节奏，下周再接再厉！`, highlights: '', mood_avg: moodAvg, todo_done: done, created_at: now() });
      }
      case 'delete_weekly_report':
        return repos.weekly.remove(args.id);

      case 'get_cycle_stats': {
        const habits = repos.habits.all().map((h) => {
          const ws = buildHabitWithStatus(h);
          return { id: h.id, name: h.name, icon: h.icon, color: h.color, target_count: h.target_count, done_30: ws.today_count, total_days: ws.streak, rate: h.target_count > 0 ? Math.min(100, (ws.today_count / h.target_count) * 100) : 0, streak: ws.streak };
        });
        const learn = repos.learning.all().map((l) => ({ id: l.id, title: l.title, progress: l.progress, status: l.status }));
        const ms = repos.moods.all().filter((x) => x.log_date.startsWith(month()));
        const moodAvg = ms.length ? ms.reduce((s, m) => s + m.mood, 0) / ms.length : 0;
        return { habits, learning: learn, mood_avg: moodAvg, pomodoro_total: repos.pomodoro.all().length };
      }

      case 'get_dashboard_stats': {
        const t = today();
        // 习惯最长连续天数（截至今天，逐日往前数）
        const dates = new Set(repos.habit_records.all().map((r) => (r.record_date || '').slice(0, 10)));
        let streak = 0;
        const d = new Date();
        while (true) {
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          if (dates.has(key)) { streak++; d.setDate(d.getDate() - 1); } else break;
        }
        const learningActive = repos.learning.all().filter((x) => x.status === 'active').length;
        const ideaCount = repos.ideas.all().filter((x) => (x.created_at || '').startsWith(month())).length;
        const tm = repos.moods.all().find((x) => x.log_date === t);
        return { habit_streak: streak, learning_count: learningActive, this_month_ideas: ideaCount, today_mood: tm ? tm.mood : null };
      }

      /* ---- 数据备份：导出/导入 JSON ---- */
      case 'export_data': {
        const data = {};
        Object.keys(KEY_MAP).forEach((canon) => { data[canon] = new Repo(KEY_MAP[canon]).all(); });
        return { version: 1, exported_at: new Date().toISOString(), data };
      }
      case 'import_data': {
        const mode = (args.mode || 'replace');
        const data = (args.payload && typeof args.payload === 'object') ? args.payload : {};
        Object.keys(KEY_MAP).forEach((canon) => {
          const rows = Array.isArray(data[canon]) ? data[canon] : [];
          const repo = new Repo(KEY_MAP[canon]);
          if (mode === 'merge') {
            const byId = new Map(repo.all().map((x) => [x.id, x]));
            rows.forEach((r) => { if (r && r.id) byId.set(r.id, r); });
            repo.save([...byId.values()]);
          } else {
            repo.save(rows);
          }
        });
        return { ok: true };
      }

      /* ---- AI ---- */
      case 'generate_daily_summary':
        return aiDailySummary();
      case 'generate_mood_insight':
        return aiMoodInsight();
      case 'suggest_idea_tags':
        return aiSuggestTags(args.content);
      case 'ai_chat':
        return aiChat(args.req ? args.req.message : '');

      /* ---- 统一检索（后端 SQL 分页 + 日历日期回溯） ---- */
      case 'search_items': {
        const req = args.req || {};
        const modules = (req.modules && req.modules.length) ? req.modules : Object.keys(SEARCH_DEFS);
        const q = (req.q || '').trim().toLowerCase();
        const sd = (req.start_date || '').trim();
        const ed = (req.end_date || '').trim();
        const cat = (req.category || '').trim();
        const page = Math.max(1, req.page || 1);
        const pageSize = Math.min(200, Math.max(1, req.page_size || 30));
        const all = [];
        modules.forEach((m) => {
          const def = SEARCH_DEFS[m];
          if (!def) return;
          const repo = repos[def.repo];
          const rows = repo ? repo.all() : [];
          rows.forEach((row) => {
            const date = (row[def.date] || '').slice(0, 10);
            if (sd && date < sd) return;
            if (ed && date > ed) return;
            if (def.cat && cat && (row.category || '') !== cat) return;
            const title = (row[def.title] != null ? row[def.title] : '') + '';
            const body = (row[def.body] != null ? row[def.body] : '') + '';
            if (q && !((title + ' ' + body).toLowerCase().includes(q))) return;
            all.push({ id: row.id, module: m, title: title || body.slice(0, 40), body, item_date: date, category: def.cat ? (row.category || '') : '' });
          });
        });
        all.sort((a, b) => (b.item_date || '').localeCompare(a.item_date || ''));
        const total = all.length;
        const startIdx = (page - 1) * pageSize;
        const items = all.slice(startIdx, startIdx + pageSize);
        return { items, total, page, page_size: pageSize };
      }
      case 'get_knowledge_context': {
        const req = args.req || {};
        const res = await handle('search_items', { req: { modules: req.modules, start_date: req.start_date, end_date: req.end_date, q: req.q, category: req.category, page: 1, page_size: req.max_items || 300 } });
        const items = (res.items || []).map((it) => ({ module: it.module, item_date: it.item_date, title: it.title, body: it.body }));
        const text = items.length
          ? ('以下是用户在工作台中沉淀的历史记录，可作为回答的底层数据与知识库：\n' + items.map((it) => `- [${it.module}][${it.item_date || '未知日期'}] ${it.title || '（无标题）'}${it.body ? '：' + it.body : ''}`).join('\n'))
          : '（暂无记录）';
        return { text, items, total: res.total };
      }

      /* ---- 附件（截图/图片上传） ---- */
      case 'list_attachments': {
        const module = args.module || '';
        const rid = args.record_id;
        let all = repos.attachments.all();
        if (rid) all = all.filter((a) => a.module === module && a.record_id === rid);
        else all = all.filter((a) => a.module === module);
        return all
          .slice()
          .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
          .map((a) => ({ id: a.id, module: a.module, record_id: a.record_id, name: a.name, data: a.data, created_at: a.created_at }));
      }
      case 'save_attachment': {
        const { module, record_id, name, data } = args;
        const obj = { id: uid(), module, record_id, name: name || '截图', data, created_at: now() };
        repos.attachments.insert(obj);
        return obj;
      }
      case 'delete_attachment': {
        repos.attachments.remove(args.id);
        return { ok: true };
      }

      default:
        console.warn('[LocalBackend] 未处理的命令:', cmd);
        return null;
    }
  }

  return { handle, getSetting, setSetting, seed: seedIfNeeded, loadAttachments: () => AttachmentStore.load() };
})();

window.API = API;
