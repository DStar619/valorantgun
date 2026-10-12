'use strict';

// 成績趨勢：本次 vs 上一次 / 歷史平均，以及折線圖
const Trend = (() => {
  const fmtPct = (v) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`);
  const fmtMs = (v) => (v == null ? '—' : `${Math.round(v)} ms`);
  const fmtInt = (v) => (v == null ? '—' : String(Math.round(v)));

  // 依模式類型決定要比較哪些指標；better：1 = 越高越好，-1 = 越低越好
  function metrics(kind) {
    const list = [{ key: 'score', label: '分數', fmt: fmtInt, better: 1 }];
    list.push({ key: 'acc', label: kind === 'tracking' ? '貼合率' : '命中率', fmt: fmtPct, better: 1 });
    if (kind === 'reflex') list.push({ key: 'avgMs', label: '平均反應', fmt: fmtMs, better: -1 });
    else if (kind !== 'tracking') list.push({ key: 'avgMs', label: '平均擊殺時間', fmt: fmtMs, better: -1 });
    return list;
  }

  const values = (runs, key) => runs.map((r) => r[key]).filter((v) => v != null && Number.isFinite(v));
  const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

  // 差值文字：「+12」「-3.1%」「-25 ms」
  function fmtDelta(m, d) {
    if (d == null) return '—';
    const sign = d > 0 ? '+' : d < 0 ? '−' : '±';
    const a = Math.abs(d);
    if (m.key === 'acc') return `${sign}${(a * 100).toFixed(1)}%`;
    if (m.key === 'avgMs') return `${sign}${Math.round(a)} ms`;
    return `${sign}${Math.round(a)}`;
  }

  // 每個指標：本次、上一次、平均與差值；prev 為本次之前（同模式同秒數）的紀錄，由舊到新
  function compare(entry, prev, kind) {
    const last = prev[prev.length - 1] || null;
    return metrics(kind).map((m) => {
      const cur = entry[m.key];
      const lastV = last ? last[m.key] : null;
      const avgV = mean(values(prev, m.key));
      const dLast = cur != null && lastV != null ? cur - lastV : null;
      const dAvg = cur != null && avgV != null ? cur - avgV : null;
      return { m, cur, lastV, avgV, dLast, dAvg };
    });
  }

  // 「進步 / 退步」：方向 × 指標好壞；回傳 'up' | 'down' | 'flat' | null
  function verdict(m, d) {
    if (d == null) return null;
    const eps = m.key === 'acc' ? 0.0005 : 0.5;
    if (Math.abs(d) < eps) return 'flat';
    return d * m.better > 0 ? 'up' : 'down';
  }

  // ---------- 折線圖（SVG） ----------
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
    return e;
  };

  function niceTicks(lo, hi, count) {
    if (lo === hi) { lo -= 1; hi += 1; }
    const raw = (hi - lo) / count;
    const pow = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((s) => s * pow).find((s) => s >= raw) || raw;
    const start = Math.floor(lo / step) * step;
    const end = Math.ceil(hi / step) * step;
    const ticks = [];
    for (let v = start; v <= end + step / 2; v += step) ticks.push(Math.round(v / step) * step);
    return ticks;
  }

  // container：放圖表的元素；runs：由舊到新；m：指標；opts.max：最多顯示幾場
  function renderChart(container, runs, m, opts = {}) {
    container.innerHTML = '';
    container.classList.add('trend-chart');
    const max = opts.max || 30;
    const startIdx = Math.max(0, runs.length - max);
    const pts = runs.slice(startIdx)
      .map((r, i) => ({ r, n: startIdx + i + 1, v: r[m.key] }))
      .filter((p) => p.v != null && Number.isFinite(p.v));

    if (!pts.length) {
      const p = document.createElement('p');
      p.className = 'trend-empty';
      p.textContent = '還沒有這個模式的紀錄，完成一場後就會出現趨勢。';
      container.appendChild(p);
      return;
    }

    const W = Math.max(280, container.clientWidth || 600);
    const H = opts.height || 200;
    const pad = { l: 46, r: 64, t: 14, b: 26 };
    const scaleV = m.key === 'acc' ? 100 : 1; // 命中率以百分比顯示
    const avg = mean(pts.map((p) => p.v));
    const ticks = niceTicks(Math.min(...pts.map((p) => p.v), avg) * scaleV, Math.max(...pts.map((p) => p.v), avg) * scaleV, 4);
    const y0 = ticks[0], y1 = ticks[ticks.length - 1];
    const x = (i) => pad.l + (pts.length === 1 ? (W - pad.l - pad.r) / 2 : i / (pts.length - 1) * (W - pad.l - pad.r));
    const y = (v) => pad.t + (1 - (v * scaleV - y0) / (y1 - y0)) * (H - pad.t - pad.b);
    const tickLabel = (t) => (m.key === 'acc' ? `${t}%` : m.key === 'avgMs' ? `${t}` : t >= 1000 ? `${(t / 1000).toFixed(t % 1000 ? 1 : 0)}K` : `${t}`);

    const svg = el('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img' });
    svg.setAttribute('aria-label', `${m.label}趨勢：共 ${pts.length} 場，平均 ${m.fmt(avg)}，最近一次 ${m.fmt(pts[pts.length - 1].v)}`);

    // 格線與 Y 軸刻度
    for (const t of ticks) {
      const yy = pad.t + (1 - (t - y0) / (y1 - y0)) * (H - pad.t - pad.b);
      svg.appendChild(el('line', { x1: pad.l, x2: W - pad.r, y1: yy, y2: yy, class: 'grid' }));
      const tx = el('text', { x: pad.l - 8, y: yy + 4, class: 'tick', 'text-anchor': 'end' });
      tx.textContent = tickLabel(t);
      svg.appendChild(tx);
    }
    // X 軸：第一場與最後一場的場次
    for (const i of pts.length > 1 ? [0, pts.length - 1] : [0]) {
      const tx = el('text', { x: x(i), y: H - 6, class: 'tick', 'text-anchor': pts.length > 1 ? (i ? 'end' : 'start') : 'middle' });
      tx.textContent = `第 ${pts[i].n} 場`;
      svg.appendChild(tx);
    }

    // 平均線 + 直接標註
    const ya = y(avg);
    svg.appendChild(el('line', { x1: pad.l, x2: W - pad.r, y1: ya, y2: ya, class: 'avg' }));
    const avgText = el('text', { x: W - pad.r + 6, y: ya + 4, class: 'avg-label' });
    avgText.textContent = `平均 ${m.fmt(avg)}`;

    // 折線與標記
    if (pts.length > 1) {
      svg.appendChild(el('polyline', { points: pts.map((p, i) => `${x(i)},${y(p.v)}`).join(' '), class: 'line' }));
    }
    pts.forEach((p, i) => {
      const last = i === pts.length - 1;
      svg.appendChild(el('circle', { cx: x(i), cy: y(p.v), r: last ? 5 : 4, class: last ? 'dot last' : 'dot' }));
    });
    // 最近一次的數值標在終點；與平均標註太近時，平均標註改放到線下方
    const lastP = pts[pts.length - 1];
    const ly = y(lastP.v);
    const endText = el('text', { x: x(pts.length - 1) + 9, y: ly + 4, class: 'end-label' });
    endText.textContent = m.fmt(lastP.v);
    if (Math.abs(ly - ya) < 14) avgText.setAttribute('y', ly > ya ? ya - 6 : ya + 14);
    svg.appendChild(avgText);
    svg.appendChild(endText);

    // 滑鼠移入：垂直線吸附到最近的一場 + 提示框
    const cross = el('line', { y1: pad.t, y2: H - pad.b, class: 'cross', visibility: 'hidden' });
    svg.appendChild(cross);
    const hit = el('rect', { x: pad.l - 10, y: 0, width: W - pad.l - pad.r + 20, height: H, fill: 'transparent' });
    svg.appendChild(hit);
    container.appendChild(svg);

    const tip = document.createElement('div');
    tip.className = 'trend-tip';
    tip.hidden = true;
    container.appendChild(tip);

    const showAt = (i) => {
      const p = pts[i];
      cross.setAttribute('x1', x(i));
      cross.setAttribute('x2', x(i));
      cross.setAttribute('visibility', 'visible');
      const d = new Date(p.r.date);
      tip.innerHTML = '<b></b><span></span>';
      tip.querySelector('b').textContent = m.fmt(p.v);
      tip.querySelector('span').textContent =
        `第 ${p.n} 場 · ${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      tip.hidden = false;
      const left = Math.min(W - tip.offsetWidth - 4, Math.max(4, x(i) - tip.offsetWidth / 2));
      tip.style.left = `${left}px`;
      tip.style.top = `${Math.max(0, y(p.v) - tip.offsetHeight - 12)}px`;
    };
    hit.addEventListener('pointermove', (e) => {
      const bx = e.clientX - svg.getBoundingClientRect().left;
      let best = 0;
      pts.forEach((_, i) => { if (Math.abs(x(i) - bx) < Math.abs(x(best) - bx)) best = i; });
      showAt(best);
    });
    hit.addEventListener('pointerleave', () => {
      cross.setAttribute('visibility', 'hidden');
      tip.hidden = true;
    });
  }

  return { metrics, compare, verdict, fmtDelta, mean, values, renderChart, fmtPct, fmtMs };
})();
