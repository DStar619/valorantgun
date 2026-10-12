'use strict';

// 每個模式提供：
//   kind    'click'（點擊）| 'tracking'（跟槍）| 'reflex'（反應）
//   setup(g)          開場生成目標
//   onHit(g, t)       擊中目標
//   update(g, dt)     每幀更新（可選）
//   points(ttk)       擊中得分（可選，預設依擊殺速度加分）
// g 為 Game 實例，見 game.js

const MODES = [
  {
    id: 'gridshot',
    name: 'Gridshot',
    tag: '點擊 · 切換',
    desc: '3×3 網格中同時出現 3 個目標，越快擊破越好。練習目標切換與點擊節奏。',
    kind: 'click',
    setup(g) {
      const r = 1.3 * g.scale;
      const gapYaw = Math.max(5, r * 2.8);
      const gapPitch = Math.max(4, r * 2.8);
      this.cells = [];
      for (let row = -1; row <= 1; row++) {
        for (let col = -1; col <= 1; col++) this.cells.push({ yaw: col * gapYaw, pitch: row * gapPitch });
      }
      for (let i = 0; i < 3; i++) this.spawnInCell(g, -1);
    },
    spawnInCell(g, excludeCell) {
      const used = new Set(g.targets.map((t) => t.cell));
      const free = this.cells.map((_, i) => i).filter((i) => !used.has(i) && i !== excludeCell);
      const cell = free[Math.floor(Math.random() * free.length)];
      const c = this.cells[cell];
      g.spawn({ yaw: c.yaw, pitch: c.pitch, r: 1.3 * g.scale, cell });
    },
    onHit(g, t) {
      g.remove(t);
      this.spawnInCell(g, t.cell);
    },
  },
  {
    id: 'flick',
    name: 'Spidershot',
    tag: '點擊 · 甩槍',
    desc: '目標在中央與隨機遠處之間交替出現。練習大幅度甩槍並準確回到中心。',
    kind: 'click',
    setup(g) {
      this.next = 'far';
      g.spawn({ yaw: 0, pitch: 0, r: 1.1 * g.scale, hot: true });
    },
    onHit(g, t) {
      g.remove(t);
      const r = 1.1 * g.scale;
      if (this.next === 'far') {
        const d = rand(8, 32);
        const a = Math.random() * Math.PI * 2;
        g.spawn({ yaw: Math.cos(a) * d, pitch: clamp(Math.sin(a) * d * 0.45, -12, 12), r });
        this.next = 'center';
      } else {
        g.spawn({ yaw: 0, pitch: 0, r, hot: true });
        this.next = 'far';
      }
    },
  },
  {
    id: 'micro',
    name: 'Microshot',
    tag: '點擊 · 微調',
    desc: '很小的目標出現在準星附近。練習細微調整與第一發的精準度。',
    kind: 'click',
    setup(g) { this.spawnOne(g); },
    spawnOne(g) {
      const r = 0.45 * g.scale;
      g.spawn({ ...g.findSpot({ yaw: [-6, 6], pitch: [-3.5, 3.5], r, minFromCam: 1.5 }), r });
    },
    onHit(g, t) {
      g.remove(t);
      this.spawnOne(g);
    },
  },
  {
    id: 'headline',
    name: 'Headshot Line',
    tag: '點擊 · 準星擺放',
    desc: '頭部大小的目標只會出現在同一條水平線（紅線）上。練習準星永遠保持在頭線高度。',
    kind: 'click',
    setup(g) { this.spawnOne(g); },
    spawnOne(g) {
      const r = 0.55 * g.scale;
      const spot = g.findSpot({ yaw: [-38, 38], pitch: [-0.25, 0.25], r, minFromCam: 6 });
      g.spawn({ ...spot, r });
    },
    onHit(g, t) {
      g.remove(t);
      this.spawnOne(g);
    },
  },
  {
    id: 'tracking',
    name: 'Strafe Track',
    tag: '跟槍',
    desc: '目標像敵人 ADAD 急停一樣左右變向移動。讓準星持續貼在目標上，以貼合時間計分。',
    kind: 'tracking',
    setup(g) {
      this.target = g.spawn({ yaw: 0, pitch: 0, r: 1.1 * g.scale });
      this.vYaw = 0;
      this.vPitch = 0;
      this.nextChange = 0;
    },
    update(g, dt) {
      const t = this.target;
      if (g.time >= this.nextChange) {
        this.vYaw = (Math.random() < 0.5 ? -1 : 1) * rand(7, 22);
        this.vPitch = rand(-2.5, 2.5);
        this.nextChange = g.time + rand(0.3, 1.1);
      }
      t.yaw += this.vYaw * dt;
      t.pitch += this.vPitch * dt;
      if (Math.abs(t.yaw) > 28) { t.yaw = Math.sign(t.yaw) * 28; this.vYaw = -this.vYaw; }
      if (Math.abs(t.pitch) > 6) { t.pitch = Math.sign(t.pitch) * 6; this.vPitch = -this.vPitch; }

      const on = angleBetween(g.cam.f, Vec.dir(t.yaw, t.pitch)) <= t.r;
      t.hot = on;
      g.trackTotal += dt;
      if (on) {
        g.trackOn += dt;
        g.score += dt * 100;
      }
    },
  },
  {
    id: 'reflex',
    name: 'Reflex',
    tag: '反應',
    desc: '目標會在隨機時間、隨機位置閃現，1.2 秒內沒打到就消失。提早亂開槍會算失誤。',
    kind: 'reflex',
    LIFETIME: 1.2,
    setup(g) {
      this.next = rand(0.6, 1.4);
    },
    update(g) {
      const t = g.targets[0];
      if (!t && g.time >= this.next) {
        const a = Math.random() * Math.PI * 2;
        const d = rand(4, 16);
        g.spawn({
          yaw: g.cam.yaw + Math.cos(a) * d,
          pitch: clamp(g.cam.pitch + Math.sin(a) * d * 0.6, -30, 30),
          r: 0.9 * g.scale,
        });
      } else if (t && g.time - t.born > this.LIFETIME) {
        g.remove(t);
        g.misses++;
        g.expired++;
        this.next = g.time + rand(0.6, 1.6);
      }
    },
    onHit(g, t) {
      g.remove(t);
      this.next = g.time + rand(0.6, 1.6);
    },
    points(ttk) { return Math.max(10, Math.round(1000 - ttk * 1000)); },
  },
];
