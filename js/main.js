'use strict';

(() => {
  const $ = (id) => document.getElementById(id);
  const screens = { menu: $('menu'), game: $('game'), result: $('result') };
  const modeById = Object.fromEntries(MODES.map((m) => [m.id, m]));
  const game = new Game($('canvas'));
  window.ValorantGun = { game }; // 方便在 DevTools 或自動化測試中檢查狀態
  let currentMode = null;
  let lastResult = null;

  function show(name) {
    for (const [key, el] of Object.entries(screens)) el.classList.toggle('active', key === name);
    if (name === 'menu') renderTrend();
  }

  // ---------- 模式卡片 ----------
  // 24×24 線條圖示（stroke 使用 currentColor）
  const ICONS = {
    gridshot: '<circle cx="5" cy="5" r="2"/><circle cx="12" cy="5" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="19" cy="12" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="12" cy="19" r="2"/><circle cx="19" cy="19" r="2"/>',
    flick: '<circle cx="6" cy="18" r="2.5"/><circle cx="19" cy="5" r="2.5" fill="currentColor"/><path d="M8 16 16.5 7.5M12 7h4.5v4.5"/>',
    micro: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/>',
    headline: '<path d="M2 12h20" stroke-dasharray="2 2"/><circle cx="15" cy="12" r="3" fill="currentColor"/><path d="M15 15v6M11 21h8"/>',
    tracking: '<circle cx="12" cy="12" r="3.5" fill="currentColor"/><path d="M2 12h4M18 12h4M4 9l-2 3 2 3M20 9l2 3-2 3"/>',
    reflex: '<path d="M13 2 5 13.5h6L10 22l9-12h-6z"/>',
    'op-flick': '<circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18"/><circle cx="12" cy="12" r="2" fill="currentColor"/>',
    'marshal-peek': '<path d="M3 4h6v16H3zM15 4h6v16h-6z"/><circle cx="12" cy="12" r="2" fill="currentColor"/>',
    'outlaw-double': '<circle cx="12" cy="12" r="9"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><circle cx="9.5" cy="12" r="1.6" fill="currentColor"/><circle cx="14.5" cy="12" r="1.6" fill="currentColor"/>',
  };
  const icon = (id) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[id] || ''}</svg>`;

  // 迷你趨勢線：最近 12 場分數，最新一場用強調色圓點
  function sparkline(runs) {
    const vals = runs.slice(-12).map((r) => r.score);
    if (vals.length < 2) return '';
    const W = 72, H = 22, lo = Math.min(...vals), hi = Math.max(...vals);
    const x = (i) => 2 + i / (vals.length - 1) * (W - 6);
    const y = (v) => 3 + (hi === lo ? 0.5 : 1 - (v - lo) / (hi - lo)) * (H - 6);
    const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const last = vals.length - 1;
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">
      <polyline points="${pts}"/><circle cx="${x(last)}" cy="${y(vals[last])}" r="2.5"/></svg>`;
  }

  let modeFilter = 'all';
  function renderModes() {
    const duration = Number(Store.settings.duration);
    $('mode-list').innerHTML = '';
    MODES.forEach((m, idx) => {
      const isSniper = !!m.weapon;
      if (modeFilter === 'rifle' && isSniper) return;
      if (modeFilter === 'sniper' && !isSniper) return;
      const best = Store.best(m.id, duration);
      const runs = Store.runs(m.id, duration);
      const card = document.createElement('button');
      card.className = 'mode-card' + (isSniper ? ' sniper' : '');
      card.style.setProperty('--i', idx);
      card.innerHTML = `
        <div class="card-top"><span class="icon">${icon(m.id)}</span><span class="tag"></span><kbd class="key">${idx + 1}</kbd></div>
        <h4></h4>
        <p></p>
        <div class="card-foot">
          <div class="best">${duration} 秒最佳<b>${best == null ? '—' : best}</b><small>${runs.length ? `${runs.length} 場` : '尚未遊玩'}</small></div>
          ${sparkline(runs)}
        </div>`;
      card.querySelector('.tag').textContent = m.tag;
      card.querySelector('h4').textContent = m.name;
      card.querySelector('p').textContent = m.desc;
      card.addEventListener('click', () => startMode(m));
      $('mode-list').appendChild(card);
    });
    renderBrandStats();
  }

  // 標題旁的總覽：總場數、總練習時間、今天的場數
  function renderBrandStats() {
    const all = Store.history();
    const minutes = Math.round(all.reduce((a, r) => a + (r.duration || 0), 0) / 60);
    const today = new Date().toDateString();
    const todayRuns = all.filter((r) => new Date(r.date).toDateString() === today).length;
    const items = [['總場數', all.length], ['練習分鐘', minutes], ['今天', `${todayRuns} 場`]];
    $('brand-stats').innerHTML = '';
    for (const [label, value] of items) {
      const d = document.createElement('div');
      d.innerHTML = '<b></b><span></span>';
      d.querySelector('b').textContent = value;
      d.querySelector('span').textContent = label;
      $('brand-stats').appendChild(d);
    }
  }

  // 分頁按鈕組：點擊切換 aria-selected，回呼收到 data 值
  function bindTabs(container, attr, onChange) {
    const buttons = container.querySelectorAll('[role="tab"]');
    buttons.forEach((b) => b.addEventListener('click', () => {
      buttons.forEach((x) => x.setAttribute('aria-selected', String(x === b)));
      onChange(b.dataset[attr]);
    }));
  }
  bindTabs($('mode-filter'), 'filter', (f) => { modeFilter = f; renderModes(); });
  bindTabs($('side-tabs'), 'tab', (t) => {
    document.querySelectorAll('.tab-panel').forEach((p) => { p.hidden = p.dataset.panel !== t; });
    if (t === 'xh') drawPreview();
  });

  // 主選單數字鍵 1–9 直接開始對應模式
  document.addEventListener('keydown', (e) => {
    if (!screens.menu.classList.contains('active')) return;
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName)) return;
    const n = Number(e.key);
    if (n >= 1 && n <= MODES.length) startMode(MODES[n - 1]);
  });

  function startMode(mode) {
    currentMode = mode;
    show('game');
    game.load(mode);
  }

  // ---------- 歷史紀錄 ----------
  const { fmtPct, fmtMs } = Trend;
  const fmtDate = (t) => {
    const d = new Date(t);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

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
      const cells = [
        fmtDate(r.date),
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
      renderTrend();
    }
  });

  // ---------- 成績趨勢（主選單） ----------
  const trendMode = $('trend-mode');
  const trendMetric = $('trend-metric');
  for (const m of MODES) trendMode.add(new Option(m.name, m.id));

  function fillMetricOptions() {
    const kind = modeById[trendMode.value].kind;
    const prev = trendMetric.value;
    trendMetric.innerHTML = '';
    for (const m of Trend.metrics(kind)) trendMetric.add(new Option(m.label, m.key));
    if ([...trendMetric.options].some((o) => o.value === prev)) trendMetric.value = prev;
  }

  // 一個數值方塊：標籤、數值、與平均的差距
  function tile(label, value, delta, verdict) {
    const d = document.createElement('div');
    d.className = 'tile';
    d.innerHTML = '<span></span><b></b>';
    d.querySelector('span').textContent = label;
    d.querySelector('b').textContent = value;
    if (delta) d.appendChild(deltaEl(delta.text, verdict, delta.d));
    return d;
  }

  // 箭頭表示數值變大或變小；顏色與文字表示進步或退步（例如擊殺時間變短是 ▼ 但算進步）
  const WORDS = { up: '進步', down: '退步', flat: '持平' };
  function deltaEl(text, verdict, d) {
    const s = document.createElement('em');
    s.className = `delta ${verdict || ''}`;
    const arrow = verdict === 'flat' ? '■' : d > 0 ? '▲' : '▼';
    s.textContent = verdict ? `${arrow} ${text}（${WORDS[verdict]}）` : text;
    return s;
  }

  function renderTrend() {
    if (!screens.menu.classList.contains('active')) return;
    const mode = modeById[trendMode.value];
    const duration = Number(Store.settings.duration);
    const runs = Store.runs(mode.id, duration);
    const m = Trend.metrics(mode.kind).find((x) => x.key === trendMetric.value) || Trend.metrics(mode.kind)[0];
    $('trend-note').textContent = `${duration} 秒 · 共 ${runs.length} 場（最多顯示最近 30 場）`;

    const tiles = $('trend-tiles');
    tiles.innerHTML = '';
    const vals = Trend.values(runs, m.key);
    if (vals.length) {
      const last = runs[runs.length - 1][m.key];
      const prevRuns = runs.slice(0, -1);
      const avgPrev = Trend.mean(Trend.values(prevRuns, m.key));
      const best = m.better > 0 ? Math.max(...vals) : Math.min(...vals);
      const d = last != null && avgPrev != null ? last - avgPrev : null;
      tiles.appendChild(tile('最近一次', m.fmt(last), d == null ? null : { text: `比之前平均 ${Trend.fmtDelta(m, d)}`, d }, Trend.verdict(m, d)));
      tiles.appendChild(tile('總平均', m.fmt(Trend.mean(vals))));
      tiles.appendChild(tile('最佳', m.fmt(best)));
    }
    Trend.renderChart($('trend-chart'), runs, m);
  }

  trendMode.addEventListener('change', () => { fillMetricOptions(); renderTrend(); });
  trendMetric.addEventListener('change', renderTrend);
  window.addEventListener('resize', () => {
    renderTrend();
    if (screens.result.classList.contains('active') && lastResult) renderResultChart();
  });

  // ---------- 一般設定 ----------
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
    fillCrosshairForm();
  }

  function refreshDerived() {
    const s = Store.settings;
    document.querySelectorAll('output[data-for]').forEach((o) => { o.textContent = s[o.dataset.for]; });
    $('edpi').textContent = Math.round(s.sens * s.dpi);
    const cm = 360 / (s.sens * VAL_YAW * s.dpi) * 2.54;
    $('cm360').textContent = Number.isFinite(cm) ? cm.toFixed(1) : '-';
    refreshConverter();
  }

  inputs.forEach((el) => {
    el.addEventListener('input', () => {
      const v = readInput(el);
      if (el.type === 'number' && (!Number.isFinite(v) || v <= 0)) return;
      Store.set(el.dataset.setting, v);
      refreshDerived();
      if (el.dataset.setting === 'duration') { renderModes(); renderTrend(); }
    });
  });

  $('reset-settings').addEventListener('click', () => {
    if (!confirm('確定要把靈敏度、訓練設定與準星都恢復成預設值嗎？')) return;
    Store.resetSettings();
    fillForm();
    renderModes();
    renderTrend();
  });

  // ---------- 準星 ----------
  const xhInputs = document.querySelectorAll('[data-xh]');
  document.querySelectorAll('.xh-color-select').forEach((sel) => {
    Crosshair.COLOR_NAMES.forEach((name, i) => sel.add(new Option(name, String(i))));
  });
  Crosshair.PRESETS.forEach((p, i) => $('xh-preset').add(new Option(p.name, String(i))));

  const xhMsg = (text, ok) => {
    $('xh-msg').textContent = text;
    $('xh-msg').className = `msg ${ok ? 'ok' : 'err'}`;
  };

  // 修改目前的準星：拿一份可修改的解析結果，改完後存回代碼
  function editCrosshair(fn) {
    const xh = Crosshair.parse(Store.settings.crosshair);
    fn(xh);
    Store.set('crosshair', Crosshair.serialize(xh));
    fillCrosshairForm();
  }

  function fillCrosshairForm() {
    const xh = Crosshair.current();
    xhInputs.forEach((el) => {
      const [sec, key] = el.dataset.xh.split('.');
      const v = Crosshair.num(xh, sec, key);
      if (el.type === 'checkbox') el.checked = v === 1;
      else el.value = String(v);
      const out = el.nextElementSibling;
      if (out && out.tagName === 'OUTPUT') out.textContent = v;
    });
    $('xh-custom').value = Crosshair.color(xh, 'P').hex.toLowerCase();
    if (document.activeElement !== $('xh-code')) $('xh-code').value = Store.settings.crosshair;
    drawPreview();
  }

  xhInputs.forEach((el) => {
    el.addEventListener('input', () => {
      const [sec, key] = el.dataset.xh.split('.');
      const v = el.type === 'checkbox' ? (el.checked ? 1 : 0) : Number(el.value);
      editCrosshair((xh) => Crosshair.set(xh, sec, key, v));
      $('xh-preset').value = '';
    });
  });

  $('xh-custom').addEventListener('input', (e) => {
    const hex = e.target.value.replace('#', '').toUpperCase();
    editCrosshair((xh) => {
      const old = String(Crosshair.get(xh, 'P', 'u'));
      const alpha = /^[0-9A-Fa-f]{8}$/.test(old) ? old.slice(6, 8).toUpperCase() : 'FF';
      Crosshair.set(xh, 'P', 'c', 8);
      Crosshair.set(xh, 'P', 'u', hex + alpha);
    });
  });

  $('xh-preset').addEventListener('change', (e) => {
    const p = Crosshair.PRESETS[Number(e.target.value)];
    if (!p) return;
    Store.set('crosshair', Crosshair.normalize(p.code));
    fillCrosshairForm();
    xhMsg(`已套用「${p.name}」`, true);
  });

  function importCode() {
    const code = $('xh-code').value.trim();
    if (!code) return xhMsg('請先貼上準星代碼。', false);
    try {
      Store.set('crosshair', Crosshair.normalize(code));
      $('xh-preset').value = '';
      $('xh-code').blur();
      fillCrosshairForm();
      xhMsg('匯入成功！', true);
    } catch (err) {
      xhMsg(`無法匯入：${err.message}`, false);
    }
  }
  $('xh-import').addEventListener('click', importCode);
  $('xh-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') importCode(); });

  $('xh-copy').addEventListener('click', async () => {
    const code = Store.settings.crosshair;
    try {
      await navigator.clipboard.writeText(code);
      xhMsg('已複製，可以在遊戲內「匯入準星設定檔」貼上。', true);
    } catch (e) {
      $('xh-code').value = code;
      $('xh-code').select();
      xhMsg('瀏覽器不允許自動複製，已幫你選取代碼，請按 Ctrl+C。', false);
    }
  });

  // 預覽：左邊實際大小，右邊放大 3 倍
  function drawPreview() {
    const c = $('xh-preview');
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    const xh = Crosshair.current();
    Crosshair.draw(ctx, c.width * 0.22, c.height / 2, xh, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(c.width * 0.44, 0, 1, c.height);
    Crosshair.draw(ctx, c.width * 0.72, c.height / 2, xh, 3);
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
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function countUp(el, target) {
    if (reduceMotion || target <= 0) { el.textContent = target; return; }
    const start = performance.now(), dur = 700;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / dur);
      el.textContent = Math.round(target * (1 - Math.pow(1 - t, 3)));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  game.onQuit = () => {
    show('menu');
    renderModes();
  };

  function renderCompare(r, prev) {
    const box = $('res-compare');
    box.innerHTML = '';
    if (!prev.length) {
      const p = document.createElement('p');
      p.className = 'compare-empty';
      p.textContent = '這是這個模式（同秒數）的第一場紀錄，下次就能看到進步幅度。';
      box.appendChild(p);
      return;
    }
    const table = document.createElement('table');
    table.className = 'compare-table';
    table.innerHTML = `<thead><tr><th>指標</th><th>本次</th><th>與上一次相比</th><th>與之前 ${prev.length} 場平均相比</th></tr></thead><tbody></tbody>`;
    const body = table.querySelector('tbody');
    for (const c of Trend.compare(r, prev, r.kind)) {
      const tr = document.createElement('tr');
      const td = (content) => {
        const cell = document.createElement('td');
        if (typeof content === 'string') cell.textContent = content;
        else cell.appendChild(content);
        tr.appendChild(cell);
      };
      td(c.m.label);
      td(c.m.fmt(c.cur));
      const cell = (d, ref) => {
        const wrap = document.createElement('div');
        if (d == null) { wrap.textContent = '—'; return wrap; }
        wrap.appendChild(deltaEl(Trend.fmtDelta(c.m, d), Trend.verdict(c.m, d), d));
        const small = document.createElement('small');
        small.textContent = `（${c.m.fmt(ref)}）`;
        wrap.appendChild(small);
        return wrap;
      };
      td(cell(c.dLast, c.lastV));
      td(cell(c.dAvg, c.avgV));
      body.appendChild(tr);
    }
    box.appendChild(table);
  }

  function renderResultChart() {
    const r = lastResult;
    const m = Trend.metrics(r.kind)[0];
    $('res-trend-title').textContent = `${m.label}趨勢（最近 30 場）`;
    Trend.renderChart($('res-chart'), Store.runs(r.mode, r.duration), m, { height: 180 });
  }

  game.onEnd = (r) => {
    const prev = Store.runs(r.mode, r.duration); // 在寫入本次之前取得，才是「之前」的紀錄
    const { isBest, prev: prevBest } = Store.record(r);
    lastResult = r;
    const mode = modeById[r.mode];
    $('res-mode').textContent = `${mode.name} · ${r.duration} 秒`;
    countUp($('res-score'), r.score);
    const badge = $('res-badge');
    badge.className = 'badge' + (isBest ? ' new' : '');
    badge.textContent = isBest
      ? (prevBest == null ? '首次紀錄！' : `新紀錄！（上次最佳 ${prevBest}）`)
      : `最佳紀錄：${prevBest}`;

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
        ['失誤', r.misses - r.expired],
        ['平均擊殺時間', fmtMs(r.avgMs)],
        ['每秒擊殺', (r.hits / r.duration).toFixed(2)],
        ['靈敏度', r.sens],
      ];
      if (r.expired) stats.splice(3, 0, ['逃脫', r.expired]);
      if (r.weapon) stats.push(['武器', r.weapon]);
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
    renderCompare(r, prev);
    show('result');
    renderResultChart();
    renderHistory();
    renderModes();
    // 主選單趨勢切到剛玩的模式
    trendMode.value = r.mode;
    fillMetricOptions();
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
  fillMetricOptions();
  renderTrend();
})();
