// 复现/验证 统一检索 + 知识库 浏览器端逻辑
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
global.document = {
  addEventListener() {},
  createElement() { return { style: {}, classList: { add() {}, toggle() {}, remove() {} }, appendChild() {}, remove() {}, querySelector() { return null; }, set onclick(_) {} }; },
  body: { appendChild() {} },
  getElementById() { return null; },
  querySelector() { return null; },
};

require('./src/scripts/utils.js');
require('./src/scripts/api.js');

const assert = (cond, name) => console.log((cond ? '✅' : '❌'), name, cond ? '' : 'FAIL');

(async () => {
  const API = global.window.API;
  await API.init();

  await API.todos.create({ title: '检索测试待办A', due_date: '2026-07-22', category: 'work' });
  await API.events.create({ title: '检索测试事件', start_date: '2026-07-22', end_date: '2026-07-22', all_day: true });
  await API.ideas.create({ content: '检索测试灵感 2026' });

  const sd = '2026-07-01', ed = '2026-07-31';

  console.log('\n--- search_items 直连（日期范围）---');
  const si = await API.search.items({ start_date: sd, end_date: ed });
  console.log('total:', si.total, 'items:', si.items.length);
  assert(si.total >= 3, 'search_items 日期范围命中 >=3');

  console.log('\n--- get_knowledge_context 递归 ---');
  const kc = await API.search.knowledge({ start_date: sd, end_date: ed });
  console.log('total:', kc.total, 'items:', kc.items.length);
  console.log('text[:160]:', kc.text.slice(0, 160));
  assert(kc.total >= 3, 'knowledge 递归命中 >=3');
  assert(kc.items.length >= 3, 'knowledge items 已填充');

  console.log('\n--- 关键词 ---');
  const kw = await API.search.items({ q: '检索测试' });
  assert(kw.total >= 3, '关键词检索命中 >=3');

  console.log('\n--- 分类过滤 ---');
  const cat = await API.search.items({ category: 'work' });
  assert(cat.total >= 1, '分类 work 命中 >=1');

  console.log('\n=== 检索/知识库验证结束 ===');
})().catch(e => { console.error('❌ ERROR:', e); process.exit(1); });
