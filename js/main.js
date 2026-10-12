'use strict';

(() => {
  const $ = (id) => document.getElementById(id);
  const screens = { menu: $('menu'), game: $('game'), result: $('result') };
  const modeById = Object.fromEntries(MODES.map((m) => [m.id, m]));
  const game = new Game($('canvas'));
  let currentMode = null;

  function show(name) {
    for (const [key, el] of Object.entries(screens)) el.classList.toggle('active', key === name);
  }

  // ---------- 模式卡片 ----------
  function renderModes() {
    const duration = Number(Store.settings.duration);
    $('mode-list').innerHTML = '';
    for (const m of MODES) {
      const best = Store.best(m.id, duration);
      const card = document.createElement('button');
      card.className = 'mode-card';
      card.innerHTML = `
        <span class="tag"></span>
        <h4></h4>
        <p></p>
        <div class="best">${duration} 秒最佳：<b>${best == null ? '—' : best}</b></div>`;
      card.querySelector('.tag').textContent = m.tag;
      card.querySelector('h4').textContent = m.name;
      card.querySelector('p').textContent = m.desc;
      card.addEventListener('click', () => startMode(m));
      $('mode-list').appendChild(card);
    }
  }

  function startMode(mode) {
    currentMode = mode;
    show('game');
    game.load(mode);
  }

  // ---------- 歷史紀錄 ----------
  const fmtPct = (v) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`);
  const fmtMs = (v) => (v == null ? '—' : `${Math.round(v)} ms`);

  function renderHistory() {
    const rows = Store.history().slice(0, 12);
    const body = $('history-body');
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="6" class="empty">還沒有紀錄，選一個模式開始練習吧！</td></tr>';
      return;
    }
    body.innerHTML = '';
    for (const r of rows) {
      const tr = document.createElement('tr');
      const d = new Date(r.date);
      const cells = [
        `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
        modeById[r.mode] ? modeById[r.mode].name : r.mode,
        `${r.duration}s`,
        r.score,
        fmtPct(r.acc),
        fmtMs(r.avgMs),
      ];
      for (const c of cells) {
        const td = document.createElement('td');
        td.textContent = c;
        tr.appendChild(td);
      }
      body.appendChild(tr);
    }
  }

  $('clear-history').addEventListener('click', () => {
    if (confirm('確定要清除所有歷史紀錄與最佳成績嗎？')) {
      Store.clearRecords();
      renderHistory();
      renderModes();
    }
  });

  // ---------- 設定表單 ----------
  const inputs = document.querySelectorAll('[data-setting]');

  function readInput(el) {
    if (el.type === 'checkbox') return el.checked;
    if (el.type === 'number' || el.type === 'range' || el.tagName === 'SELECT') return Number(el.value);
    return el.value;
  }

  function fillForm() {
    const s = Store.settings;
    inputs.forEach((el) => {
      const v = s[el.dataset.setting];
      if (el.type === 'checkbox') el.checked = !!v;
      else el.value = v;
    });
    refreshDerived();
  }

  function refreshDerived() {
    const s = Store.settings;
    document.querySelectorAll('output[data-for]').forEach((o) => { o.textContent = s[o.dataset.for]; });
    $('edpi').textContent = Math.round(s.sens * s.dpi);
    const cm = 360 / (s.sens * VAL_YAW * s.dpi) * 2.54;
    $('cm360').textContent = Number.isFinite(cm) ? cm.toFixed(1) : '-';
    drawPreview();
    refreshConverter();
  }

  inputs.forEach((el) => {
    el.addEventListener('input', () => {
      const v = readInput(el);
      if (typeof v === 'number' && (!Number.isFinite(v) || v <= 0) && el.type === 'number') return;
      Store.set(el.dataset.setting, v);
      refreshDerived();
      if (el.dataset.setting === 'duration') renderModes();
    });
  });

  $('reset-settings').addEventListener('click', () => {
    Store.resetSettings();
    fillForm();
    renderModes();
  });

  // 準星預覽與常用顏色
  function drawPreview() {
    const c = $('xh-preview');
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    drawCrosshair(ctx, c.width / 2, c.height / 2, Store.settings, 1);
  }

  const SWATCHES = ['#00ff9c', '#ffffff', '#ffff00', '#00ffff', '#ff00ff', '#ff4655'];
  for (const color of SWATCHES) {
    const b = document.createElement('button');
    b.style.background = color;
    b.title = color;
    b.addEventListener('click', () => {
      Store.set('xhColor', color);
      fillForm();
    });
    $('xh-swatches').appendChild(b);
  }

  // 其他遊戲靈敏度換算：相同的每 count 角度 → 相同手感
  function convertedSens() {
    const yaw = Number($('conv-game').value);
    const sens = Number($('conv-in').value);
    return Math.round(sens * yaw / VAL_YAW * 1000) / 1000;
  }
  function refreshConverter() {
    const v = convertedSens();
    $('conv-out').textContent = Number.isFinite(v) && v > 0 ? v : '-';
  }
  $('conv-game').addEventListener('change', refreshConverter);
  $('conv-in').addEventListener('input', refreshConverter);
  $('conv-apply').addEventListener('click', () => {
    const v = convertedSens();
    if (!Number.isFinite(v) || v <= 0) return;
    Store.set('sens', v);
    fillForm();
  });

  // ---------- 結算 ----------
  game.onQuit = () => {
    show('menu');
    renderModes();
  };

  game.onEnd = (r) => {
    const { isBest, prev } = Store.record(r);
    const mode = modeById[r.mode];
    $('res-mode').textContent = `${mode.name} · ${r.duration} 秒`;
    $('res-score').textContent = r.score;
    const badge = $('res-badge');
    badge.className = 'badge' + (isBest ? ' new' : '');
    badge.textContent = isBest
      ? (prev == null ? '首次紀錄！' : `新紀錄！（上次最佳 ${prev}）`)
      : `最佳紀錄：${prev}`;

    let stats;
    if (r.kind === 'tracking') {
      stats = [
        ['貼合率', fmtPct(r.acc)],
        ['貼合時間', `${r.trackOn.toFixed(1)} s`],
        ['靈敏度', r.sens],
      ];
    } else if (r.kind === 'reflex') {
      stats = [
        ['平均反應', fmtMs(r.avgMs)],
        ['最快反應', fmtMs(r.bestMs)],
        ['命中', r.hits],
        ['逾時', r.expired],
        ['亂槍失誤', r.misses - r.expired],
        ['命中率', fmtPct(r.acc)],
      ];
    } else {
      stats = [
        ['命中率', fmtPct(r.acc)],
        ['命中', r.hits],
        ['失誤', r.misses],
        ['平均擊殺時間', fmtMs(r.avgMs)],
        ['每秒擊殺', (r.hits / r.duration).toFixed(2)],
        ['靈敏度', r.sens],
      ];
    }
    const box = $('res-stats');
    box.innerHTML = '';
    for (const [label, value] of stats) {
      const d = document.createElement('div');
      d.innerHTML = '<span></span><b></b>';
      d.querySelector('span').textContent = label;
      d.querySelector('b').textContent = value;
      box.appendChild(d);
    }
    show('result');
    renderHistory();
    renderModes();
  };

  $('res-again').addEventListener('click', () => startMode(currentMode));
  $('res-menu').addEventListener('click', () => show('menu'));
  document.addEventListener('keydown', (e) => {
    if (!screens.result.classList.contains('active')) return;
    if (e.code === 'KeyR') startMode(currentMode);
    else if (e.code === 'Escape') show('menu');
  });

  fillForm();
  renderModes();
  renderHistory();
})();
