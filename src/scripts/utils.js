/**
 * UI 工具函数
 */
const UI = (() => {
  // ===== Toast 通知 =====
  function toast(message, type = 'success', duration = 3000) {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span>${type === 'success' ? '✅' : '❌'}</span><span>${message}</span>`;
    document.body.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, duration);
  }

  // ===== 系统通知（桌面端走 Tauri notification 插件，浏览器回退 toast）=====
  async function notify(title, body) {
    if (typeof window !== 'undefined' && window.__TAURI_INTERNALS__) {
      try {
        const { sendNotification } = await import('@tauri-apps/plugin-notification');
        await sendNotification({ title: title || '日常工作台', body: body || '' });
        return;
      } catch (e) { console.warn('[通知] 调用失败，回退 toast', e); }
    }
    toast(body || title || '');
  }

  // ===== Modal 对话框 =====
  function modal({ title, content, confirmText = '确定', cancelText = '取消', onConfirm, onCancel }) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-title">${title}</div>
        <div class="modal-body">${content}</div>
        <div class="modal-actions">
          <button class="pomodoro-btn secondary btn-cancel">${cancelText}</button>
          <button class="pomodoro-btn primary btn-confirm">${confirmText}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    // 若内容含附件输入，自动绑定本地预览（不强制依赖后端）
    const fAtt = overlay.querySelector('#fAtt');
    const fPrev = overlay.querySelector('#fAttPrev');
    if (fAtt && fPrev) {
      fAtt.onchange = () => {
        fPrev.innerHTML = '';
        Array.from(fAtt.files).forEach((f) => {
          const tag = document.createElement('div');
          tag.className = 'att-prev-item';
          tag.innerHTML = `<img src="${URL.createObjectURL(f)}" alt=""><span>${esc(f.name)}</span>`;
          fPrev.appendChild(tag);
        });
      };
    }

    overlay.querySelector('.btn-cancel').onclick = () => {
      if (fAtt && window.clearPending) window.clearPending(fAtt.id);
      overlay.remove();
      if (onCancel) onCancel();
    };
    overlay.querySelector('.btn-confirm').onclick = async () => {
      if (onConfirm) {
        try {
          const r = await onConfirm();
          if (r === false) return; // 校验失败：阻止关闭
        } catch (e) {
          UI.toast('操作失败：' + (e && e.message ? e.message : e), 'error');
          return;
        }
      }
      if (fAtt && window.clearPending) window.clearPending(fAtt.id);
      overlay.remove();
    };
    overlay.onclick = (e) => {
      if (e.target === overlay) { if (fAtt && window.clearPending) window.clearPending(fAtt.id); overlay.remove(); if (onCancel) onCancel(); }
    };
  }

  // ===== 格式化日期 =====
  function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const days = ['日', '一', '二', '三', '四', '五', '六'];
    return `${d.getMonth()+1}月${d.getDate()}日 周${days[d.getDay()]}`;
  }

  function formatTime(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }

  // ===== 获取今日日期（本地时区，避免 UTC 偏移）=====
  function today() {
    const d = new Date(); const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  function thisMonth() {
    const d = new Date(); const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}`;
  }

  // ===== 随机颜色 =====
  function randomColor() {
    const colors = ['#5B8DEF', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  return { toast, modal, formatDate, formatTime, today, thisMonth, randomColor };
})();

window.UI = UI;

// ===== 全局便捷函数（供 api.js / app.js 以裸标识符调用）=====
function uid() {
  if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}
function now() {
  const d = new Date(); const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
window.uid = uid;
window.now = now;
window.esc = esc;
window.today = UI.today;
window.thisMonth = UI.thisMonth;
window.Utils = UI;
