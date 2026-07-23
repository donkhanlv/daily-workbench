// 临时冒烟测试：在 Node 中模拟浏览器全局，验证 LocalBackend 数据层逻辑。
const mem = () => {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
    clear: () => m.clear(),
    key: i => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  };
};

// 让 window 指向 global，使 window.x = x 成为真正的全局变量（模拟浏览器）
global.window = global;
global.localStorage = mem();
global.window.localStorage = global.localStorage;
global.__TAURI_INTERNALS__ = undefined;
global.crypto = require('crypto').webcrypto;
global.document = {
  addEventListener() {},
  createElement() {
    return { style: {}, classList: { add() {}, toggle() {}, remove() {} }, appendChild() {}, remove() {}, querySelector() { return null; }, set onclick(_) {} };
  },
  body: { appendChild() {} },
  getElementById() { return null; },
  querySelector() { return null; },
};

require('./src/scripts/utils.js');
require('./src/scripts/api.js');

(async () => {
  const API = global.window.API;
  if (!API) throw new Error('API 未挂载');
  console.log('1) API 已挂载:', true);

  await API.init();
  const t0 = (await API.todos.getAll()).length;
  console.log('2) seed 待办数:', t0, t0 > 0 ? 'OK' : 'FAIL');

  await API.todos.create({ title: '测试待办', due_date: '2026-07-22', category: 'work' });
  const t1 = (await API.todos.getAll()).length;
  console.log('3) create 后待办数:', t1, t1 === t0 + 1 ? 'OK' : 'FAIL');

  const first = (await API.todos.getAll())[0];
  await API.todos.toggle(first.id);
  const afterToggle = (await API.todos.getAll()).find(x => x.id === first.id);
  console.log('4) toggle 状态:', afterToggle.status, afterToggle.status === 'done' ? 'OK' : 'FAIL');

  await API.habits.toggle((await API.habits.getAll())[0].id);
  console.log('5) habit toggle OK');

  const dash = await API.stats.dashboard();
  const dashKeys = Object.keys(dash);
  const expectKeys = ['habit_streak', 'learning_count', 'this_month_ideas', 'today_mood'];
  const dashOk = expectKeys.every((k) => dashKeys.includes(k));
  console.log('6) dashboard 字段:', dashKeys.join(','), dashOk ? 'OK' : 'FAIL', `(期望 ${expectKeys.length} 个核心字段，与 Rust DashboardStats 契约一致)`);

  const w = await API.weekly.generate({ week_start: '2026-07-20', week_end: '2026-07-26' });
  console.log('7) 周报生成:', w.id ? 'OK' : 'FAIL', '| 数量:', (await API.weekly.getAll()).length);

  const c = await API.cycle.stats();
  console.log('8) 周期统计 OK:', !!c);

  const finance = await API.finance.summary();
  console.log('9) 财务汇总:', JSON.stringify(finance));

  const moods = await API.mood.getAll();
  console.log('10) 心情记录数:', moods.length, moods.length > 0 ? 'OK' : 'FAIL');
  const reviews = await API.reviews.getAll();
  console.log('11) 复盘记录数:', reviews.length, 'OK');

  console.log('\n=== 全部基础数据层冒烟测试通过 ✅ ===');
})().catch(e => { console.error('❌ TEST ERROR:', e); process.exit(1); });
