'use strict';

// VALORANT 準星代碼，例如：0;P;c;5;h;0;0l;4;0o;2;0a;1;0f;0;1b;0
//   第一段 "0" 是版本，之後是 key;value 成對排列
//   "P" / "A" / "S" 切換區段：主要準星 / 開鏡準星 / 狙擊鏡
//   代碼中沒寫到的 key 一律使用遊戲預設值（DEFAULTS），所以 "0" 就是遊戲預設準星
// 準星狀態直接以代碼字串保存（Store.settings.crosshair），讀取時再解析
const Crosshair = (() => {
  const COLORS = ['#FFFFFF', '#00FF00', '#7FFF00', '#DFFF00', '#FFFF00', '#00FFFF', '#FF00FF', '#FF0000'];
  const COLOR_NAMES = ['白色', '綠色', '黃綠色', '綠黃色', '黃色', '青色', '粉紅色', '紅色', '自訂'];
  const SECTIONS = ['P', 'A', 'S'];

  const DEFAULTS = {
    top: {},
    P: {
      c: '0', u: 'FFFFFFFF',              // 顏色索引 / 自訂顏色 RRGGBBAA（c=8 時使用）
      f: '1', s: '0', m: '0',             // 隨開火誤差淡出 / 顯示觀戰者準星 / 以準星間距取代開火誤差間距
      h: '1', t: '1', o: '0.5',           // 外框：開關 / 粗細 / 不透明度
      d: '0', z: '2', a: '1',             // 中心點：開關 / 粗細 / 不透明度
      '0b': '1', '0t': '2', '0l': '6', '0v': '6', '0g': '0', '0o': '3', '0a': '0.8', // 內線
      '0m': '0', '0s': '1', '0f': '1', '0e': '1', // 內線：移動誤差 / 倍率 / 開火誤差 / 倍率
      '1b': '1', '1t': '2', '1l': '2', '1v': '2', '1g': '0', '1o': '10', '1a': '0.35', // 外線
      '1m': '1', '1s': '1', '1f': '1', '1e': '1', // 外線：移動誤差 / 倍率 / 開火誤差 / 倍率
    },
    A: {},
    // 狙擊鏡中心點（遊戲預設值為推估）
    S: { d: '1', c: '7', u: 'FF0000FF', s: '1', o: '0.75' },
  };

  // 匯出時的 key 順序（與遊戲匯出格式相近），未列出的 key 依原順序接在後面
  const ORDER = {
    top: [],
    P: ['c', 'u', 'h', 't', 'o', 'd', 'z', 'a', 'f', 's', 'm',
      '0b', '0t', '0l', '0v', '0g', '0o', '0a', '0m', '0f', '0s', '0e',
      '1b', '1t', '1l', '1v', '1g', '1o', '1a', '1m', '1f', '1s', '1e'],
    A: [],
    S: ['d', 'c', 'u', 's', 'o'],
  };

  const PRESETS = [
    { name: '本站預設（綠色十字）', code: '0;P;c;8;u;00FF9CFF;o;0.85;0t;2;0l;5;0o;3;0a;1;0f;0;1b;0' },
    { name: '遊戲預設', code: '0' },
    { name: '青色小十字（無外框）', code: '0;P;c;5;h;0;0l;4;0o;2;0a;1;0f;0;1b;0' },
    { name: '綠色細十字', code: '0;P;c;1;o;1;0t;1;0l;3;0o;2;0a;1;0f;0;1b;0' },
    { name: '黃色十字', code: '0;P;c;4;o;1;0t;2;0l;4;0o;2;0a;1;0f;0;1b;0' },
    { name: '粉紅十字', code: '0;P;c;6;h;0;0t;2;0l;5;0o;2;0a;1;0f;0;1b;0' },
    { name: '白色點', code: '0;P;h;0;d;1;z;3;0b;0;1b;0' },
    { name: '紅點加外框', code: '0;P;c;7;o;1;d;1;z;2;0b;0;1b;0' },
    { name: '青色點 + 短線', code: '0;P;c;5;o;1;d;1;z;2;0t;1;0l;2;0o;3;0a;1;0f;0;1b;0' },
    { name: '大十字（含外線）', code: '0;P;c;1;o;1;0t;2;0l;6;0o;4;0a;1;0f;0;1t;2;1l;3;1o;12;1a;0.6;1f;0' },
  ];

  // 解析代碼；格式錯誤時丟出中文錯誤訊息
  function parse(code) {
    const parts = String(code).trim().split(';').map((s) => s.trim());
    if (parts[0] !== '0') throw new Error('準星代碼應以「0;」開頭');
    const out = { top: {}, P: {}, A: {}, S: {} };
    let cur = 'top';
    for (let i = 1; i < parts.length;) {
      const k = parts[i];
      if (k === '') { i++; continue; }
      if (SECTIONS.includes(k)) { cur = k; i++; continue; }
      const v = parts[i + 1];
      if (v === undefined || v === '') throw new Error(`「${k}」缺少數值`);
      if (!/^[0-9A-Fa-f.-]+$/.test(v)) throw new Error(`「${k}」的數值「${v}」不正確`);
      out[cur][k] = v;
      i += 2;
    }
    return out;
  }

  function isDefault(sec, key, value) {
    const def = DEFAULTS[sec][key];
    if (def === undefined) return false;
    if (key === 'u') return def.toUpperCase() === String(value).toUpperCase();
    return parseFloat(def) === parseFloat(value);
  }

  // 只輸出與預設值不同的 key，產生最短的代碼
  function serialize(xh) {
    let s = '0';
    const emit = (sec) => {
      const map = xh[sec];
      const keys = ORDER[sec].filter((k) => k in map)
        .concat(Object.keys(map).filter((k) => !ORDER[sec].includes(k)));
      return keys.filter((k) => !isDefault(sec, k, map[k])).map((k) => `;${k};${map[k]}`).join('');
    };
    s += emit('top');
    for (const sec of SECTIONS) {
      const body = emit(sec);
      if (body) s += `;${sec}${body}`;
    }
    return s;
  }

  // 正規化（去掉預設值）；無效時丟出錯誤
  const normalize = (code) => serialize(parse(code));

  const get = (xh, sec, key) => (key in xh[sec] ? xh[sec][key] : DEFAULTS[sec][key]);
  const num = (xh, sec, key) => {
    const v = parseFloat(get(xh, sec, key));
    return Number.isFinite(v) ? v : parseFloat(DEFAULTS[sec][key]) || 0;
  };

  function set(xh, sec, key, value) {
    xh[sec][key] = typeof value === 'number' ? String(Math.round(value * 1000) / 1000) : String(value);
  }

  // 取得區段的顏色 { hex, alpha }
  function color(xh, sec) {
    const c = Math.round(num(xh, sec, 'c'));
    if (c >= 0 && c < COLORS.length) return { hex: COLORS[c], alpha: 1 };
    const u = String(get(xh, sec, 'u') || 'FFFFFFFF').replace('#', '');
    const hex = /^[0-9A-Fa-f]{6}/.test(u) ? `#${u.slice(0, 6)}` : '#FFFFFF';
    const alpha = /^[0-9A-Fa-f]{8}$/.test(u) ? parseInt(u.slice(6, 8), 16) / 255 : 1;
    return { hex, alpha };
  }

  let cacheCode = null;
  let cacheXh = null;
  function parsedCurrent() {
    const code = Store.settings.crosshair;
    if (code !== cacheCode) {
      cacheCode = code;
      try { cacheXh = parse(code); } catch (e) { cacheXh = parse('0'); }
    }
    return cacheXh;
  }

  // 繪製主要準星；scale = 每個「準星像素」對應的畫布像素
  // err = 開火誤差在畫面上的半徑（畫布像素），errFrac = 誤差佔上限的比例（0–1，用於淡出）
  function draw(ctx, cx, cy, xh, scale, err = 0, errFrac = 0) {
    const P = (k) => num(xh, 'P', k);
    const px = (v) => Math.round(v * scale);
    cx = Math.round(cx);
    cy = Math.round(cy);
    const els = [];

    for (const n of ['0', '1']) {
      if (P(`${n}b`) !== 1) continue;
      // 開火誤差：線條往外推 err × 倍率；勾選「以準星間距取代」(m) 時線條不動，只保留淡出
      const fe = P(`${n}f`) === 1 && err > 0 ? err * P(`${n}e`) : 0;
      const a = P(`${n}a`) * (fe > 0 && P('f') === 1 ? 1 - 0.6 * errFrac : 1);
      const t = px(P(`${n}t`));
      const l = px(P(`${n}l`));
      const v = px(P(`${n}g`) === 1 ? P(`${n}v`) : P(`${n}l`));
      const off = px(P(`${n}o`)) + (P('m') === 1 ? 0 : Math.round(fe));
      if (t <= 0 || a <= 0) continue;
      const c0 = Math.floor(t / 2);
      if (l > 0) {
        els.push({ x: cx + off, y: cy - c0, w: l, h: t, a });
        els.push({ x: cx - off - l, y: cy - c0, w: l, h: t, a });
      }
      if (v > 0) {
        els.push({ x: cx - c0, y: cy - off - v, w: t, h: v, a });
        els.push({ x: cx - c0, y: cy + off, w: t, h: v, a });
      }
    }
    if (P('d') === 1 && P('a') > 0) {
      const z = Math.max(1, px(P('z')));
      const c0 = Math.floor(z / 2);
      els.push({ x: cx - c0, y: cy - c0, w: z, h: z, a: P('a') });
    }

    const col = color(xh, 'P');
    ctx.save();
    if (P('h') === 1 && P('o') > 0) {
      const o = Math.max(1, px(P('t')));
      ctx.fillStyle = '#000';
      ctx.globalAlpha = P('o');
      for (const e of els) ctx.fillRect(e.x - o, e.y - o, e.w + o * 2, e.h + o * 2);
    }
    ctx.fillStyle = col.hex;
    for (const e of els) {
      ctx.globalAlpha = e.a * col.alpha;
      ctx.fillRect(e.x, e.y, e.w, e.h);
    }
    ctx.restore();
  }

  // 狙擊鏡中心點
  function drawScopeDot(ctx, cx, cy, xh, scale) {
    if (num(xh, 'S', 'd') !== 1) return;
    const col = color(xh, 'S');
    const size = Math.max(1, Math.round(2 * num(xh, 'S', 's') * scale));
    const c0 = Math.floor(size / 2);
    ctx.save();
    ctx.globalAlpha = num(xh, 'S', 'o') * col.alpha;
    ctx.fillStyle = col.hex;
    ctx.fillRect(Math.round(cx) - c0, Math.round(cy) - c0, size, size);
    ctx.restore();
  }

  return {
    COLORS, COLOR_NAMES, PRESETS, DEFAULTS,
    parse, serialize, normalize, get, num, set, color, draw, drawScopeDot,
    current: parsedCurrent,
  };
})();
