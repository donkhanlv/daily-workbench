/**
 * 简单 SPA 路由
 */
const Router = (() => {
  let currentPage = 'dashboard';

  const pageNames = {
    dashboard: '仪表盘', calendar: '日历', todo: '每日计划',
    ideas: '每日灵感', diary: '每日生活', hobbies: '爱好',
    review: '内容复盘', memos: '备忘录', learning: '学习提升',
    cycle: '周期进度', mood: '心情追踪', health: '健康习惯',
    finance: '极简记账', pomodoro: '番茄钟', weekly: '周报',
    settings: '设置',
  };

  function navigate(page) {
    document.querySelectorAll('.nav-item[data-page]').forEach((el) => {
      el.classList.toggle('active', el.dataset.page === page);
    });
    document.querySelectorAll('.page').forEach((el) => {
      el.classList.toggle('active', el.id === `page-${page}`);
    });
    const titleEl = document.getElementById('topbarTitle');
    if (titleEl) titleEl.textContent = pageNames[page] || page;
    currentPage = page;
    document.dispatchEvent(new CustomEvent('page-change', { detail: { page } }));
  }

  function init() {
    // 导航通过 HTML 内联 onclick 触发，这里仅做初始化占位
  }

  return { init, navigate, getCurrentPage: () => currentPage, pageNames };
})();

window.Router = Router;
