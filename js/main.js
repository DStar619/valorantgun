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
  function renderModes() {
    const duration = Number(Store.settings.duration);
    $('mode-list').innerHTML = '';
    for (const m of MODES) {
      const best = Store.best(m.id, duration);
      const card = document.createElement('button');
      card.className = 'mode-card' + (m.weapon ? ' sniper' : '');
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
    $('res-score').textContent = r.score;
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
