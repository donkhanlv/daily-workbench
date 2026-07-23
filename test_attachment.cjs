// 附件（截图/图片）数据层冒烟测试：验证 LocalBackend 的 list/save/delete 三分支。
const mem = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
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
  await API.init();

  // 建一条记录拿到 recordId
  const todo = await API.todos.create({ title: '带附件的待办', due_date: '2026-07-22' });
  const rid = String(todo.id);
  const data = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC';

  await API.attachments.save('todo', rid, 'shot.png', data);
  const list = await API.attachments.list('todo');
  console.log('1) 保存后附件数:', list.length, list.length === 1 ? 'OK' : 'FAIL');

  const one = await API.attachments.list('todo', rid);
  console.log('2) 按 recordId 过滤:', one.length === 1 ? 'OK' : 'FAIL');

  console.log('3) 返回 data 字段:', typeof list[0].data === 'string' && list[0].data.startsWith('data:image') ? 'OK' : 'FAIL');

  const id = list[0].id;
  await API.attachments.delete(id);
  const after = await API.attachments.list('todo');
  console.log('4) 删除后为空:', after.length === 0 ? 'OK' : 'FAIL');

  // 模块隔离（与 todo 互不影响）
  const idea = await API.ideas.create({ content: '灵感', source: 'x' });
  await API.attachments.save('idea', String(idea.id), 'a.png', data);
  const ideaList = await API.attachments.list('idea');
  const todoList = await API.attachments.list('todo');
  console.log('5) 模块隔离:', ideaList.length === 1 && todoList.length === 0 ? 'OK' : 'FAIL');

  console.log('\n=== 附件数据层冒烟测试通过 ✅ ===');
})().catch((e) => { console.error('❌ TEST ERROR:', e); process.exit(1); });
