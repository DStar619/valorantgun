'use strict';

// VALORANT：靈敏度 1 時，每個滑鼠 count 轉動 0.07 度
const VAL_YAW = 0.07;
// VALORANT 固定水平 FOV（16:9）
const VAL_FOV = 103;

const DEFAULT_SETTINGS = {
  sens: 0.4,
  dpi: 800,
  rawInput: true,
  duration: 60,
  targetScale: 1,
  volume: 0.4,
  showFps: false,
  scopedSens: 1,      // 遊戲內「開鏡靈敏度倍率」
  scopeHold: false,   // true：按住右鍵開鏡；false：點一下切換（Operator 會循環 2.5× → 5× → 關）
  crosshair: '0;P;c;8;u;00FF9CFF;o;0.85;0t;2;0l;5;0o;3;0a;1;0f;0;1b;0', // VALORANT 準星代碼
};

// v1.0 的準星設定（xhColor 等）轉成準星代碼
function migrateSettings(s) {
  if ('xhColor' in s) {
    const hex = String(s.xhColor).replace('#', '').toUpperCase();
    s.crosshair = [
      '0;P;c;8;u', `${hex}FF`, 'h', s.xhOutline ? 1 : 0, 'o', 0.85, 'd', s.xhDot ? 1 : 0, 'z', s.xhThickness,
      '0t', s.xhThickness, '0l', s.xhLength, '0o', s.xhGap, '0a', 1, '0f', 0, '1b', 0,
    ].join(';');
    for (const k of ['xhColor', 'xhLength', 'xhThickness', 'xhGap', 'xhOutline', 'xhDot']) delete s[k];
  }
  return s;
}

// 所有資料只存在瀏覽器 localStorage
const Store = (() => {
  const KEY = 'valorantgun:v1';
  const MAX_HISTORY = 1000;
  const data = { settings: { ...DEFAULT_SETTINGS }, best: {}, history: [] };

  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      Object.assign(data.settings, migrateSettings({ ...(parsed.settings || {}) }));
      data.best = parsed.best || {};
      data.history = Array.isArray(parsed.history) ? parsed.history : [];
    }
  } catch (e) { /* 無痕模式或資料損毀時使用預設值 */ }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* 忽略 */ }
  }

  // 不同秒數的成績不能直接比較，所以最佳紀錄以「模式@秒數」為 key
  const bestKey = (mode, duration) => `${mode}@${duration}`;

  return {
    get settings() { return data.settings; },
    set(key, value) { data.settings[key] = value; save(); },
    resetSettings() { data.settings = { ...DEFAULT_SETTINGS }; save(); },
    best(mode, duration) { return data.best[bestKey(mode, duration)]; },
    record(entry) {
      const key = bestKey(entry.mode, entry.duration);
      const prev = data.best[key];
      const isBest = prev == null || entry.score > prev;
      if (isBest) data.best[key] = entry.score;
      data.history.unshift(entry);
      if (data.history.length > MAX_HISTORY) data.history.length = MAX_HISTORY;
      save();
      return { isBest, prev };
    },
    history() { return data.history; },
    // 某模式＋秒數的所有紀錄，依時間由舊到新
    runs(mode, duration) {
      return data.history.filter((r) => r.mode === mode && r.duration === duration).reverse();
    },
    clearRecords() { data.best = {}; data.history = []; save(); },
  };
})();
