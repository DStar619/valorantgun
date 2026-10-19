'use strict';

const DEG = Math.PI / 180;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const rand = (lo, hi) => lo + Math.random() * (hi - lo);

// ---------- 向量工具（角度一律以「度」表示） ----------
const Vec = {
  // yaw：左右（向右為正），pitch：上下（向上為正）
  dir(yawDeg, pitchDeg) {
    const y = yawDeg * DEG, p = pitchDeg * DEG;
    return [Math.cos(p) * Math.sin(y), Math.sin(p), Math.cos(p) * Math.cos(y)];
  },
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
};

// 兩個方向之間的夾角（度）
function angleBetween(a, b) {
  return Math.acos(clamp(Vec.dot(a, b), -1, 1)) / DEG;
}

// ---------- 第一人稱鏡頭 ----------
class Camera {
  constructor() { this.reset(); }

  reset() {
    this.yaw = 0;
    this.pitch = 0;
    this.update();
  }

  rotate(dYaw, dPitch) {
    this.yaw += dYaw;
    if (this.yaw > 180) this.yaw -= 360;
    if (this.yaw < -180) this.yaw += 360;
    this.pitch = clamp(this.pitch + dPitch, -89, 89);
    this.update();
  }

  update() {
    const y = this.yaw * DEG;
    this.f = Vec.dir(this.yaw, this.pitch);   // 前
    this.r = [Math.cos(y), 0, -Math.sin(y)];  // 右（永遠水平）
    this.u = Vec.cross(this.f, this.r);       // 上
  }
}

// ---------- 場景資料（只計算一次） ----------
const TARGET_COLORS = {
  normal: { light: '#ffc2c7', base: '#ff4655', dark: '#8f1f2b', glow: 'rgba(255,70,85,0.28)' },
  hot: { light: '#c9fff6', base: '#21d3b4', dark: '#0b6d5d', glow: 'rgba(33,211,180,0.28)' },
};

// 地板網格：眼睛高度 EYE 公尺、間距 STEP 公尺；每條線切成小段，依距離分到 4 組不同透明度
const FLOOR_GRID = (() => {
  const EYE = 2, STEP = 5, RANGE = 100;
  const buckets = [0.14, 0.09, 0.055, 0.03].map((alpha) => ({ alpha, segs: [] }));
  const add = (a, b) => {
    const mid = Math.hypot((a[0] + b[0]) / 2, (a[2] + b[2]) / 2);
    const i = Math.min(buckets.length - 1, Math.floor(mid / (RANGE / buckets.length)));
    buckets[i].segs.push([a, b]);
  };
  for (let c = -RANGE; c <= RANGE; c += STEP) {
    for (let t = -RANGE; t < RANGE; t += STEP) {
      add([c, -EYE, t], [c, -EYE, t + STEP]);
      add([t, -EYE, c], [t + STEP, -EYE, c]);
    }
  }
  return buckets;
})();

// ---------- 透視投影（與遊戲相同的水平 FOV） ----------
class View {
  constructor(canvas) {
    this.canvas = canvas;
    // alpha:false + desynchronized：降低繪製延遲（練槍時輸入延遲越低越好）
    this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true }) || canvas.getContext('2d');
    this.dpr = 1;
    this.zoom = 1;
    this.resize();
  }

  // 放大倍率（狙擊鏡）：以焦距縮放，zoom = 2.5 表示畫面中央放大 2.5 倍
  setZoom(zoom) {
    this.zoom = zoom;
    this.tanH = Math.tan(VAL_FOV / 2 * DEG) / zoom;
    this.k = this.W / 2 / this.tanH;
  }

  resize() {
    this.dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.W = this.canvas.width;
    this.H = this.canvas.height;
    this.setZoom(this.zoom); // 重新計算 k：每單位切平面距離對應的像素
  }

  // 方向向量 -> 螢幕座標；在鏡頭後方時回傳 null
  project(v, cam) {
    const z = Vec.dot(v, cam.f);
    if (z < 0.02) return null;
    return {
      x: this.W / 2 + Vec.dot(v, cam.r) / z * this.k,
      y: this.H / 2 - Vec.dot(v, cam.u) / z * this.k,
      z,
    };
  }

  // 角半徑（度）在距離 z 時的螢幕半徑
  radiusPx(angDeg, z) { return Math.tan(angDeg * DEG) / z * this.k; }

  // 背景：天空 / 地面漸層 + 透視地板網格（越遠越淡），模擬訓練場
  // headLine：在頭線高度（pitch 0）畫紅線（Headshot Line 模式用）
  drawEnvironment(cam, headLine) {
    const { ctx, W, H, k } = this;
    // 鏡頭沒有翻滾，所以地平線是一條水平線
    const yh = H / 2 + Math.tan(cam.pitch * DEG) * k;
    const hz = clamp(yh, 0, H);

    const sky = ctx.createLinearGradient(0, Math.min(0, yh - H), 0, Math.max(hz, 1));
    sky.addColorStop(0, '#0a131b');
    sky.addColorStop(1, '#1d2d3b');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, hz);
    const floor = ctx.createLinearGradient(0, hz, 0, Math.max(H, yh + H * 0.6));
    floor.addColorStop(0, '#17232e');
    floor.addColorStop(1, '#0b1117');
    ctx.fillStyle = floor;
    ctx.fillRect(0, hz, W, H - hz);

    // 地平線光暈
    if (yh > -40 && yh < H + 40) {
      const glow = ctx.createLinearGradient(0, yh - 40 * this.dpr, 0, yh + 40 * this.dpr);
      glow.addColorStop(0, 'rgba(255,70,85,0)');
      glow.addColorStop(0.5, 'rgba(255,70,85,0.07)');
      glow.addColorStop(1, 'rgba(255,70,85,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, yh - 40 * this.dpr, W, 80 * this.dpr);
    }

    // 地板網格：依距離分組，每組一次 stroke
    ctx.lineWidth = Math.max(1, this.dpr);
    for (const bucket of FLOOR_GRID) {
      ctx.strokeStyle = `rgba(236,232,225,${bucket.alpha})`;
      ctx.beginPath();
      for (const [a, b] of bucket.segs) {
        const pa = this.project(a, cam), pb = this.project(b, cam);
        if (!pa || !pb) continue;
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
      }
      ctx.stroke();
    }

    ctx.strokeStyle = headLine ? 'rgba(255,70,85,0.55)' : 'rgba(236,232,225,0.12)';
    ctx.beginPath();
    ctx.moveTo(0, yh);
    ctx.lineTo(W, yh);
    ctx.stroke();
  }

  // 掩體牆：yaw / pitch 範圍圍成的面，沿邊緣取樣以符合透視
  drawWall(w, cam) {
    const pts = [];
    const edge = (fn, from, to) => {
      const step = (to - from) / 12;
      for (let i = 0; i <= 12; i++) pts.push(fn(from + step * i));
    };
    edge((t) => [t, w.pitch[1]], w.yaw[0], w.yaw[1]);
    edge((t) => [w.yaw[1], t], w.pitch[1], w.pitch[0]);
    edge((t) => [t, w.pitch[0]], w.yaw[1], w.yaw[0]);
    edge((t) => [w.yaw[0], t], w.pitch[0], w.pitch[1]);
    const proj = pts.map(([y, p]) => this.project(Vec.dir(y, p), cam));
    if (proj.some((p) => !p)) return;
    const { ctx } = this;
    ctx.beginPath();
    proj.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.fillStyle = '#2a3b4a';
    ctx.fill();
    ctx.strokeStyle = 'rgba(236,232,225,0.25)';
    ctx.lineWidth = 2 * this.dpr;
    ctx.stroke();
  }

  // 狙擊鏡畫面：圓形視野 + 細十字線；alpha 用於開鏡過程的淡入
  drawScope(alpha) {
    const { ctx, W, H, dpr } = this;
    const cx = W / 2, cy = H / 2, R = H * 0.47;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.arc(cx, cy, R, 0, Math.PI * 2, true);
    ctx.fill('evenodd');
    ctx.strokeStyle = '#000';
    ctx.lineWidth = Math.max(1, dpr);
    ctx.beginPath();
    ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy);
    ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R);
    ctx.stroke();
    ctx.lineWidth = 4 * dpr;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  drawTarget(t, cam, now) {
    const p = this.project(Vec.dir(t.yaw, t.pitch), cam);
    if (!p) return;
    const r = this.radiusPx(t.r, p.z);
    if (r < 0.5 || p.x < -r * 2 || p.x > this.W + r * 2 || p.y < -r * 2 || p.y > this.H + r * 2) return;
    const { ctx } = this;
    // 出生時的彈出動畫（稍微放大後回到原尺寸）
    const age = (now - t.born) / 0.12;
    const s = age >= 1 ? 1 : 0.5 + 0.6 * Math.sin(Math.max(0, age) * Math.PI * 0.75);
    const rr = r * s;
    const pal = t.hot ? TARGET_COLORS.hot : TARGET_COLORS.normal;

    // 外圍光暈
    const halo = ctx.createRadialGradient(p.x, p.y, rr * 0.8, p.x, p.y, rr * 1.9);
    halo.addColorStop(0, pal.glow);
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(p.x, p.y, rr * 1.9, 0, Math.PI * 2);
    ctx.fill();

    // 球體明暗
    const grad = ctx.createRadialGradient(p.x - rr * 0.35, p.y - rr * 0.4, rr * 0.05, p.x, p.y, rr);
    grad.addColorStop(0, pal.light);
    grad.addColorStop(0.55, pal.base);
    grad.addColorStop(1, pal.dark);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, rr, 0, Math.PI * 2);
    ctx.fill();

    // 高光
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.ellipse(p.x - rr * 0.32, p.y - rr * 0.38, rr * 0.22, rr * 0.13, -0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // 擊中特效：擴散圓環 + 碎片 + 飄起的分數
  drawEffect(fx, cam, now) {
    const age = now - fx.t;
    const p = this.project(Vec.dir(fx.yaw, fx.pitch), cam);
    if (!p) return;
    const { ctx, dpr } = this;
    const r = this.radiusPx(fx.r, p.z);
    ctx.save();
    if (age < 0.25) {
      ctx.strokeStyle = `rgba(255,255,255,${1 - age / 0.25})`;
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * (1 + age * 6), 0, Math.PI * 2);
      ctx.stroke();
    }
    if (age < 0.4) {
      const a = 1 - age / 0.4;
      ctx.fillStyle = fx.color;
      ctx.globalAlpha = a;
      for (const part of fx.parts) {
        const d = r + part.speed * age * dpr;
        const size = Math.max(1.5, part.size * dpr * a);
        ctx.fillRect(p.x + Math.cos(part.angle) * d - size / 2, p.y + Math.sin(part.angle) * d - size / 2 + 60 * age * age * dpr, size, size);
      }
    }
    if (fx.text && age < 0.7) {
      ctx.globalAlpha = 1 - age / 0.7;
      ctx.font = `700 ${16 * dpr}px Rajdhani, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ece8e1';
      ctx.fillText(fx.text, p.x, p.y - r - (10 + age * 40) * dpr);
    }
    ctx.restore();
  }

  // 每秒幀數（設定開啟時顯示在左上角）
  drawFps(fps) {
    const { ctx, dpr } = this;
    ctx.save();
    ctx.font = `600 ${12 * dpr}px ui-monospace, Consolas, monospace`;
    ctx.fillStyle = 'rgba(236,232,225,0.7)';
    ctx.fillText(`${Math.round(fps)} FPS`, 12 * dpr, 22 * dpr);
    ctx.restore();
  }
}

// ---------- 音效（WebAudio 合成，不需要音檔） ----------
const Sfx = {
  ctx: null,
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },
  tone(freq, dur, type, vol) {
    const v = Store.settings.volume * vol;
    if (!this.ctx || v <= 0) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.ctx.destination);
    o.start(t);
    o.stop(t + dur);
  },
  hit() { this.tone(1046, 0.07, 'square', 0.18); },
  miss() { this.tone(140, 0.07, 'sine', 0.35); },
  tick() { this.tone(660, 0.05, 'sine', 0.3); },
  go() { this.tone(990, 0.15, 'triangle', 0.4); },
  end() { this.tone(520, 0.3, 'triangle', 0.4); },
};
