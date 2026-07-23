/* ============================================================
 * 日常工作台 - 前端主逻辑
 * 负责：路由渲染、各模块 CRUD 交互、番茄钟、AI 面板、日历
 * ============================================================ */

/* ---------- 通用工具 ---------- */
function el(id) { return document.getElementById(id); }
function esc(s) {
  return (s == null ? '' : String(s)).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
function parseTags(s) {
  try { const a = JSON.parse(s); return Array.isArray(a) ? a : []; } catch (e) { return s ? [s] : []; }
}
function localToday() {
  const d = new Date(); const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function localMonth() {
  const d = new Date(); const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}`;
}
function weekRange() {
  const d = new Date(); const day = d.getDay() || 7;
  const mon = new Date(d); mon.setDate(d.getDate() - day + 1);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  const p = (n) => String(n).padStart(2, '0');
  const f = (x) => `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
  return { s: f(mon), e: f(sun) };
}
const MOOD_EMOJI = ['😢', '🙁', '😐', '🙂', '😊'];

/* ---------- 主题 ---------- */
function getTheme() { return API.settings.get('theme', 'light'); }
function applyTheme() {
  const t = getTheme();
  document.body.classList.toggle('theme-dark', t === 'dark');
  const tg = document.getElementById('themeToggle'); if (tg) tg.checked = t === 'dark';
}
function toggleTheme() {
  API.settings.set('theme', getTheme() === 'dark' ? 'light' : 'dark');
  applyTheme();
}

/* ---------- 搜索 / 筛选（数据增长后的基础检索体验） ---------- */
const Search = { q: '', cat: '', status: 'all' };
const DEFAULT_CATS = ['工作', '生活', '学习', '健康', '财务', '灵感', 'work', 'life', 'study'];
// 各页面可过滤条目的选择器
const ITEM_SEL = {
  todo: '#page-todo .todo-list li',
  ideas: '#page-ideas .idea-card',
  memos: '#page-memos .memo-card',
  learning: '#page-learning .learn-item',
  hobbies: '#page-hobbies .hobby-card',
  review: '#page-review .review-card',
  finance: '#page-finance .todo-item',
  mood: '#page-mood .mood-row',
  calendar: '#page-calendar .todo-list li',
  weekly: '#page-weekly .weekly-card',
  pomodoro: '#page-pomodoro .todo-item',
};

// 把当前激活的筛选条件应用到当前页面的列表项
function applyFilters() {
  const page = document.querySelector('.page.active');
  if (!page) return;
  const pid = page.id.replace('page-', '');
  const sel = ITEM_SEL[pid];
  if (!sel) return;
  const q = (Search.q || '').trim().toLowerCase();
  let shown = 0, total = 0;
  page.querySelectorAll(sel).forEach((it) => {
    total++;
    let ok = true;
    if (q && !(it.textContent || '').toLowerCase().includes(q)) ok = false;
    if (ok && pid === 'todo') {
      if (Search.cat && (it.getAttribute('data-category') || '') !== Search.cat) ok = false;
      if (ok && Search.status !== 'all' && (it.getAttribute('data-status') || '') !== Search.status) ok = false;
    }
    it.style.display = ok ? '' : 'none';
    if (ok) shown++;
  });
  if (pid === 'todo') {
    document.querySelectorAll('#todoStatusSeg .seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.status === Search.status));
    const hint = document.getElementById('todoFilterHint');
    if (hint) hint.textContent = (Search.q || Search.cat || Search.status !== 'all') ? `显示 ${shown}/${total}` : '';
  }
}

// 根据默认分类 + 用户自定义分类 刷新 datalist 与设置页标签
function refreshCatList() {
  const dl = document.getElementById('catList');
  if (dl) {
    const custom = API.settings.get('categories', []) || [];
    const all = [...new Set([...DEFAULT_CATS, ...custom])];
    dl.innerHTML = all.map((c) => `<option value="${esc(c)}"></option>`).join('');
  }
  const chips = document.getElementById('catChips');
  if (chips) {
    const custom = API.settings.get('categories', []) || [];
    chips.innerHTML = [...new Set([...DEFAULT_CATS, ...custom])].map((c) => `<span class="cat-chip">${esc(c)}</span>`).join('');
  }
}

/* ---------- 统一检索：后端分页 + 前端虚拟滚动 ---------- */
const SEARCH_MODULES = [
  { key: 'todo', label: '待办', icon: '✅' },
  { key: 'event', label: '日程', icon: '📅' },
  { key: 'idea', label: '灵感', icon: '💡' },
  { key: 'memo', label: '备忘录', icon: '📝' },
  { key: 'diary', label: '日记', icon: '🌿' },
  { key: 'learning', label: '学习', icon: '📚' },
  { key: 'review', label: '复盘', icon: '🔄' },
  { key: 'finance', label: '记账', icon: '💰' },
  { key: 'mood', label: '心情', icon: '😊' },
  { key: 'health', label: '健康', icon: '💪' },
  { key: 'weekly', label: '周报', icon: '📊' },
];
const SEARCH_ROW_H = 76;
const SEARCH_BUFFER = 6;
const SearchState = {
  open: false,
  q: '', start: '', end: '', cat: '',
  modules: SEARCH_MODULES.map((m) => m.key),
  buffer: [], total: 0, page: 1, pageSize: 30, loading: false, done: false,
};

function searchModuleMeta(key) { return SEARCH_MODULES.find((m) => m.key === key) || { key, label: key, icon: '📌' }; }

function renderSearchModules() {
  const box = el('searchModules'); if (!box) return;
  box.innerHTML = SEARCH_MODULES.map((m) => {
    const on = SearchState.modules.includes(m.key);
    return `<button class="mod-chip ${on ? 'on' : ''}" onclick="App.onSearchModule('${m.key}')">${m.icon} ${m.label}</button>`;
  }).join('');
}

function updateSearchMeta() {
  const meta = el('searchMeta'); if (!meta) return;
  meta.textContent = SearchState.total ? `共 ${SearchState.total} 条 · 已加载 ${SearchState.buffer.length} 条（虚拟滚动 + 后端分页）` : '没有匹配的记录';
}

function renderSearchRow(it) {
  const meta = searchModuleMeta(it.module);
  const date = (it.item_date || '').slice(0, 10);
  const title = (it.title || '').trim() || (it.body || '').slice(0, 40) || '（无标题）';
  const body = (it.body || '').trim();
  return `<div class="vrow" style="height:${SEARCH_ROW_H}px">
    <div class="vrow-icon">${meta.icon}</div>
    <div class="vrow-body">
      <div class="vrow-title">${esc(title)}</div>
      <div class="vrow-meta">${meta.label}${date ? ' · ' + esc(date) : ''}${it.category ? ' · ' + esc(it.category) : ''}</div>
      ${body ? `<div class="vrow-text">${esc(body.length > 80 ? body.slice(0, 80) + '…' : body)}</div>` : ''}
    </div>
  </div>`;
}

function paintSearchWindow() {
  const scroll = el('searchScroll'); const spacer = el('searchSpacer'); const rowsEl = el('searchRows');
  if (!scroll || !spacer || !rowsEl) return;
  const total = SearchState.total;
  spacer.style.height = (total * SEARCH_ROW_H) + 'px';
  const first = Math.max(0, Math.floor(scroll.scrollTop / SEARCH_ROW_H) - SEARCH_BUFFER);
  const visible = Math.ceil(scroll.clientHeight / SEARCH_ROW_H) + 1;
  const last = Math.min(total, first + visible + 2 * SEARCH_BUFFER);
  const slice = SearchState.buffer.slice(first, last);
  rowsEl.style.top = (first * SEARCH_ROW_H) + 'px';
  if (slice.length) {
    rowsEl.style.height = ((last - first) * SEARCH_ROW_H) + 'px';
    rowsEl.innerHTML = slice.map((it) => renderSearchRow(it)).join('');
  } else {
    rowsEl.style.height = '100%';
    rowsEl.innerHTML = (SearchState.buffer.length === 0 && !SearchState.loading) ? '<div class="vlist-empty">没有匹配的记录</div>' : '';
  }
  // 触底自动加载下一页（后端分页续拉）
  if (!SearchState.done && !SearchState.loading && last >= SearchState.buffer.length - SEARCH_BUFFER) {
    runSearch(false);
  }
}

async function runSearch(reset) {
  if (reset) { SearchState.buffer = []; SearchState.page = 1; SearchState.done = false; }
  if (SearchState.loading || SearchState.done) return;
  SearchState.loading = true;
  const req = {
    q: SearchState.q || undefined,
    start_date: SearchState.start || undefined,
    end_date: SearchState.end || undefined,
    category: SearchState.cat || undefined,
    modules: SearchState.modules,
    page: SearchState.page,
    page_size: SearchState.pageSize,
  };
  try {
    const res = await API.search.items(req);
    SearchState.buffer.push(...(res.items || []));
    SearchState.total = res.total || 0;
    if (SearchState.buffer.length >= SearchState.total) SearchState.done = true;
    SearchState.page++;
    updateSearchMeta();
    paintSearchWindow();
  } catch (e) {
    UI.toast('检索失败：' + (e && e.message ? e.message : e), 'error');
  } finally {
    SearchState.loading = false;
  }
}

async function renderSearch() {
  SearchState.open = true;
  renderSearchModules();
  await runSearch(true);
  requestAnimationFrame(() => paintSearchWindow());
}

/* ---------- 日历 ---------- */
const Calendar = (() => {
  let state = { y: new Date().getFullYear(), m: new Date().getMonth() + 1 };
  function render() {
    const { y, m } = state;
    const monthEl = el('calMonth'); if (monthEl) monthEl.textContent = `${y}年${m}月`;
    const first = new Date(y, m - 1, 1);
    const startDay = first.getDay();
    const days = new Date(y, m, 0).getDate();
    const events = Store.events;
    const cells = [];
    for (let i = 0; i < startDay; i++) cells.push('<div class="cal-cell empty"></div>');
    for (let d = 1; d <= days; d++) {
      const p = (n) => String(n).padStart(2, '0');
      const dateStr = `${y}-${p(m)}-${p(d)}`;
      const dayEvents = events.filter((e) => (e.start_date || '').startsWith(dateStr));
      const isToday = dateStr === UI.today();
      cells.push(`<div class="cal-cell ${isToday ? 'today' : ''}" data-date="${dateStr}">
        <div class="cal-num">${d}</div>
        ${dayEvents.slice(0, 3).map((e) => `<div class="cal-dot" style="background:${e.color || '#5B8DEF'}"></div>`).join('')}
      </div>`);
    }
    const grid = el('calGrid'); if (grid) grid.innerHTML = cells.join('');
    renderEvents(UI.today());
  }
  function renderEvents(date) {
    state.selectedDate = date;
    const list = Store.events.filter((e) => (e.start_date || '').startsWith(date));
    const title = el('calEventsTitle'); if (title) title.textContent = `${date} 的日程（${list.length}）`;
    const box = el('calEvents');
    if (box) box.innerHTML = list.length
      ? list.map((e) => `<li class="todo-item"><span class="todo-check on"></span><div class="todo-body"><div class="todo-title">${esc(e.title)}</div><div class="todo-meta">${esc(e.start_date)}${e.all_day ? ' 全天' : ''}</div></div></li>`).join('')
      : '<li class="empty">这天还没有安排</li>';
  }
  async function prev() { state.m--; if (state.m < 1) { state.m = 12; state.y--; } await Store.loadEvents(localMonth()); render(); }
  async function next() { state.m++; if (state.m > 12) { state.m = 1; state.y++; } await Store.loadEvents(localMonth()); render(); }
  return { state, render, prev, next, renderEvents };
})();
window.Calendar = Calendar;

let selectedMood = 3;

/* ============================================================
 * 视图渲染
 * ============================================================ */
function todoRow(t, att) {
  const done = t.status === 'done';
  const cat = t.category || '';
  return `<li class="todo-item ${done ? 'done' : ''}" data-action="todo:toggle:${t.id}" data-category="${esc(cat)}" data-status="${esc(t.status)}">
    <span class="todo-check ${done ? 'on' : ''}"></span>
    <div class="todo-body">
      <div class="todo-title">${esc(t.title)}</div>
      <div class="todo-meta">${cat ? `<span class="cat-chip">${esc(cat)}</span>` : ''}${t.due_time ? `⏰ ${esc(t.due_time)}` : ''}</div>
    </div>
    <button class="todo-del" data-action="todo:delete:${t.id}">×</button>${attBadge('todo', t.id, att)}
  </li>`;
}

async function renderDashboard() {
  const att = await loadAttMap('todo');
  const stats = await Store.loadDashboard();
  const todos = await Store.loadTodos();
  const habits = await Store.loadHabits();
  const moods = await Store.loadMoods();
  const ideas = await Store.loadIdeas();
  const t = UI.today();
  const todayTodos = todos.filter((x) => x.due_date === t);
  const overdue = todos.filter((x) => x.due_date && x.due_date < t && x.status !== 'done').length;
  const undoneHabits = habits.filter((h) => !h.done_today).length;
  const cards = [
    { icon: '✅', label: '今日待办', value: todayTodos.length, sub: `已完成 ${todayTodos.filter((x) => x.status === 'done').length}` },
    { icon: '⏰', label: '逾期待办', value: overdue, sub: overdue ? '需尽快处理' : '很棒，无逾期' },
    { icon: '🔥', label: '习惯连续', value: stats.habit_streak, sub: '天最高连击' },
    { icon: '🎯', label: '待打卡习惯', value: undoneHabits, sub: undoneHabits ? '今天还没打卡' : '全部打卡 ✓' },
    { icon: '📚', label: '进行中的学习', value: stats.learning_count, sub: '项' },
    { icon: '💡', label: '本月灵感', value: stats.this_month_ideas, sub: '条' },
    { icon: '😊', label: '今日心情', value: stats.today_mood != null ? stats.today_mood + '/5' : '—', sub: '记录一下吧' },
  ];
  el('dashStats').innerHTML = cards.map((c) => `<div class="stat-card"><div class="stat-icon">${c.icon}</div><div class="stat-body"><div class="stat-value">${c.value}</div><div class="stat-label">${c.label}</div><div class="stat-sub">${c.sub}</div></div></div>`).join('');
  const pending = todayTodos.filter((x) => x.status !== 'done').slice(0, 6);
  el('dashTodos').innerHTML = pending.length ? pending.map((t) => todoRow(t, att)).join('') : '<li class="empty">今天还没有任务，去加一个吧～</li>';
  el('dashHabits').innerHTML = habits.length
    ? habits.map((h) => `<div class="habit-mini-item" data-action="habit:toggle:${h.habit.id}"><span class="hm-emoji">${esc(h.habit.icon)}</span><span class="hm-name">${esc(h.habit.name)}</span><span class="hm-dot ${h.done_today ? 'on' : ''}"></span></div>`).join('')
    : '<div class="empty">还没有习惯</div>';
  const idea = ideas[0];
  el('dashIdea').innerHTML = idea ? `<div class="idea-mini-card">${esc(idea.content)}</div>` : '<div class="empty">还没有灵感</div>';
  const mood = moods.find((x) => x.log_date === t);
  el('dashMood').innerHTML = mood ? `<div class="mood-big">${MOOD_EMOJI[mood.mood - 1]} <span>${mood.mood}/5</span></div>` : '<div class="empty">今天还没记心情</div>';
}

async function renderTodo() {
  const todos = await Store.loadTodos();
  const att = await loadAttMap('todo');
  const pending = todos.filter((x) => x.status !== 'done');
  const done = todos.filter((x) => x.status === 'done');
  el('todoPending').innerHTML = pending.length ? pending.map((t) => todoRow(t, att)).join('') : '<li class="empty">暂无进行中的任务</li>';
  el('todoDone').innerHTML = done.length ? done.map((t) => todoRow(t, att)).join('') : '<li class="empty">还没有完成的任务</li>';
  // 填充分类筛选下拉（保留当前选择）
  const sel = el('todoCatFilter');
  if (sel) {
    const cur = sel.value;
    const cats = [...new Set(todos.map((x) => (x.category || '').trim()).filter(Boolean))].sort();
    sel.innerHTML = '<option value="">全部分类</option>' + cats.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    if (cats.includes(cur)) sel.value = cur;
  }
  applyFilters();
}

async function renderIdeas() {
  const ideas = await Store.loadIdeas();
  const att = await loadAttMap('idea');
  el('ideaGrid').innerHTML = ideas.length
    ? ideas.map((i) => `<div class="idea-card"><div class="idea-text">${esc(i.content)}</div><div class="idea-foot"><span class="idea-tag">${esc(i.source || '灵感')}</span><button class="todo-del" data-action="idea:delete:${i.id}">×</button>${attBadge('idea', i.id, att)}</div></div>`).join('')
    : '<div class="empty-box">还没有灵感，点上方「记录灵感」捕捉第一个 ✨</div>';
}

async function renderDiary() {
  const t = UI.today();
  el('diaryDate').value = t;
  const log = await Store.loadDaily(t);
  if (log) {
    el('diaryMood').value = log.mood || 3;
    el('diaryWeather').value = log.weather || '';
    el('diaryHighlights').value = log.highlights || '';
    el('diaryGratitude').value = log.gratitude || '';
    el('diarySleep').value = log.sleep_hours || 7.5;
    el('diaryWater').value = log.water_cups || 6;
    el('diaryExercise').value = log.exercise_minutes || 30;
    el('diarySummary').value = log.summary || '';
  }
}

async function renderHobbies() {
  const list = await Store.loadHobbies();
  const att = await loadAttMap('hobby');
  el('hobbyGrid').innerHTML = list.length
    ? list.map((h) => `<div class="hobby-card" style="border-color:${h.color}33">
        <div class="hobby-top"><span class="hobby-emoji" style="background:${h.color}22">${esc(h.icon)}</span>
          <div class="hobby-info"><div class="hobby-name">${esc(h.name)}</div><div class="hobby-cat">${esc(h.category || '')}</div></div>
          <div class="row-actions"><button class="mini-btn" data-action="hobby:edit:${h.id}">编辑</button><button class="todo-del" data-action="hobby:delete:${h.id}">×</button>${attBadge('hobby', h.id, att)}</div>
        </div>
        <div class="progress"><div class="progress-bar" style="width:${h.progress || 0}%;background:${h.color}"></div></div>
        <div class="hobby-foot">进度 ${h.progress || 0}%</div>
      </div>`).join('')
    : '<div class="empty-box">还没有爱好，添加一个点亮生活 🎨</div>';
}

async function renderReviews() {
  const list = await Store.loadReviews();
  const att = await loadAttMap('review');
  el('reviewGrid').innerHTML = list.length
    ? list.map((r) => `<div class="review-card">
        <div class="review-head"><span class="review-type">${esc(r.type || '周复盘')}</span><button class="todo-del" data-action="review:delete:${r.id}">×</button>${attBadge('review', r.id, att)}</div>
        <div class="review-period">${esc(r.period_start)} ~ ${esc(r.period_end)}</div>
        <div class="review-sec"><b>✅ 成就</b><p>${esc(r.achievements)}</p></div>
        <div class="review-sec"><b>🔧 改进</b><p>${esc(r.improvements)}</p></div>
        <div class="review-sec"><b>🎯 下一步</b><p>${esc(r.goals_next)}</p></div>
        <div class="review-rate">评分 ${r.rating || 5}/10</div>
      </div>`).join('')
    : '<div class="empty-box">还没有复盘，写第一篇内容复盘吧 🔄</div>';
}

async function renderMemos() {
  const list = await Store.loadMemos();
  const att = await loadAttMap('memo');
  el('memoGrid').innerHTML = list.length
    ? list.map((m) => `<div class="memo-card" style="background:${m.color || '#FFF9C4'}">
        <div class="memo-head"><span class="memo-title">${esc(m.title || '备忘录')}</span><button class="todo-del dark" data-action="memo:delete:${m.id}">×</button>${attBadge('memo', m.id, att)}</div>
        <div class="memo-body">${esc(m.content)}</div>
      </div>`).join('')
    : '<div class="empty-box">还没有备忘录，记一条重要的事 📝</div>';
}

async function renderLearning() {
  const list = await Store.loadLearning();
  const att = await loadAttMap('learning');
  el('learnList').innerHTML = list.length
    ? list.map((l) => `<div class="learn-item">
        <div class="learn-head"><span class="learn-title">${esc(l.title)}</span>
          <span class="learn-type">${esc(l.type || '')}</span>
          <div class="row-actions"><button class="mini-btn" data-action="learning:progress:${l.id}">更新进度</button><button class="todo-del" data-action="learning:delete:${l.id}">×</button>${attBadge('learning', l.id, att)}</div>
        </div>
        <div class="progress"><div class="progress-bar" style="width:${l.progress || 0}%"></div></div>
        <div class="learn-foot">${l.progress || 0}%${l.current_page ? ` · 已读 ${l.current_page}/${l.total_pages || '?'} 页` : ''}${l.status === 'done' ? ' · 已完成 🎉' : ''}</div>
      </div>`).join('')
    : '<div class="empty-box">还没有学习项，添加一门想精进的技能 📚</div>';
}

async function renderCycle() {
  const c = await Store.loadCycle();
  el('cycleStats').innerHTML = [
    { icon: '🍅', label: '累计番茄', value: c.pomodoro_total },
    { icon: '😊', label: '本月平均心情', value: c.mood_avg ? c.mood_avg.toFixed(1) + '/5' : '—' },
    { icon: '🔥', label: '习惯数', value: c.habits.length },
    { icon: '📚', label: '学习项', value: c.learning.length },
  ].map((x) => `<div class="stat-card"><div class="stat-icon">${x.icon}</div><div class="stat-body"><div class="stat-value">${x.value}</div><div class="stat-label">${x.label}</div></div></div>`).join('');
  el('cycleHabits').innerHTML = c.habits.length
    ? c.habits.map((h) => `<div class="cycle-row"><span class="cr-emoji">${esc(h.icon)}</span><span class="cr-name">${esc(h.name)}</span>
        <div class="progress flex1"><div class="progress-bar" style="width:${h.rate}%;background:${h.color}"></div></div>
        <span class="cr-num">${h.rate.toFixed(0)}%</span><span class="cr-streak">🔥${h.streak}天</span></div>`).join('')
    : '<div class="empty">还没有习惯</div>';
  el('cycleLearning').innerHTML = c.learning.length
    ? c.learning.map((l) => `<div class="cycle-row"><span class="cr-emoji">📚</span><span class="cr-name">${esc(l.title)}</span>
        <div class="progress flex1"><div class="progress-bar" style="width:${l.progress || 0}%"></div></div>
        <span class="cr-num">${l.progress || 0}%</span></div>`).join('')
    : '<div class="empty">还没有学习项</div>';
}

async function renderMood() {
  el('moodPicker').innerHTML = MOOD_EMOJI.map((e, i) => `<button class="mood-emoji ${i + 1 === selectedMood ? 'sel' : ''}" data-action="mood:pick:${i + 1}">${e}</button>`).join('');
  const list = await Store.loadMoods();
  const att = await loadAttMap('mood');
  el('moodList').innerHTML = list.length
    ? list.slice().reverse().map((m) => `<div class="mood-row"><span class="mood-e">${MOOD_EMOJI[m.mood - 1]}</span>
        <div class="mood-info"><div class="mood-note">${esc(m.note) || '（无备注）'}</div><div class="mood-date">${esc(m.log_date)}</div></div>
        <button class="todo-del" data-action="mood:delete:${m.id}">×</button>${attBadge('mood', m.id, att)}</div>`).join('')
    : '<div class="empty">还没有心情记录</div>';
}

async function renderHealth() {
  const habits = await Store.loadHabits();
  el('habitList').innerHTML = habits.length
    ? habits.map((h) => `<div class="habit-row" data-action="habit:toggle:${h.habit.id}">
        <span class="habit-emoji">${esc(h.habit.icon)}</span>
        <div class="habit-mid"><div class="habit-name">${esc(h.habit.name)}</div><div class="habit-sub">${h.today_count}/${h.habit.target_count} 次 · 🔥${h.streak}天</div></div>
        <span class="habit-state ${h.done_today ? 'on' : ''}">${h.done_today ? '已完成' : '去打卡'}</span>
        <button class="todo-del" data-action="habit:delete:${h.habit.id}">×</button>
      </div>`).join('')
    : '<div class="empty">还没有习惯，点「新建习惯」开始</div>';
  const metrics = await Store.loadHealth();
  const att = await loadAttMap('health');
  const grouped = {};
  metrics.forEach((m) => { (grouped[m.metric_type] = grouped[m.metric_type] || []).push(m); });
  el('healthList').innerHTML = metrics.length
    ? Object.keys(grouped).map((type) => `<div class="health-group"><div class="health-type">${esc(type)}</div>${grouped[type].map((m) => `<div class="health-row"><span>${esc(m.value)} ${esc(m.unit || '')}</span><span class="mood-date">${esc(m.record_date)}</span><button class="todo-del" data-action="health:delete:${m.id}">×</button>${attBadge('health', m.id, att)}</div>`).join('')}</div>`).join('')
    : '<div class="empty">还没有健康指标记录</div>';
}

async function renderFinance() {
  const s = await API.finance.summary(localMonth());
  el('financeSummary').innerHTML = `<div class="fin-card income"><div class="fin-label">收入</div><div class="fin-val">¥${s.income.toFixed(2)}</div></div>
    <div class="fin-card expense"><div class="fin-label">支出</div><div class="fin-val">¥${s.expense.toFixed(2)}</div></div>
    <div class="fin-card balance"><div class="fin-label">结余</div><div class="fin-val">¥${s.balance.toFixed(2)}</div></div>`;
  const list = await Store.loadTransactions(localMonth());
  const att = await loadAttMap('finance');
  el('txList').innerHTML = list.length
    ? list.slice().reverse().map((t) => `<li class="todo-item">
        <span class="tx-dot ${t.type}"></span>
        <div class="todo-body"><div class="todo-title">${esc(t.category)} ${esc(t.note || '')}</div><div class="todo-meta">${esc(t.record_date)}</div></div>
        <span class="tx-amt ${t.type}">${t.type === 'income' ? '+' : '-'}¥${t.amount.toFixed(2)}</span>
        <button class="todo-del" data-action="tx:delete:${t.id}">×</button>${attBadge('finance', t.id, att)}
      </li>`).join('')
    : '<li class="empty">本月还没有记账</li>';
}

let pomoTimer = null, pomoLeft = 25 * 60;
function updatePomoDisplay() {
  const m = Math.floor(pomoLeft / 60), s = pomoLeft % 60;
  const e = el('pomoTimer'); if (e) e.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
function startTimer() {
  if (pomoTimer) return;
  pomoTimer = setInterval(() => {
    pomoLeft--; updatePomoDisplay();
    if (pomoLeft <= 0) {
      clearInterval(pomoTimer); pomoTimer = null; pomoLeft = 25 * 60; updatePomoDisplay();
      API.pomodoro.create({ duration: 25 }).then(() => { UI.toast('🍅 完成一个番茄！'); if (API.settings.get('notify_enabled', false)) UI.notify('🍅 番茄完成', '休息一下，喝口水～'); renderPomodoro(); renderDashboard(); });
    }
  }, 1000);
  const tip = el('pomoTip'); if (tip) tip.textContent = '专注中…完成后自动记录 🍅';
}
function resetTimer() {
  if (pomoTimer) { clearInterval(pomoTimer); pomoTimer = null; }
  pomoLeft = 25 * 60; updatePomoDisplay();
  const tip = el('pomoTip'); if (tip) tip.textContent = '点「开始」进入专注';
}
async function renderPomodoro() {
  const list = await Store.loadPomodoro();
  el('pomoList').innerHTML = list.length
    ? list.slice().reverse().map((p) => `<li class="todo-item"><span class="todo-check on"></span>
        <div class="todo-body"><div class="todo-title">🍅 专注 ${p.duration} 分钟</div><div class="todo-meta">${esc(UI.formatTime(p.completed_at))}</div></div>
        <button class="todo-del" data-action="pomo:delete:${p.id}">×</button></li>`).join('')
    : '<li class="empty">还没有专注记录</li>';
}

async function renderWeekly() {
  const list = await Store.loadWeekly();
  el('weeklyList').innerHTML = list.length
    ? list.map((w) => `<div class="weekly-card">
        <div class="weekly-head"><span>${esc(w.week_start)} ~ ${esc(w.week_end)}</span><button class="todo-del" data-action="weekly:delete:${w.id}">×</button></div>
        <div class="weekly-summary">${esc(w.summary)}</div>
        <div class="weekly-meta">平均心情 ${w.mood_avg ? w.mood_avg.toFixed(1) : '—'}/5 · 完成待办 ${w.todo_done} 项</div>
      </div>`).join('')
    : '<div class="empty-box">还没有周报，点「自动生成本周」试试 ✨</div>';
}

function renderSettings() {
  const tg = document.getElementById('themeToggle'); if (tg) tg.checked = getTheme() === 'dark';
  const ci = document.getElementById('catInput');
  if (ci) ci.value = (API.settings.get('categories', []) || []).join(', ');
  // AI 配置
  API.ai.getConfig().then((cfg) => {
    const p = document.getElementById('aiProvider'); if (p) p.value = cfg.provider || 'openai';
    const m = document.getElementById('aiModel'); if (m) m.value = cfg.model || 'gpt-4o-mini';
    const k = document.getElementById('aiApiKey'); if (k) k.value = cfg.api_key || '';
    const b = document.getElementById('aiApiBase'); if (b) b.value = cfg.api_base || '';
  });
  // 桌面通知开关
  const ne = document.getElementById('notifyEnabled');
  if (ne) {
    ne.checked = !!API.settings.get('notify_enabled', false);
    ne.onchange = () => { API.settings.set('notify_enabled', ne.checked); UI.toast(ne.checked ? '桌面通知已开启 🔔' : '桌面通知已关闭'); };
  }
  refreshCatList();
}

// 启动概览通知（仅在开启桌面通知时，避免打扰）
async function maybeNotifySummary() {
  if (!API.settings.get('notify_enabled', false)) return;
  try {
    const t = UI.today();
    const todos = Store.todos || [];
    const habits = Store.habits || [];
    const events = Store.events || [];
    const pending = todos.filter((x) => x.status !== 'done').length;
    const overdue = todos.filter((x) => x.due_date && x.due_date < t && x.status !== 'done').length;
    const todayEv = events.filter((x) => x.start_date === t).length;
    const undoneHabits = habits.filter((h) => !h.done_today).length;
    UI.notify('☀️ 今日概览', `待办 ${pending} · 逾时 ${overdue} · 今日日程 ${todayEv} · 待打卡习惯 ${undoneHabits}`);
  } catch (e) { console.warn('[概览通知] 生成失败', e); }
}

async function renderCalendar() { await Store.loadEvents(localMonth()); Calendar.render(); }

/* ============================================================
 * 弹窗表单
 * ============================================================ */
function openTodoModal() {
  UI.modal({
    title: '新建任务',
    content: `
      <div class="form-row"><label>标题</label><input id="f_title" placeholder="要做的事"></div>
      <div class="form-row"><label>优先级</label><select id="f_prio"><option value="1">低</option><option value="2">中</option><option value="3" selected>高</option></select></div>
      <div class="form-row three"><div><label>日期</label><input type="date" id="f_date" value="${localToday()}"></div><div><label>时间</label><input type="time" id="f_time"></div><div><label>分类</label><input id="f_cat" list="catList" placeholder="如 work"></div></div>
      <div class="form-row"><label>标签(逗号)</label><input id="f_tags" placeholder="工作,重要"></div>
      <div class="form-row"><label>描述</label><textarea id="f_desc" rows="2"></textarea></div>
      ${attachmentBlockHtml()}`,
    onConfirm: async () => {
      const title = el('f_title').value.trim();
      if (!title) { UI.toast('请填写标题', 'error'); return false; }
      const rec = await API.todos.create({ title, priority: +el('f_prio').value, due_date: el('f_date').value || localToday(), due_time: el('f_time').value, category: el('f_cat').value, description: el('f_desc').value, tags: el('f_tags').value.split(',').map((s) => s.trim()).filter(Boolean) });
      await saveAttachments('todo', rec.id);
      renderTodo(); renderDashboard(); UI.toast('已添加');
    },
  });
}

function openEventModal() {
  UI.modal({
    title: '新建日程',
    content: `
      <div class="form-row"><label>标题</label><input id="f_title" placeholder="日程名称"></div>
      <div class="form-row three"><div><label>开始</label><input type="date" id="f_sd" value="${localToday()}"></div><div><label>结束</label><input type="date" id="f_ed" value="${localToday()}"></div><div><label>全天</label><select id="f_allday"><option value="1">是</option><option value="0">否</option></select></div></div>
      <div class="form-row"><label>颜色</label><input id="f_color" value="#5B8DEF"></div>
      <div class="form-row"><label>分类</label><input id="f_cat" list="catList" placeholder="如 工作/生活"></div>
      ${attachmentBlockHtml()}`,
    onConfirm: async () => {
      const title = el('f_title').value.trim();
      if (!title) { UI.toast('请填写标题', 'error'); return false; }
      const rec = await API.events.create({ title, start_date: el('f_sd').value, end_date: el('f_ed').value, all_day: el('f_allday').value === '1', color: el('f_color').value, category: el('f_cat').value });
      await saveAttachments('event', rec.id);
      renderCalendar(); UI.toast('已添加日程');
    },
  });
}

function openIdeaModal() {
  UI.modal({
    title: '记录灵感',
    content: `
      <div class="form-row"><label>内容</label><textarea id="f_content" rows="3" placeholder="一个好点子…"></textarea></div>
      <div class="form-row three"><div><label>来源</label><input id="f_src" placeholder="生活"></div><div><label>标签</label><input id="f_tags" placeholder="效率"></div><div></div></div>
      ${attachmentBlockHtml()}`,
    onConfirm: async () => {
      const content = el('f_content').value.trim();
      if (!content) { UI.toast('请填写内容', 'error'); return false; }
      const rec = await API.ideas.create({ content, source: el('f_src').value, tags: el('f_tags').value.split(',').map((s) => s.trim()).filter(Boolean) });
      await saveAttachments('idea', rec.id);
      renderIdeas(); renderDashboard(); UI.toast('灵感已捕捉 ✨');
    },
  });
}

function openHabitModal() {
  UI.modal({
    title: '新建习惯',
    content: `
      <div class="form-row"><label>名称</label><input id="f_name" placeholder="如 喝水"></div>
      <div class="form-row three"><div><label>图标</label><input id="f_icon" value="✅"></div><div><label>目标次数</label><input type="number" id="f_target" value="1"></div><div><label>颜色</label><input id="f_color" value="#10B981"></div></div>`,
    onConfirm: () => {
      const name = el('f_name').value.trim();
      if (!name) { UI.toast('请填写名称', 'error'); return false; }
      API.habits.create({ name, icon: el('f_icon').value, target_count: +el('f_target').value || 1, color: el('f_color').value })
        .then(() => { renderHealth(); renderDashboard(); UI.toast('习惯已添加'); });
    },
  });
}

function openMemoModal() {
  UI.modal({
    title: '新建备忘录',
    content: `
      <div class="form-row"><label>标题</label><input id="f_title" placeholder="如 购物清单"></div>
      <div class="form-row"><label>内容</label><textarea id="f_content" rows="3"></textarea></div>
      ${attachmentBlockHtml()}`,
    onConfirm: async () => {
      const content = el('f_content').value.trim();
      if (!content) { UI.toast('请填写内容', 'error'); return false; }
      const rec = await API.memos.create({ title: el('f_title').value, content, color: '#FFF9C4' });
      await saveAttachments('memo', rec.id);
      renderMemos(); UI.toast('已保存');
    },
  });
}

function openHobbyModal(id) {
  const load = id ? Store.hobbies.find((h) => h.id === id) : null;
  UI.modal({
    title: id ? '编辑爱好' : '新增爱好',
    content: `
      <div class="form-row"><label>名称</label><input id="f_name" value="${load ? esc(load.name) : ''}"></div>
      <div class="form-row three"><div><label>图标</label><input id="f_icon" value="${load ? esc(load.icon) : '🎨'}"></div><div><label>分类</label><input id="f_cat" list="catList" value="${load ? esc(load.category) : ''}"></div><div><label>进度</label><input type="number" id="f_prog" value="${load ? load.progress : 0}"></div></div>
      <div class="form-row"><label>描述</label><textarea id="f_desc" rows="2">${load ? esc(load.description) : ''}</textarea></div>
      ${attachmentBlockHtml()}`,
    onConfirm: async () => {
      const name = el('f_name').value.trim();
      if (!name) { UI.toast('请填写名称', 'error'); return false; }
      const payload = { name, icon: el('f_icon').value, category: el('f_cat').value, progress: +el('f_prog').value || 0, description: el('f_desc').value };
      let rid = id;
      if (id) { await API.hobbies.update({ id, ...payload }); }
      else { const rec = await API.hobbies.create(payload); rid = rec.id; }
      await saveAttachments('hobby', rid);
      renderHobbies(); UI.toast('已保存');
    },
  });
}

function openReviewModal(id) {
  const load = id ? Store.reviews.find((r) => r.id === id) : null;
  UI.modal({
    title: id ? '编辑复盘' : '写复盘',
    content: `
      <div class="form-row three"><div><label>类型</label><input id="f_type" value="${load ? esc(load.type) : '周复盘'}"></div><div><label>起</label><input type="date" id="f_ps" value="${load ? esc(load.period_start) : localToday()}"></div><div><label>止</label><input type="date" id="f_pe" value="${load ? esc(load.period_end) : localToday()}"></div></div>
      <div class="form-row"><label>✅ 成就</label><textarea id="f_ach" rows="2">${load ? esc(load.achievements) : ''}</textarea></div>
      <div class="form-row"><label>🔧 改进</label><textarea id="f_imp" rows="2">${load ? esc(load.improvements) : ''}</textarea></div>
      <div class="form-row"><label>🎯 下一步</label><textarea id="f_goal" rows="2">${load ? esc(load.goals_next) : ''}</textarea></div>
      <div class="form-row"><label>评分(0-10)</label><input type="number" id="f_rate" value="${load ? load.rating : 5}"></div>
      ${attachmentBlockHtml()}`,
    onConfirm: async () => {
      const payload = { type: el('f_type').value, period_start: el('f_ps').value, period_end: el('f_pe').value, achievements: el('f_ach').value, improvements: el('f_imp').value, goals_next: el('f_goal').value, rating: +el('f_rate').value || 5 };
      let rid = id;
      if (id) { await API.reviews.update({ id, ...payload }); }
      else { const rec = await API.reviews.create(payload); rid = rec.id; }
      await saveAttachments('review', rid);
      renderReviews(); UI.toast('已保存');
    },
  });
}

function openLearningModal(id) {
  const load = id ? Store.learning.find((l) => l.id === id) : null;
  UI.modal({
    title: id ? '编辑学习' : '添加学习',
    content: `
      <div class="form-row"><label>标题</label><input id="f_title" value="${load ? esc(load.title) : ''}"></div>
      <div class="form-row three"><div><label>类型</label><input id="f_type" value="${load ? esc(load.type) : '课程'}"></div><div><label>学科</label><input id="f_sub" value="${load ? esc(load.subject) : ''}"></div><div><label>状态</label><select id="f_status"><option value="active" ${!load || load.status === 'active' ? 'selected' : ''}>进行中</option><option value="done" ${load && load.status === 'done' ? 'selected' : ''}>已完成</option></select></div></div>
      <div class="form-row three"><div><label>总页</label><input type="number" id="f_total" value="${load ? load.total_pages : 0}"></div><div><label>已读</label><input type="number" id="f_cur" value="${load ? load.current_page : 0}"></div><div><label>进度%</label><input type="number" id="f_prog" value="${load ? load.progress : 0}"></div></div>
      <div class="form-row"><label>笔记</label><textarea id="f_notes" rows="2">${load ? esc(load.notes) : ''}</textarea></div>
      ${attachmentBlockHtml()}`,
    onConfirm: async () => {
      const title = el('f_title').value.trim();
      if (!title) { UI.toast('请填写标题', 'error'); return false; }
      const payload = { title, type: el('f_type').value, subject: el('f_sub').value, status: el('f_status').value, total_pages: +el('f_total').value || 0, current_page: +el('f_cur').value || 0, progress: +el('f_prog').value || 0, notes: el('f_notes').value };
      let rid = id;
      if (id) { await API.learning.update({ id, ...payload }); }
      else { const rec = await API.learning.create(payload); rid = rec.id; }
      await saveAttachments('learning', rid);
      renderLearning(); renderDashboard(); UI.toast('已保存');
    },
  });
}

function openLearningProgress(id) {
  const item = Store.learning.find((l) => l.id === id);
  UI.modal({
    title: '更新进度：' + (item ? item.title : ''),
    content: `<div class="form-row"><label>进度(%)</label><input type="number" id="f_prog" value="${item ? item.progress : 0}"></div>
      <div class="form-row"><label>已读页数</label><input type="number" id="f_cur" value="${item ? item.current_page : 0}"></div>
      ${attachmentBlockHtml()}`,
    onConfirm: async () => {
      await API.learning.update({ id, progress: +el('f_prog').value || 0, current_page: +el('f_cur').value || 0, status: (+el('f_prog').value || 0) >= 100 ? 'done' : 'active' });
      await saveAttachments('learning', id);
      renderLearning(); UI.toast('进度已更新');
    },
  });
}

function openHealthModal() {
  UI.modal({
    title: '记录健康指标',
    content: `
      <div class="form-row three"><div><label>类型</label><input id="f_type" value="睡眠" placeholder="睡眠/喝水/运动/体重"></div><div><label>数值</label><input type="number" step="0.1" id="f_val"></div><div><label>单位</label><input id="f_unit" value="小时"></div></div>
      <div class="form-row"><label>备注</label><input id="f_note"></div>
      ${attachmentBlockHtml()}`,
    onConfirm: async () => {
      const metric_type = el('f_type').value.trim();
      if (!metric_type) { UI.toast('请填写类型', 'error'); return false; }
      const rec = await API.health.create({ metric_type, value: +el('f_val').value || 0, unit: el('f_unit').value, note: el('f_note').value, record_date: localToday() });
      await saveAttachments('health', rec.id);
      renderHealth(); UI.toast('已记录');
    },
  });
}

function openTxModal() {
  UI.modal({
    title: '记一笔',
    content: `
      <div class="form-row"><label>类型</label><select id="f_type"><option value="expense">支出</option><option value="income">收入</option></select></div>
      <div class="form-row three"><div><label>金额</label><input type="number" step="0.01" id="f_amt"></div><div><label>分类</label><input id="f_cat" list="catList" placeholder="餐饮/工资"></div><div><label>日期</label><input type="date" id="f_date" value="${localToday()}"></div></div>
      <div class="form-row"><label>备注</label><input id="f_note"></div>
      ${attachmentBlockHtml()}`,
    onConfirm: async () => {
      const amount = +el('f_amt').value;
      if (!amount || amount <= 0) { UI.toast('请填写有效金额', 'error'); return false; }
      const rec = await API.finance.create({ type: el('f_type').value, amount, category: el('f_cat').value, note: el('f_note').value, record_date: el('f_date').value || localToday() });
      await saveAttachments('finance', rec.id);
      renderFinance(); UI.toast('已记账');
    },
  });
}

function openWeeklyModal() {
  const { s, e } = weekRange();
  UI.modal({
    title: '写周报',
    content: `
      <div class="form-row three"><div><label>起</label><input type="date" id="f_s" value="${s}"></div><div><label>止</label><input type="date" id="f_e" value="${e}"></div><div><label>完成数</label><input type="number" id="f_done" value="0"></div></div>
      <div class="form-row"><label>总结</label><textarea id="f_sum" rows="3"></textarea></div>
      <div class="form-row"><label>亮点</label><input id="f_hl"></div>`,
    onConfirm: () => {
      API.weekly.create({ week_start: el('f_s').value, week_end: el('f_e').value, todo_done: +el('f_done').value || 0, summary: el('f_sum').value, highlights: el('f_hl').value, mood_avg: 0 })
        .then(() => { renderWeekly(); UI.toast('周报已保存'); });
    },
  });
}

/* ============================================================
 * 行为分发
 * ============================================================ */
const Actions = {
  async todo(act, id) {
    if (act === 'create') openTodoModal();
    else if (act === 'toggle') { await API.todos.toggle(id); await renderTodo(); await renderDashboard(); }
    else if (act === 'delete') { if (confirm('删除该任务？')) { await API.todos.delete(id); await renderTodo(); await renderDashboard(); } }
  },
  event(act) { if (act === 'create') openEventModal(); },
  async idea(act, id) {
    if (act === 'create') openIdeaModal();
    else if (act === 'delete') { if (confirm('删除这条灵感？')) { await API.ideas.delete(id); await renderIdeas(); await renderDashboard(); } }
  },
  async habit(act, id) {
    if (act === 'create') openHabitModal();
    else if (act === 'toggle') { await API.habits.toggle(id); await renderHealth(); await renderDashboard(); }
    else if (act === 'delete') { if (confirm('删除该习惯？')) { await API.habits.delete(id); await renderHealth(); await renderDashboard(); } }
  },
  async memo(act, id) {
    if (act === 'create') openMemoModal();
    else if (act === 'delete') { if (confirm('删除备忘录？')) { await API.memos.delete(id); await renderMemos(); } }
  },
  async diary() {
    const req = {
      log_date: el('diaryDate').value || localToday(),
      mood: +el('diaryMood').value || 3,
      weather: el('diaryWeather').value.trim(),
      highlights: el('diaryHighlights').value.trim(),
      gratitude: el('diaryGratitude').value.trim(),
      sleep_hours: +el('diarySleep').value || 0,
      water_cups: +el('diaryWater').value || 0,
      exercise_minutes: +el('diaryExercise').value || 0,
      summary: el('diarySummary').value.trim(),
    };
    await API.daily.save(req);
    await saveAttachments('diary', req.log_date, 'fAttDiary'); UI.toast('日记已保存 🌿');
  },
  hobby(act, id) {
    if (act === 'create') openHobbyModal();
    else if (act === 'edit') openHobbyModal(id);
    else if (act === 'delete') { if (confirm('删除爱好？')) { API.hobbies.delete(id).then(() => renderHobbies()); } }
  },
  review(act, id) {
    if (act === 'create') openReviewModal();
    else if (act === 'edit') openReviewModal(id);
    else if (act === 'delete') { if (confirm('删除复盘？')) { API.reviews.delete(id).then(() => renderReviews()); } }
  },
  learning(act, id) {
    if (act === 'create') openLearningModal();
    else if (act === 'edit') openLearningModal(id);
    else if (act === 'progress') openLearningProgress(id);
    else if (act === 'delete') { if (confirm('删除学习项？')) { API.learning.delete(id).then(() => { renderLearning(); renderDashboard(); }); } }
  },
  async mood(act, id) {
    if (act === 'save') {
      const rec = await API.mood.create({ mood: selectedMood, note: el('moodNote').value.trim(), log_date: localToday() });
      await saveAttachments('mood', rec.id, 'fAttMood');
      await renderMood(); await renderDashboard(); UI.toast('已记录心情 💗');
    } else if (act === 'pick') {
      selectedMood = +id;
      document.querySelectorAll('#moodPicker .mood-emoji').forEach((b) => b.classList.toggle('sel', b.dataset.action === `mood:pick:${id}`));
    } else if (act === 'delete') {
      if (confirm('删除这条心情？')) { await API.mood.delete(id); await renderMood(); await renderDashboard(); }
    }
  },
  health(act, id) {
    if (act === 'create') openHealthModal();
    else if (act === 'delete') { if (confirm('删除指标？')) { API.health.delete(id).then(() => renderHealth()); } }
  },
  tx(act, id) {
    if (act === 'create') openTxModal();
    else if (act === 'delete') { if (confirm('删除这笔记录？')) { API.finance.delete(id).then(() => renderFinance()); } }
  },
  pomo(act, id) {
    if (act === 'start') startTimer();
    else if (act === 'reset') resetTimer();
    else if (act === 'delete') { if (confirm('删除记录？')) { API.pomodoro.delete(id).then(() => renderPomodoro()); } }
  },
  async weekly(act, id) {
    if (act === 'generate') { const { s, e } = weekRange(); await API.weekly.generate({ week_start: s, week_end: e }); await renderWeekly(); UI.toast('已生成本周周报 ✨'); }
    else if (act === 'create') openWeeklyModal();
    else if (act === 'delete') { if (confirm('删除周报？')) { await API.weekly.delete(id); await renderWeekly(); } }
  },
  settings(act) {
    if (act === 'clear') { if (confirm('确定清空所有数据并恢复示例？')) clearAll(); }
    else if (act === 'export') doExport();
    else if (act === 'import') { const f = document.getElementById('importFile'); if (f) f.click(); }
    else if (act === 'catsave') {
      const v = ((el('catInput').value || '').split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean));
      API.settings.set('categories', [...new Set(v)]);
      refreshCatList();
      renderSettings();
      UI.toast('分类已保存 ✅');
    }
    else if (act === 'aisave') {
      const cfg = {
        provider: (document.getElementById('aiProvider') || {}).value || 'openai',
        model: (document.getElementById('aiModel') || {}).value || 'gpt-4o-mini',
        api_key: (document.getElementById('aiApiKey') || {}).value || '',
        api_base: (document.getElementById('aiApiBase') || {}).value || '',
      };
      API.ai.saveConfig(cfg)
        .then(() => UI.toast('AI 配置已保存 ✅'))
        .catch((e) => UI.toast('保存失败：' + (e && e.message ? e.message : e), 'error'));
    }
    else if (act === 'aitest') {
      const cfg = {
        provider: (document.getElementById('aiProvider') || {}).value || 'openai',
        model: (document.getElementById('aiModel') || {}).value || 'gpt-4o-mini',
        api_key: (document.getElementById('aiApiKey') || {}).value || '',
        api_base: (document.getElementById('aiApiBase') || {}).value || '',
      };
      UI.toast('正在测试连接…');
      API.ai.saveConfig(cfg)
        .then(() => API.ai.chat('你好，请只回复“OK”两个字'))
        .then((r) => UI.toast('连接成功 ✅ ' + (r && r.reply ? r.reply : '')))
        .catch((e) => UI.toast('连接失败：' + (e && e.message ? e.message : e), 'error'));
    }
  },
  ai(act) { App.aiRun(act); },
  search(act) { if (act === 'date') App.openSearchForDate(Calendar.selectedDate || localToday()); },
};

function clearAll() {
  Object.keys(localStorage).forEach((k) => { if (k.startsWith('dw_')) localStorage.removeItem(k); });
  location.reload();
}

/* 导出 JSON 备份 */
async function doExport() {
  try {
    const payload = await API.settings.exportAll();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `daily-workbench-backup-${UI.today()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    UI.toast('已导出备份文件 ✅');
  } catch (e) { UI.toast('导出失败：' + (e && e.message ? e.message : e), 'error'); }
}

/* 导入 JSON 备份 */
function onImportFile(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const payload = JSON.parse(reader.result);
      if (!payload || !payload.data) throw new Error('文件格式不正确');
      const mode = confirm('选择导入方式：\n【确定】= 覆盖现有数据\n【取消】= 合并（按 ID 去重）') ? 'replace' : 'merge';
      await API.settings.importAll(payload, mode);
      UI.toast('导入成功，正在刷新…');
      setTimeout(() => location.reload(), 600);
    } catch (err) { UI.toast('导入失败：' + (err && err.message ? err.message : err), 'error'); }
    e.target.value = '';
  };
  reader.readAsText(file);
}

/* ============================================================
 * AI 面板
 * ============================================================ */
const App = {
  aiOpen: false,
  kbOn: true,
  toggleAI() {
    this.aiOpen = !this.aiOpen;
    document.body.classList.toggle('ai-open', this.aiOpen);
    if (this.aiOpen) { const i = el('aiInput'); if (i) setTimeout(() => i.focus(), 200); }
  },
  onSearch(v) { Search.q = v || ''; applyFilters(); },
  onTodoCat(v) { Search.cat = v || ''; applyFilters(); },
  onTodoStatus(s) { Search.status = s || 'all'; applyFilters(); },
  /* 统一检索相关 */
  onSearchKeyword(v) { SearchState.q = v || ''; },
  onSearchDate(which, v) { if (which === 'start') SearchState.start = v || ''; else SearchState.end = v || ''; },
  onSearchCat(v) { SearchState.cat = v || ''; },
  onSearchModule(m) {
    const i = SearchState.modules.indexOf(m);
    if (i < 0) SearchState.modules.push(m); else SearchState.modules.splice(i, 1);
    renderSearchModules();
  },
  onSearchScroll() { if (SearchState.open) paintSearchWindow(); },
  applySearchPreset(kind) {
    const today = localToday();
    let s = '', e = '';
    if (kind === 'today') { s = today; e = today; }
    else if (kind === 'week') { const p = weekRange(); s = p.s; e = p.e; }
    else if (kind === 'month') { s = today.slice(0, 7) + '-01'; e = today; }
    SearchState.start = s; SearchState.end = e;
    const se = el('searchStart'); if (se) se.value = s;
    const ee = el('searchEnd'); if (ee) ee.value = e;
    this.runSearch(true);
  },
  openSearchForDate(d) {
    SearchState.start = d || ''; SearchState.end = d || '';
    const se = el('searchStart'); if (se) se.value = d || '';
    const ee = el('searchEnd'); if (ee) ee.value = d || '';
    Router.navigate('search');
  },
  setKB(v) { this.kbOn = !!v; },
  aiAppend(role, text) {
    const box = el('aiMessages'); if (!box) return;
    const div = document.createElement('div');
    div.className = 'ai-msg ' + (role === 'user' ? 'me' : 'bot');
    div.textContent = text;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  },
  async aiSend() {
    const inp = el('aiInput'); const msg = inp.value.trim(); if (!msg) return;
    inp.value = '';
    this.aiAppend('user', msg);
    let message = msg;
    if (this.kbOn) {
      try {
        const kb = await API.search.knowledge({ max_items: 200 });
        if (kb && kb.text && kb.text !== '（暂无记录）') {
          this.aiAppend('bot', '📚 已载入你的历史记录作为知识库上下文');
          message = `[知识库上下文]\n${kb.text}\n\n[用户提问]\n${msg}`;
        }
      } catch (e) { /* 知识库不可用时忽略，正常对话 */ }
    }
    this.aiAppend('bot', '思考中…');
    const res = await API.ai.chat(message, []);
    const box = el('aiMessages');
    if (box && box.lastChild) box.removeChild(box.lastChild);
    this.aiAppend('bot', res.reply);
  },
  async aiRun(kind) {
    if (kind === 'summary') { const r = await API.ai.dailySummary(localToday()); this.aiAppend('bot', '✨ ' + r.content); }
    else if (kind === 'mood') { const r = await API.ai.moodInsight(); this.aiAppend('bot', '💗 ' + r); }
    else if (kind === 'tags') { const ideas = await Store.loadIdeas(); const content = (ideas[0] && ideas[0].content) || '今天想做点有趣的事'; const r = await API.ai.suggestTags(content); this.aiAppend('bot', '🏷 建议标签：' + r.tags.join('、')); }
    else if (kind === 'cycle') { const c = await Store.loadCycle(); this.aiAppend('bot', `📈 本周期：习惯 ${c.habits.length} 项，本月平均心情 ${c.mood_avg ? c.mood_avg.toFixed(1) : '—'}/5，累计番茄 ${c.pomodoro_total} 个。保持节奏，慢就是快 🌱`); }
  },
};
window.App = App;
window.toggleTheme = toggleTheme;

/* ============================================================
 * 附件（截图 / 图片上传）
 * 通过 attachments 表（module + record_id）关联业务记录。
 * module 命名与 search.rs 白名单保持一致：
 *   todo / event / idea / memo / diary / learning / review /
 *   finance / mood / health / hobby
 * ============================================================ */
function attachmentBlockHtml() {
  return `
    <div class="att-block">
      <label class="att-label">📎 截图 / 图片附件</label>
      <input type="file" id="fAtt" accept="image/*" multiple>
      <div class="att-drop" data-att-input="fAtt">拖拽图片到此处，或 Ctrl+V 粘贴</div>
      <div id="fAttPrev" class="att-prev"></div>
    </div>`;
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error || new Error('读取文件失败'));
    r.readAsDataURL(file);
  });
}

// 图片压缩：缩放 + JPEG 编码，显著降低 dataURL 体积（解决 localStorage 上限）
function compressImage(file, maxDim = 1280, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('读取失败'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('图片解码失败'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        try { resolve(canvas.toDataURL('image/jpeg', quality)); }
        catch (e) { reject(e); }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// 拖拽/粘贴的待上传文件（已压缩为 dataURL），按 inputId 暂存，确认时一并落库
const pendingAtt = {};
function clearPending(inputId) { delete pendingAtt[inputId]; }
window.clearPending = clearPending; // 供 UI.modal 关闭时清理暂存的（拖拽/粘贴）附件，避免泄漏到下一条记录
async function addPendingFiles(inputId, files) {
  if (!files || !files.length) return;
  const prev = document.getElementById(inputId + 'Prev');
  pendingAtt[inputId] = pendingAtt[inputId] || [];
  for (const f of Array.from(files)) {
    if (!f || !f.type || !f.type.startsWith('image/')) continue;
    let data;
    try { data = await compressImage(f, 1280, 0.7); }
    catch (e) { try { data = await readFileAsDataURL(f); } catch (e2) { continue; } }
    pendingAtt[inputId].push({ name: f.name || '截图', data });
    if (prev) {
      const tag = document.createElement('div');
      tag.className = 'att-prev-item';
      tag.innerHTML = `<img src="${data}" alt=""><span>${esc(f.name || '截图')}</span>`;
      prev.appendChild(tag);
    }
  }
}

// 读取指定文件输入中的图片，逐个存为附件；inputId 默认 'fAtt'
async function saveAttachments(module, recordId, inputId = 'fAtt') {
  if (recordId === undefined || recordId === null || recordId === '') return;
  let n = 0;
  const input = document.getElementById(inputId);
  if (input && input.files && input.files.length) {
    for (const file of Array.from(input.files)) {
      try {
        const data = await compressImage(file, 1280, 0.7);
        await API.attachments.save(module, String(recordId), file.name || '截图', data);
        n++;
      } catch (e) { console.warn('保存附件失败:', e); }
    }
    input.value = '';
  }
  // 拖拽 / 粘贴的待上传文件
  const pend = pendingAtt[inputId];
  if (pend && pend.length) {
    for (const p of pend) {
      try { await API.attachments.save(module, String(recordId), p.name || '截图', p.data); n++; }
      catch (e) { console.warn('保存附件失败:', e); }
    }
  }
  clearPending(inputId);
  if (n) UI.toast(`已保存 ${n} 张截图 📎`);
  const prev = document.getElementById(inputId + 'Prev');
  if (prev) prev.innerHTML = '';
}

// 批量取出某模块全部附件，按 record_id 聚合成 map
async function loadAttMap(module) {
  try {
    const list = await API.attachments.list(module);
    const map = {};
    (list || []).forEach((a) => { (map[a.record_id] = map[a.record_id] || []).push(a); });
    return map;
  } catch (e) { return {}; }
}

function attBadge(module, id, map) {
  const arr = map && map[id];
  if (!arr || !arr.length) return '';
  return `<button class="att-badge" data-action="viewAtt:${module}:${id}" title="${arr.length} 个附件">📎${arr.length}</button>`;
}

async function viewAttachments(module, recordId) {
  let list = [];
  try { list = await API.attachments.list(module, recordId); } catch (e) { list = []; }
  const body = list.length
    ? list.map((a) => `<div class="att-view-item">
        <img src="${a.data}" alt="${esc(a.name)}" class="att-view-img">
        <div class="att-view-foot"><span class="att-view-name">${esc(a.name || '截图')}</span><button class="todo-del" data-att-del="${a.id}">×</button></div>
      </div>`).join('')
    : '<div class="empty">还没有附件</div>';
  UI.modal({
    title: '📎 附件查看',
    content: `<div class="att-view-grid">${body}</div>`,
    confirmText: '关闭',
    onConfirm: () => {},
  });
  document.querySelectorAll('[data-att-del]').forEach((b) => {
    b.onclick = async () => {
      if (!confirm('删除这张附件？')) return;
      await API.attachments.delete(b.dataset.attDel);
      viewAttachments(module, recordId);
    };
  });
}

// 给页面内常驻的静态表单（日记/心情）绑定附件预览（onchange 覆盖式，避免重复绑定）
function bindStaticAttPreview(inputId, prevId) {
  const input = document.getElementById(inputId);
  const prev = document.getElementById(prevId);
  if (!input || !prev) return;
  input.onchange = () => {
    prev.innerHTML = '';
    Array.from(input.files).forEach((f) => {
      const tag = document.createElement('div');
      tag.className = 'att-prev-item';
      tag.innerHTML = `<img src="${URL.createObjectURL(f)}" alt=""><span>${esc(f.name)}</span>`;
      prev.appendChild(tag);
    });
  };
}

// 拖拽放置 + 全局粘贴上传：事件委托，动态渲染的 .att-drop 也能生效
function bindAttachmentDropZones() {
  document.addEventListener('dragover', (e) => {
    const zone = e.target.closest && e.target.closest('.att-drop');
    if (!zone) return;
    e.preventDefault();
    zone.classList.add('drag');
  });
  document.addEventListener('dragleave', (e) => {
    const zone = e.target.closest && e.target.closest('.att-drop');
    if (!zone) return;
    if (!zone.contains(e.relatedTarget)) zone.classList.remove('drag');
  });
  document.addEventListener('drop', (e) => {
    const zone = e.target.closest && e.target.closest('.att-drop');
    if (!zone) return;
    e.preventDefault();
    zone.classList.remove('drag');
    const inputId = zone.dataset.attInput || 'fAtt';
    const files = e.dataTransfer && e.dataTransfer.files;
    if (files && files.length) addPendingFiles(inputId, files);
  });
  // 全局粘贴：仅当页面存在附件拖拽区且剪贴板含图片时拦截，否则普通文本粘贴照常
  document.addEventListener('paste', (e) => {
    const cd = e.clipboardData;
    if (!cd) return;
    const files = [];
    if (cd.items) {
      for (const it of cd.items) {
        if (it.kind === 'file' && it.type && it.type.startsWith('image/')) {
          const f = it.getAsFile();
          if (f) files.push(f);
        }
      }
    } else if (cd.files && cd.files.length) {
      for (const f of cd.files) if (f.type && f.type.startsWith('image/')) files.push(f);
    }
    if (!files.length) return;
    const zone = document.querySelector('.att-drop');
    if (!zone) return;
    e.preventDefault();
    addPendingFiles(zone.dataset.attInput || 'fAtt', files);
  });
}

/* ============================================================
 * 事件委托 & 路由
 * ============================================================ */
document.addEventListener('click', (e) => {
  const cell = e.target.closest('.cal-cell[data-date]');
  if (cell) {
    Calendar.renderEvents(cell.dataset.date);
    document.querySelectorAll('.cal-cell').forEach((c) => c.classList.toggle('sel', c.dataset.date === cell.dataset.date));
    return;
  }
  const t = e.target.closest('[data-action]');
  if (!t) return;
  const parts = t.dataset.action.split(':');
  const mod = parts[0], act = parts[1], id = parts.slice(2).join(':');
  if (mod === 'viewAtt') { viewAttachments(parts[1], id); return; }
  const fn = Actions[mod];
  if (fn) fn(act, id, t);
});

async function loadPage(page) {
  switch (page) {
    case 'dashboard': await renderDashboard(); break;
    case 'calendar': await renderCalendar(); break;
    case 'todo': await renderTodo(); break;
    case 'ideas': await renderIdeas(); break;
    case 'diary': await renderDiary(); break;
    case 'hobbies': await renderHobbies(); break;
    case 'review': await renderReviews(); break;
    case 'memos': await renderMemos(); break;
    case 'learning': await renderLearning(); break;
    case 'cycle': await renderCycle(); break;
    case 'mood': await renderMood(); break;
    case 'health': await renderHealth(); break;
    case 'finance': await renderFinance(); break;
    case 'pomodoro': await renderPomodoro(); break;
    case 'weekly': await renderWeekly(); break;
    case 'search': await renderSearch(); break;
    case 'settings': await renderSettings(); break;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  Router.init();
  applyTheme();
  const dateBadge = document.getElementById('dateBadge');
  if (dateBadge) dateBadge.textContent = UI.formatDate(UI.today());
  await Store.loadAll();
  await renderDashboard();
  maybeNotifySummary();
  const importFile = document.getElementById('importFile');
  if (importFile) importFile.addEventListener('change', onImportFile);
  document.addEventListener('page-change', (e) => loadPage(e.detail.page));
  // 列表页渲染后自动重放筛选（支持切换页面/动态增删）
  const contentEl = document.getElementById('content');
  if (contentEl) {
    let raf = null;
    const obs = new MutationObserver(() => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => applyFilters());
    });
    obs.observe(contentEl, { childList: true, subtree: true });
  }
  bindStaticAttPreview('fAttDiary', 'fAttDiaryPrev');
  bindStaticAttPreview('fAttMood', 'fAttMoodPrev');
  bindAttachmentDropZones();
  refreshCatList();
  applyFilters();
});
