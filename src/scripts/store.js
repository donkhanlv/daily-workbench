/**
 * Store - 全局数据缓存与各模块加载器
 * 所有数据通过 API 层加载（自动适配 Tauri / 浏览器双轨）
 */
const Store = {
  // 数据容器
  todos: [],
  events: [],
  ideas: [],
  habits: [],
  memos: [],
  daily: null,
  learning: [],
  reviews: [],
  transactions: [],
  moods: [],
  health: [],
  hobbies: [],
  pomodoro: [],
  weekly: [],
  cycle: null,
  stats: null,

  set(key, val) { this[key] = val; return val; },

  // 单模块加载器：返回数据并写入缓存
  async loadTodos(status) { this.todos = await API.todos.getAll(status); return this.todos; },
  async loadEvents(month) { this.events = await API.events.getAll(month); return this.events; },
  async loadIdeas() { this.ideas = await API.ideas.getAll(); return this.ideas; },
  async loadHabits() { this.habits = await API.habits.getAll(); return this.habits; },
  async loadMemos() { this.memos = await API.memos.getAll(); return this.memos; },
  async loadDaily(date) { this.daily = await API.daily.get(date); return this.daily; },
  async loadLearning() { this.learning = await API.learning.getAll(); return this.learning; },
  async loadReviews() { this.reviews = await API.reviews.getAll(); return this.reviews; },
  async loadTransactions(month) { this.transactions = await API.finance.getTransactions(month); return this.transactions; },
  async loadMoods(month) { this.moods = await API.mood.getAll(month); return this.moods; },
  async loadHealth(type) { this.health = await API.health.getAll(type); return this.health; },
  async loadHobbies() { this.hobbies = await API.hobbies.getAll(); return this.hobbies; },
  async loadPomodoro() { this.pomodoro = await API.pomodoro.getAll(); return this.pomodoro; },
  async loadWeekly() { this.weekly = await API.weekly.getAll(); return this.weekly; },
  async loadCycle() { this.cycle = await API.cycle.stats(); return this.cycle; },
  async loadDashboard() { this.stats = await API.stats.dashboard(); return this.stats; },

  // 加载除每日日志外所有模块（用于初始化）
  async loadAll() {
    await Promise.all([
      this.loadTodos(), this.loadEvents(), this.loadIdeas(), this.loadHabits(),
      this.loadMemos(), this.loadLearning(), this.loadReviews(), this.loadTransactions(),
      this.loadMoods(), this.loadHealth(), this.loadHobbies(), this.loadPomodoro(),
      this.loadWeekly(), this.loadCycle(), this.loadDashboard(),
    ]);
  },

  // 日期工具
  today() {
    const d = new Date(); const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  },
  thisMonth() { return new Date().toISOString().slice(0, 7); },
};

window.Store = Store;
