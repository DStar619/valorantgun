'use strict';

// 每個模式提供：
//   kind    'click'（點擊）| 'tracking'（跟槍）| 'reflex'（反應）
//   setup(g)          開場生成目標
//   onHit(g, t)       擊中目標
//   update(g, dt)     每幀更新（可選）
//   points(ttk)       擊中得分（可選，預設依擊殺速度加分）
//   weapon            'operator' | 'marshal' | 'outlaw'（可選，未設定 = 步槍，無射速限制）
//   hittable(g, t)    目標此刻是否打得到（可選，例如被牆擋住時回傳 false）
// g 為 Game 實例，見 game.js

// 狙擊槍參數（參考遊戲數值，散布為近似值）
//   zooms         各段開鏡倍率
//   fireInterval  兩發之間的秒數（Operator 射速 0.6 發/秒、Marshal 1.5 發/秒）
//   hipSpread     未開鏡射擊的散布半徑（度）
//   scopeTime     開鏡到第一段倍率所需秒數
//   mag           彈匣容量（可選，未設定 = 每發之間只算上膛時間，不換彈）
//   reloadTime    彈匣打空後的換彈秒數（搭配 mag）
//   keepScope     開槍後維持開鏡（可選，預設開槍後自動退鏡）
const WEAPONS = {
  operator: { name: 'Operator', zooms: [2.5, 5], fireInterval: 1 / 0.6, hipSpread: 5, scopeTime: 0.2 },
  marshal: { name: 'Marshal', zooms: [3.5], fireInterval: 1 / 1.5, hipSpread: 1.5, scopeTime: 0.15 },
  // Outlaw：雙管，2 發彈匣、射速 2.75 發/秒、開槍不退鏡，打空後換彈 3.8 秒
  outlaw: {
    name: 'Outlaw', zooms: [3.5], fireInterval: 1 / 2.75, hipSpread: 3, scopeTime: 0.15,
    mag: 2, reloadTime: 3.8, keepScope: true,
  },
};

// 狙擊模式的得分：開槍越快加分越多（狙擊節奏較慢，所以給較長的加分時間）
const sniperPoints = (ttk) => 100 + Math.round(clamp(1 - ttk / 2.5, 0, 1) * 100);

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
  {
    id: 'op-flick',
    name: 'Operator Flick',
    tag: '狙擊 · 甩狙',
    desc: '使用 Operator（右鍵 2.5× / 5× 開鏡、射速慢）。目標隨機出現在各處，練習「甩過去 → 開鏡 → 開槍」的快狙節奏。未開鏡射擊幾乎打不中。',
    kind: 'click',
    weapon: 'operator',
    setup(g) { this.spawnOne(g); },
    spawnOne(g) {
      const r = 0.8 * g.scale;
      g.spawn({ ...g.findSpot({ yaw: [-40, 40], pitch: [-7, 7], r, minFromCam: 10 }), r });
    },
    onHit(g, t) {
      g.remove(t);
      this.spawnOne(g);
    },
    points: sniperPoints,
  },
  {
    id: 'marshal-peek',
    name: 'Marshal Peek',
    tag: '狙擊 · 架槍',
    desc: '使用 Marshal（3.5× 開鏡）架住兩面牆之間的通道。敵人會從牆後橫越或探頭後縮回，在他躲回掩體前擊倒他。',
    kind: 'click',
    weapon: 'marshal',
    GAP: 4, // 通道半寬（度）
    setup(g) {
      g.walls = [
        { yaw: [-24, -this.GAP], pitch: [-8, 10] },
        { yaw: [this.GAP, 24], pitch: [-8, 10] },
      ];
      this.target = null;
      this.next = rand(0.8, 1.6);
    },
    update(g, dt) {
      const t = this.target;
      if (!t) {
        if (g.time >= this.next) {
          const dirn = Math.random() < 0.5 ? 1 : -1;
          const r = 0.5 * g.scale;
          const jiggle = Math.random() < 0.3; // 探頭後縮回
          this.target = g.spawn({
            yaw: -dirn * (this.GAP + r + 1.5),
            pitch: rand(-0.5, 1.5),
            r,
            vy: dirn * rand(7, 13),
            turnAt: jiggle ? -dirn * (this.GAP - rand(1, 2.5)) : null,
            seen: false,
          });
        }
        return;
      }
      t.yaw += t.vy * dt;
      // 從牆後出現的瞬間才開始計算擊殺時間
      if (!t.seen && Math.abs(t.yaw) < this.GAP + t.r) { t.seen = true; t.born = g.time; }
      if (t.turnAt != null && (t.vy > 0 ? t.yaw >= t.turnAt : t.yaw <= t.turnAt)) {
        t.vy = -t.vy;
        t.turnAt = null;
      }
      if (Math.abs(t.yaw) > this.GAP + t.r + 1.5 && Math.sign(t.yaw) === Math.sign(t.vy)) {
        g.remove(t);
        this.target = null;
        g.misses++;
        g.expired++;
        this.next = g.time + rand(0.6, 1.6);
      }
    },
    hittable(g, t) { return Math.abs(t.yaw) < this.GAP; },
    onHit(g, t) {
      g.remove(t);
      this.target = null;
      this.next = g.time + rand(0.6, 1.6);
    },
    points: sniperPoints,
  },
  {
    id: 'outlaw-double',
    name: 'Outlaw Double',
    tag: '狙擊 · 連射',
    desc: '使用 Outlaw（3.5× 開鏡、2 發彈匣、開槍不退鏡）。兩個目標會成對出現，開鏡後連開兩槍把兩個都打掉；打空會自動換彈 3.8 秒，所以每一發都要算數。',
    kind: 'click',
    weapon: 'outlaw',
    setup(g) { this.spawnPair(g); },
    spawnPair(g) {
      const r = 0.6 * g.scale;
      const a = g.findSpot({ yaw: [-35, 35], pitch: [-6, 6], r, minFromCam: 10 });
      // 第二個目標在第一個附近（開鏡後的視野內），讓兩發之間只需要小幅修正
      const ang = Math.random() * Math.PI * 2;
      const d = rand(2.5, 5);
      g.spawn({ ...a, r });
      g.spawn({ yaw: a.yaw + Math.cos(ang) * d, pitch: clamp(a.pitch + Math.sin(ang) * d * 0.6, -9, 9), r });
    },
    onHit(g, t) {
      g.remove(t);
      if (!g.targets.length) this.spawnPair(g);
    },
    points: sniperPoints,
  },
];
