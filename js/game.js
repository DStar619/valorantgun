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
      const k = Store.settings.sens * VAL_YAW;
      this.cam.rotate(mx * k, -my * k);
    });

    document.addEventListener('mousedown', (e) => {
      if (!this.active || !this.isLocked() || e.button !== 0) return;
      if (this.state === 'running') this.shoot();
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

  // ---------- 射擊 ----------
  shoot() {
    if (this.mode.kind === 'tracking') return;
    let hit = null, hitAng = Infinity;
    for (const t of this.targets) {
      const a = angleBetween(this.cam.f, Vec.dir(t.yaw, t.pitch));
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
      if (this.mode.update) this.mode.update(this, dt);
      if (this.time >= this.duration) this.finish();
    }
  }

  render() {
    const v = this.view;
    v.drawEnvironment(this.cam);
    for (const t of this.targets) v.drawTarget(t, this.cam, this.time);
    this.fx = this.fx.filter((f) => this.time - f.t < 0.25);
    for (const f of this.fx) v.drawEffect(f, this.cam, this.time);
    drawCrosshair(v.ctx, v.W / 2, v.H / 2, Store.settings, v.dpr);
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
      date: Date.now(),
    };
  }
}
