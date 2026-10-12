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

// ---------- 透視投影（與遊戲相同的水平 FOV） ----------
class View {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
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

  // 背景：漸層 + 經緯網格，讓轉動視角時有參考
  drawEnvironment(cam) {
    const { ctx, W, H } = this;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#16232f');
    g.addColorStop(1, '#0b1219');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.lineWidth = Math.max(1, this.dpr);
    for (let pitch = -60; pitch <= 60; pitch += 10) {
      ctx.strokeStyle = pitch === 0 ? 'rgba(255,70,85,0.35)' : 'rgba(236,232,225,0.06)';
      this.polyline(cam, (t) => [t, pitch], -180, 180, 3);
    }
    ctx.strokeStyle = 'rgba(236,232,225,0.06)';
    for (let yaw = -180; yaw < 180; yaw += 10) {
      this.polyline(cam, (t) => [yaw, t], -60, 60, 3);
    }
  }

  polyline(cam, fn, from, to, step) {
    const { ctx } = this;
    ctx.beginPath();
    let drawing = false;
    for (let t = from; t <= to; t += step) {
      const [yaw, pitch] = fn(t);
      const p = this.project(Vec.dir(yaw, pitch), cam);
      if (!p) { drawing = false; continue; }
      if (drawing) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y);
      drawing = true;
    }
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
    if (r < 0.5 || p.x < -r || p.x > this.W + r || p.y < -r || p.y > this.H + r) return;
    const { ctx } = this;
    // 出生時的放大動畫
    const s = clamp((now - t.born) / 0.08, 0.4, 1);
    const rr = r * s;
    const grad = ctx.createRadialGradient(p.x - rr * 0.35, p.y - rr * 0.35, rr * 0.1, p.x, p.y, rr);
    grad.addColorStop(0, t.hot ? '#9ffff0' : '#ff9aa3');
    grad.addColorStop(0.6, t.hot ? '#21d3b4' : '#ff4655');
    grad.addColorStop(1, t.hot ? '#0e7f6c' : '#a32632');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, rr, 0, Math.PI * 2);
    ctx.fill();
  }

  // 擊中特效：擴散的圓環
  drawEffect(fx, cam, now) {
    const age = now - fx.t;
    if (age > 0.25) return;
    const p = this.project(Vec.dir(fx.yaw, fx.pitch), cam);
    if (!p) return;
    const r = this.radiusPx(fx.r, p.z) * (1 + age * 6);
    const { ctx } = this;
    ctx.strokeStyle = `rgba(255,255,255,${1 - age / 0.25})`;
    ctx.lineWidth = 2 * this.dpr;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.stroke();
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
