'use strict';

// 遊戲狀態：idle（等待點擊）→ countdown → running → over
//                       ↘ paused（滑鼠解鎖時）↗
class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.view = new View(canvas);
    this.cam = new Camera();
    this.mode = null;
    this.state = 'idle';
    this.active = false;
    this.onEnd = null;
    this.onQuit = null;
    this.lastTs = 0;

    this.el = {
      overlay: document.getElementById('overlay'),
      title: document.getElementById('overlay-title'),
      desc: document.getElementById('overlay-desc'),
      error: document.getElementById('overlay-error'),
      resume: document.getElementById('btn-resume'),
      countdown: document.getElementById('countdown'),
      hudMode: document.getElementById('hud-mode'),
      hudTime: document.getElementById('hud-time'),
      hudScore: document.getElementById('hud-score'),
      hudAcc: document.getElementById('hud-acc'),
      hudAccLabel: document.getElementById('hud-acc-label'),
    };

    this.bindEvents();
    requestAnimationFrame((ts) => this.frame(ts));
  }

  // ---------- 生命週期 ----------
  load(mode) {
    this.mode = mode;
    this.active = true;
    this.view.resize();
    this.reset();
    this.setState('idle');
  }

  reset() {
    const s = Store.settings;
    this.duration = Number(s.duration) || 60;
    this.scale = Number(s.targetScale) || 1;
    this.cam.reset();
    this.targets = [];
    this.fx = [];
    this.time = 0;
    this.score = 0;
    this.hits = 0;
    this.misses = 0;
    this.expired = 0;
    this.ttks = [];
    this.lastHit = 0;
    this.trackOn = 0;
    this.trackTotal = 0;
    this.walls = [];
    this.bloom = 0;        // 目前開火誤差（度）
    this.bloomAt = 0;      // 最後一次開槍的時間
    // 狙擊槍狀態
    this.weapon = this.mode.weapon ? WEAPONS[this.mode.weapon] : null;
    this.zoomIdx = 0;      // 0 = 未開鏡，1 = 第一段倍率…
    this.zoomCur = 1;      // 目前實際倍率（開鏡動畫中會介於兩段之間）
    this.readyAt = 0;      // 下一發可以開槍的時間（上膛）
    this.rightHeld = false;
    this.view.setZoom(1);
    this.mode.setup(this);
  }

  restart() {
    if (!this.mode) return;
    this.reset();
    if (this.isLocked()) this.startCountdown(3);
    else this.setState('idle');
  }

  quit() {
    this.active = false;
    this.state = 'over';
    if (this.isLocked()) document.exitPointerLock();
    if (this.onQuit) this.onQuit();
  }

  finish() {
    this.time = this.duration;
    this.setState('over');
    Sfx.end();
    if (this.isLocked()) document.exitPointerLock();
    this.active = false;
    if (this.onEnd) this.onEnd(this.buildResult());
  }

  startCountdown(sec) {
    this.countdownLeft = sec;
    this.lastCount = Math.ceil(sec);
    Sfx.tick();
    this.setState('countdown');
  }

  setState(state) {
    this.state = state;
    const showOverlay = state === 'idle' || state === 'paused';
    this.el.overlay.classList.toggle('show', showOverlay);
    this.el.countdown.textContent = '';
    if (state === 'idle') {
      this.el.title.textContent = this.mode.name;
      this.el.desc.textContent = this.mode.desc;
      this.el.resume.textContent = '開始';
    } else if (state === 'paused') {
      this.rightHeld = false;
      this.setZoomIdx(0);
      this.el.title.textContent = '已暫停';
      this.el.desc.textContent = '點擊畫面或按「繼續」回到訓練。';
      this.el.resume.textContent = '繼續';
    }
    if (showOverlay) this.el.error.textContent = '';
  }

  // ---------- 滑鼠鎖定 ----------
  isLocked() { return document.pointerLockElement === this.canvas; }

  requestLock() {
    Sfx.ensure();
    this.el.error.textContent = '';
    const fail = () => { this.el.error.textContent = '無法鎖定滑鼠，請稍等一秒後再點擊。'; };
    const plain = () => {
      try {
        const p = this.canvas.requestPointerLock();
        if (p && p.catch) p.catch(fail);
      } catch (e) { fail(); }
    };
    if (!Store.settings.rawInput) return plain();
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      // 不支援 Raw Input 的瀏覽器會拒絕，退回一般鎖定
      if (p && p.catch) p.catch((err) => (err && err.name === 'NotSupportedError' ? plain() : fail()));
    } catch (e) { plain(); }
  }

  bindEvents() {
    document.addEventListener('pointerlockchange', () => {
      if (!this.active) return;
      if (this.isLocked()) {
        if (this.state === 'idle') this.startCountdown(3);
        else if (this.state === 'paused') this.startCountdown(1);
      } else if (this.state === 'running' || this.state === 'countdown') {
        this.setState('paused');
      }
    });
    document.addEventListener('pointerlockerror', () => {
      if (this.active) this.el.error.textContent = '無法鎖定滑鼠，請稍等一秒後再點擊。';
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.active || !this.isLocked()) return;
      if (this.state !== 'running' && this.state !== 'countdown') return;
      const mx = e.movementX, my = e.movementY;
      // 部分瀏覽器在非 Raw Input 時偶爾會送出異常的大位移，直接忽略
      if (Math.abs(mx) > 1500 || Math.abs(my) > 1500) return;
      this.cam.rotate(mx * this.degPerCount(), -my * this.degPerCount());
    });

    document.addEventListener('mousedown', (e) => {
      if (!this.active || !this.isLocked()) return;
      if (e.button === 0 && this.state === 'running') this.shoot();
      if (e.button === 2 && (this.state === 'running' || this.state === 'countdown')) this.onScopeDown();
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 2) this.onScopeUp();
    });
    document.addEventListener('contextmenu', (e) => {
      if (this.active) e.preventDefault();
    });

    this.el.overlay.addEventListener('click', (e) => {
      if (e.target === this.el.overlay) this.requestLock();
    });
    this.el.resume.addEventListener('click', () => this.requestLock());
    document.getElementById('btn-restart').addEventListener('click', () => { this.restart(); this.requestLock(); });
    document.getElementById('btn-quit').addEventListener('click', () => this.quit());

    document.addEventListener('keydown', (e) => {
      if (!this.active) return;
      if (e.code === 'KeyR') this.restart();
    });

    window.addEventListener('resize', () => this.view.resize());
  }

  // ---------- 目標工具（給模式使用） ----------
  spawn(props) {
    const t = { born: this.time, hot: false, ...props };
    this.targets.push(t);
    return t;
  }

  remove(t) {
    const i = this.targets.indexOf(t);
    if (i >= 0) this.targets.splice(i, 1);
  }

  // 在範圍內找一個不和其他目標重疊、且離準星夠遠的位置
  findSpot({ yaw, pitch, r, minFromCam = 0 }) {
    let spot = null;
    for (let i = 0; i < 40; i++) {
      spot = { yaw: rand(yaw[0], yaw[1]), pitch: rand(pitch[0], pitch[1]) };
      const d = Vec.dir(spot.yaw, spot.pitch);
      if (angleBetween(d, this.cam.f) < minFromCam) continue;
      const overlap = this.targets.some((t) => angleBetween(d, Vec.dir(t.yaw, t.pitch)) < t.r + r + 0.4);
      if (!overlap) break;
    }
    return spot;
  }

  // ---------- 狙擊鏡 ----------
  // 每個滑鼠 count 轉動的角度；開鏡時依遊戲的焦距縮放（倍率 1 時，畫面上的移動距離與未開鏡相同）
  degPerCount() {
    const k = Store.settings.sens * VAL_YAW;
    return this.zoomCur > 1 ? k * (Number(Store.settings.scopedSens) || 1) / this.zoomCur : k;
  }

  targetZoom() { return this.zoomIdx ? this.weapon.zooms[this.zoomIdx - 1] : 1; }

  setZoomIdx(i) {
    this.zoomIdx = i;
    if (i === 0) this.zoomCur = 1; // 退出瞄準鏡是瞬間的
  }

  isFullyScoped() { return this.zoomIdx > 0 && Math.abs(this.zoomCur - this.targetZoom()) < 1e-3; }

  onScopeDown() {
    this.rightHeld = true;
    if (!this.weapon || this.time < this.readyAt) return; // 上膛中無法開鏡
    if (Store.settings.scopeHold) this.setZoomIdx(1);
    else this.setZoomIdx((this.zoomIdx + 1) % (this.weapon.zooms.length + 1));
  }

  onScopeUp() {
    this.rightHeld = false;
    if (this.weapon && Store.settings.scopeHold) this.setZoomIdx(0);
  }

  updateZoom(dt) {
    if (!this.weapon) return;
    // 按住模式：上膛完成後若仍按著右鍵，自動重新開鏡
    if (Store.settings.scopeHold && this.rightHeld && this.zoomIdx === 0 && this.time >= this.readyAt) this.setZoomIdx(1);
    const target = this.targetZoom();
    if (this.zoomCur === target) return;
    // 在對數空間等速放大：到第一段倍率剛好花 scopeTime 秒
    const speed = Math.log(this.weapon.zooms[0]) / this.weapon.scopeTime;
    const cur = Math.log(this.zoomCur), goal = Math.log(target);
    const next = cur + Math.sign(goal - cur) * speed * dt;
    this.zoomCur = Math.abs(goal - cur) <= speed * dt ? target : Math.exp(next);
  }

  // 未開鏡時的散布：在半徑 spread 度的圓內隨機偏移
  spreadDir(spread) {
    const a = Math.random() * Math.PI * 2;
    const d = spread * Math.sqrt(Math.random()) * DEG;
    const { f, r, u } = this.cam;
    const x = Math.tan(d) * Math.cos(a), y = Math.tan(d) * Math.sin(a);
    const v = [f[0] + r[0] * x + u[0] * y, f[1] + r[1] * x + u[1] * y, f[2] + r[2] * x + u[2] * y];
    const len = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / len, v[1] / len, v[2] / len];
  }

  // ---------- 開火誤差（準星擴散） ----------
  addBloom() {
    this.bloom = Math.min(FIRING_ERROR.max, this.bloom + FIRING_ERROR.kick);
    this.bloomAt = this.time;
  }

  updateBloom(dt) {
    if (this.bloom > 0 && this.time - this.bloomAt >= FIRING_ERROR.delay) {
      this.bloom = Math.max(0, this.bloom - FIRING_ERROR.recover * dt);
    }
  }

  // ---------- 射擊 ----------
  shoot() {
    if (this.mode.kind === 'tracking') return;
    let dir = this.cam.f;
    if (this.weapon) {
      if (this.time < this.readyAt) return; // 上膛中，扣扳機沒有反應
      if (!this.isFullyScoped()) dir = this.spreadDir(this.weapon.hipSpread);
      this.readyAt = this.time + this.weapon.fireInterval;
      this.setZoomIdx(0); // 開槍後自動退出瞄準鏡
    }
    this.addBloom();
    let hit = null, hitAng = Infinity;
    for (const t of this.targets) {
      if (this.mode.hittable && !this.mode.hittable(this, t)) continue;
      const a = angleBetween(dir, Vec.dir(t.yaw, t.pitch));
      if (a <= t.r && a < hitAng) { hit = t; hitAng = a; }
    }
    if (!hit) {
      this.misses++;
      Sfx.miss();
      return;
    }
    const ttk = this.time - Math.max(hit.born, this.lastHit);
    this.hits++;
    this.ttks.push(ttk);
    this.lastHit = this.time;
    this.score += this.mode.points
      ? this.mode.points(ttk)
      : 100 + Math.round(clamp(1 - ttk / 1.2, 0, 1) * 50);
    this.fx.push({ yaw: hit.yaw, pitch: hit.pitch, r: hit.r, t: this.time });
    Sfx.hit();
    this.mode.onHit(this, hit);
  }

  // ---------- 主迴圈 ----------
  frame(ts) {
    const dt = this.lastTs ? Math.min(0.25, (ts - this.lastTs) / 1000) : 0;
    this.lastTs = ts;
    if (this.active) {
      this.step(dt);
      if (this.active) {
        this.render();
        this.updateHud();
      }
    }
    requestAnimationFrame((t) => this.frame(t));
  }

  step(dt) {
    if (this.state === 'countdown' || this.state === 'running') this.updateZoom(dt);
    if (this.state === 'countdown') {
      this.countdownLeft -= dt;
      const n = Math.ceil(this.countdownLeft);
      if (this.countdownLeft <= 0) {
        this.el.countdown.textContent = '';
        this.state = 'running';
        Sfx.go();
      } else {
        if (n !== this.lastCount) { this.lastCount = n; Sfx.tick(); }
        this.el.countdown.textContent = n;
      }
    } else if (this.state === 'running') {
      this.time += dt;
      this.updateBloom(dt);
      if (this.mode.update) this.mode.update(this, dt);
      if (this.time >= this.duration) this.finish();
    }
  }

  render() {
    const v = this.view;
    v.setZoom(this.zoomCur);
    v.drawEnvironment(this.cam);
    for (const t of this.targets) v.drawTarget(t, this.cam, this.time);
    for (const w of this.walls) v.drawWall(w, this.cam); // 牆畫在目標之後，擋住牆後的目標
    this.fx = this.fx.filter((f) => this.time - f.t < 0.25);
    for (const f of this.fx) v.drawEffect(f, this.cam, this.time);
    const xh = Crosshair.current();
    if (this.zoomCur > 1) {
      const progress = Math.min(1, Math.log(this.zoomCur) / Math.log(this.weapon.zooms[0]));
      v.drawScope(progress);
      if (this.isFullyScoped()) Crosshair.drawScopeDot(v.ctx, v.W / 2, v.H / 2, xh, v.dpr);
    } else {
      const err = Math.tan(this.bloom * DEG) * v.k;
      Crosshair.draw(v.ctx, v.W / 2, v.H / 2, xh, v.dpr, err, this.bloom / FIRING_ERROR.max);
    }
    if (this.weapon) this.drawWeaponHud();
  }

  // 畫面下方：武器名稱、倍率、上膛進度
  drawWeaponHud() {
    const { ctx, W, H, dpr } = this.view;
    const w = 180 * dpr, h = 4 * dpr;
    const x = W / 2 - w / 2, y = H - 48 * dpr;
    const left = Math.max(0, this.readyAt - this.time);
    const ready = left <= 0;
    ctx.save();
    ctx.font = `700 ${18 * dpr}px Rajdhani, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ece8e1';
    const zoom = this.zoomIdx ? ` · ${this.targetZoom()}×` : '';
    ctx.fillText(`${this.weapon.name.toUpperCase()}${zoom}`, W / 2, y - 10 * dpr);
    ctx.fillStyle = 'rgba(236,232,225,0.2)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = ready ? '#3ee8a5' : '#ff4655';
    ctx.fillRect(x, y, w * (1 - left / this.weapon.fireInterval), h);
    ctx.restore();
  }

  // ---------- 統計 ----------
  accuracy() {
    if (this.mode.kind === 'tracking') return this.trackTotal > 0 ? this.trackOn / this.trackTotal : null;
    const shots = this.hits + this.misses;
    return shots > 0 ? this.hits / shots : null;
  }

  avgMs() {
    if (!this.ttks.length) return null;
    return this.ttks.reduce((a, b) => a + b, 0) / this.ttks.length * 1000;
  }

  updateHud() {
    const e = this.el;
    e.hudMode.textContent = this.mode.name;
    e.hudTime.textContent = Math.max(0, this.duration - this.time).toFixed(1);
    e.hudScore.textContent = Math.round(this.score);
    if (this.mode.kind === 'reflex') {
      e.hudAccLabel.textContent = '平均反應';
      const avg = this.avgMs();
      e.hudAcc.textContent = avg == null ? '-' : `${Math.round(avg)} ms`;
    } else {
      e.hudAccLabel.textContent = this.mode.kind === 'tracking' ? '貼合率' : '命中率';
      const acc = this.accuracy();
      e.hudAcc.textContent = acc == null ? '-' : `${(acc * 100).toFixed(1)}%`;
    }
  }

  buildResult() {
    return {
      mode: this.mode.id,
      kind: this.mode.kind,
      duration: this.duration,
      score: Math.round(this.score),
      hits: this.hits,
      misses: this.misses,
      expired: this.expired,
      acc: this.accuracy(),
      avgMs: this.avgMs(),
      bestMs: this.ttks.length ? Math.min(...this.ttks) * 1000 : null,
      trackOn: this.trackOn,
      sens: Store.settings.sens,
      weapon: this.weapon ? this.weapon.name : null,
      date: Date.now(),
    };
  }
}
