// 数据备份（导出/导入 JSON）端到端测试：模拟浏览器全局，验证双模式数据层。
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
global.window = global;
global.localStorage = mem();
global.window.localStorage = global.localStorage;
global.__TAURI_INTERNALS__ = undefined;
global.crypto = require('crypto').webcrypto;
global.document = { addEventListener() {}, createElement() { return { style: {}, classList: { add() {}, toggle() {}, remove() {} }, appendChild() {}, remove() {}, querySelector() { return null; }, set onclick(_) {} }; }, body: { appendChild() {} }, getElementById() { return null; }, querySelector() { return null; } };

require('./src/scripts/utils.js');
require('./src/scripts/api.js');

const EXPECT_KEYS = ['todos','events','ideas','habits','habit_records','memos','daily_logs','learning','reviews','transactions','moods','health_metrics','hobbies','pomodoro_sessions','weekly_reports'];
let pass = 0, fail = 0;
const ok = (name, cond, extra='') => { if (cond) { pass++; console.log('  ✅', name, extra); } else { fail++; console.log('  ❌', name, extra); } };

(async () => {
  const API = global.window.API;
  await API.init();
  // 写入设置，便于验证设置也随备份迁移
  global.localStorage.setItem('dw_settings', JSON.stringify({ theme: 'dark', foo: 'bar' }));
  // 造点差异数据
  await API.todos.create({ title: '备份测试待办', due_date: '2026-07-22', category: 'work' });
  await API.ideas.create({ content: '备份测试灵感', source: '测试' });

  // 1) 导出
  const payload = await API.settings.exportAll();
  ok('导出返回 version=1', payload.version === 1);
  ok('导出包含 15 张规范表', EXPECT_KEYS.every(k => Array.isArray(payload.data[k])), EXPECT_KEYS.filter(k => !Array.isArray(payload.data[k])).join(',') || '');
  ok('导出包含 settings', payload.settings && payload.settings.theme === 'dark', JSON.stringify(payload.settings));
  const snap = JSON.stringify(payload); // 快照

  const todosN = (await API.todos.getAll()).length;
  const firstId = (await API.todos.getAll())[0].id;
  ok('导出前待办数 > 0', todosN > 0, '(' + todosN + ')');

  // 2) 模拟数据丢失后「覆盖」导入
  global.localStorage.removeItem('dw_todos');
  ok('丢失后待办为 0', (await API.todos.getAll()).length === 0);
  await API.settings.importAll(JSON.parse(snap), 'replace');
  const restored = await API.todos.getAll();
  ok('覆盖导入后待办数恢复', restored.length === todosN, '(' + restored.length + ')');
  ok('覆盖导入保留原 ID', restored.some(x => x.id === firstId));

  // 3) 「合并」模式：保留新数据
  await API.todos.create({ title: '合并新增待办', due_date: '2026-07-22', category: 'work' });
  const mergedN = (await API.todos.getAll()).length; // todosN + 1
  await API.settings.importAll(JSON.parse(snap), 'merge'); // snap 只有原 todosN 条
  const afterMerge = await API.todos.getAll();
  ok('合并导入后数量 = 原 + 新增', afterMerge.length === mergedN, '(' + afterMerge.length + ' vs ' + mergedN + ')');
  ok('合并导入保留新增记录', afterMerge.some(x => x.title === '合并新增待办'));

  // 4) 设置随导入还原
  global.localStorage.setItem('dw_settings', JSON.stringify({ theme: 'light' }));
  await API.settings.importAll(JSON.parse(snap), 'replace');
  ok('设置随导入还原', JSON.parse(global.localStorage.getItem('dw_settings')).theme === 'dark');

  // 5) 跨表一致性（导入后其它表仍在）
  ok('习惯表导入后非空', (await API.habits.getAll()).length > 0);
  ok('灵感表导入后非空', (await API.ideas.getAll()).length > 0);

  console.log(`\n=== 备份导出/导入测试：${pass} 通过 / ${fail} 失败 ${fail === 0 ? '✅' : '❌'} ===`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('❌ TEST ERROR:', e); process.exit(1); });
