/**
 * 附件（截图/图片上传）组件
 *  - 支持：选择图片文件、粘贴截图（Ctrl/⌘+V）、自动压缩为 JPEG、缩略图预览、删除
 *  - 双模式：Tauri 走 Rust save_attachment；浏览器走 LocalBackend repos.attachments
 *  - 用法：
 *      const box = AttachmentUI.mount(container, { module: 'idea', recordId: null });
 *      // 记录创建后：await box.flushTo(record.id);
 *  角标：AttachmentUI.preload(module) 预载计数后 .then(() => AttachmentUI.paintBadges(module))
 */
const AttachmentUI = (() => {
  const cache = {}; // module -> { record_id: count }

  // 压缩图片为 dataURL（最大边 max，JPEG quality，控制体积）
  function compressImage(file, max = 1200, quality = 0.82) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('读取失败'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('解析失败'));
        img.onload = () => {
          const scale = Math.min(1, max / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          try {
            resolve(canvas.toDataURL('image/jpeg', quality));
          } catch (e) {
            reject(e);
          }
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function mount(container, opts = {}) {
    const module = opts.module;
    const onChange = opts.onChange || (() => {});
    let recordId = opts.recordId || null;
    const items = []; // 已持久化（含 id）
    const staged = []; // 待持久化（recordId 未知时临时存放）

    container.classList.add('attach-zone');
    container.innerHTML = `
      <div class="attach-thumbs"></div>
      <div class="attach-actions">
        <label class="attach-btn">📎 上传截图<input type="file" accept="image/*" multiple hidden></label>
        <span class="attach-hint">或粘贴图片 (Ctrl/⌘+V)</span>
      </div>`;
    const thumbsEl = container.querySelector('.attach-thumbs');
    const input = container.querySelector('input[type=file]');

    function thumb(item, persisted) {
      const div = document.createElement('div');
      div.className = 'attach-thumb';
      const img = document.createElement('img');
      img.src = item.data;
      img.alt = item.name || '截图';
      const del = document.createElement('button');
      del.className = 'attach-del';
      del.type = 'button';
      del.textContent = '×';
      del.addEventListener('click', () => removeItem(item, persisted));
      div.appendChild(img);
      div.appendChild(del);
      return div;
    }

    function renderThumbs() {
      thumbsEl.innerHTML = '';
      items.forEach((it) => thumbsEl.appendChild(thumb(it, true)));
      staged.forEach((it) => thumbsEl.appendChild(thumb(it, false)));
    }

    async function addFiles(files) {
      for (const f of files) {
        if (!f.type || f.type.indexOf('image/') !== 0) continue;
        let dataUrl;
        try {
          dataUrl = await compressImage(f);
        } catch (e) {
          UI.toast('图片处理失败：' + e.message, 'error');
          continue;
        }
        const item = { id: null, name: f.name || '截图', data: dataUrl };
        if (recordId) {
          const saved = await API.attachments.save(module, recordId, item.name, dataUrl);
          item.id = saved.id;
          item.created_at = saved.created_at;
          items.push(item);
        } else {
          staged.push(item);
        }
        renderThumbs();
      }
      onChange(items.length + staged.length);
    }

    function removeItem(item, persisted) {
      if (persisted && item.id) API.attachments.delete(item.id);
      const arr = persisted ? items : staged;
      const idx = arr.indexOf(item);
      if (idx >= 0) arr.splice(idx, 1);
      renderThumbs();
      onChange(items.length + staged.length);
    }

    input.addEventListener('change', () => {
      addFiles(input.files);
      input.value = '';
    });

    function onPaste(e) {
      const clip = e.clipboardData && e.clipboardData.items;
      if (!clip) return;
      const imgs = [];
      for (const it of clip) if (it.type && it.type.indexOf('image/') === 0) imgs.push(it.getAsFile());
      if (!imgs.length) return;
      e.preventDefault();
      addFiles(imgs);
    }
    // 仅在容器可见时响应粘贴：模态框内优先捕获；否则静态表单需所在页可见
    function guardedPaste(e) {
      if (document.querySelector('.modal-overlay')) {
        if (!container.closest('.modal')) return;
      } else if (container.offsetParent === null) {
        return;
      }
      onPaste(e);
    }
    document.addEventListener('paste', guardedPaste);

    // 编辑态（recordId 已知）时预载已有附件
    if (recordId) {
      API.attachments.list(module, recordId).then((list) => {
        list.forEach((a) => items.push(a));
        renderThumbs();
        onChange(items.length + staged.length);
      });
    } else {
      renderThumbs();
    }

    return {
      getRecordId: () => recordId,
      setRecordId: (rid) => {
        recordId = rid;
      },
      // 记录创建后，把暂存附件落库
      async flushTo(rid) {
        recordId = rid;
        const toSave = staged.splice(0, staged.length);
        for (const it of toSave) {
          const saved = await API.attachments.save(module, rid, it.name, it.data);
          items.push({ id: saved.id, name: saved.name, data: it.data, created_at: saved.created_at });
        }
        renderThumbs();
        onChange(items.length + staged.length);
        return items.length;
      },
      count: () => items.length + staged.length,
      destroy() {
        document.removeEventListener('paste', guardedPaste);
        container.innerHTML = '';
        container.classList.remove('attach-zone');
      },
    };
  }

  // 预载某模块全部附件计数
  async function preload(module) {
    try {
      const list = await API.attachments.list(module, null);
      const map = {};
      list.forEach((a) => {
        map[a.record_id] = (map[a.record_id] || 0) + 1;
      });
      cache[module] = map;
    } catch (e) {
      cache[module] = cache[module] || {};
    }
  }

  function cnt(module, recordId) {
    const m = cache[module];
    return m && m[recordId] ? m[recordId] : 0;
  }

  // 根据缓存刷新页面上的角标（卡片需带 data-att-mod / data-att-rid）
  function paintBadges(module) {
    document.querySelectorAll('[data-att-mod="' + module + '"]').forEach((el) => {
      const c = cnt(module, el.getAttribute('data-att-rid'));
      if (c) {
        el.textContent = '📎' + c;
        el.style.display = '';
      } else {
        el.textContent = '';
        el.style.display = 'none';
      }
    });
  }

  // 查看大图
  function view(item) {
    UI.modal({
      title: '📎 ' + (item.name || '截图'),
      confirmText: '关闭',
      cancelText: '',
      content: `<div style="text-align:center"><img src="${item.data}" style="max-width:100%;max-height:70vh;border-radius:8px"></div>`,
    });
  }

  return { mount, preload, cnt, paintBadges, view };
})();
window.AttachmentUI = AttachmentUI;
