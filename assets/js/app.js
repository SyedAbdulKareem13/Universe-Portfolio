/* =====================================================================
   app.js — Universe Portfolio engine
   A faithful vanilla port of the Claude-Design prototype (three.js + GSAP +
   ScrollTrigger + Lenis + Matter.js), with the four placeholder sections
   rendered from data.js and a cinematic Black Hole -> THE END -> REVIVE
   sequence built as a single reversible GSAP master timeline.

   No build step. Every animation/physics tuning value is preserved from the
   original prototype so there is zero animation loss.
   ===================================================================== */

class Portfolio {
  constructor() {
    // static design props (were Claude-Design editor controls)
    this.props = { accentMode: 'Duotone', orbDistortion: 0.18, grain: true };
    this.menuOpen = false;
    this.worldPhase = 'idle'; // idle | swallowing | ended | reviving
  }

  /* ---------------- lifecycle ---------------- */
  init() {
    if (this._init) return; this._init = true;
    const mm = (q) => { try { return window.matchMedia(q).matches; } catch (e) { return false; } };
    this.prefersReduced = mm('(prefers-reduced-motion: reduce)');
    this.isTouch = mm('(hover: none), (pointer: coarse)');
    this.isSmall = window.innerWidth < 768;
    this.use3D = !this.isSmall && this.hasWebGL();
    this.useCursor = !this.isTouch;
    this.useLenis = !this.prefersReduced && !this.isTouch;
    this.motion = !this.prefersReduced;
    this._baseAmp = 0.18;
    this.mouse = { x: 0, y: 0, tx: 0, ty: 0 };

    this.renderSections();      // build Skills/Experience/Projects/Achievements from data.js
    this.wireEvents();          // clicks (nav, law buttons, hud, form)
    this.initInlineHover();     // style-hover / style-focus attributes
    this.initLawsDefault();
    this.initGrain();
    this.startPreloader();
    this._globalSafety = setTimeout(() => { const pre = document.getElementById('preloader'); if (pre && pre.style.display !== 'none') this.hardReveal(); }, 6500);
    this.waitForDeps().then((ok) => this.boot(ok));
  }

  /* ---------------- event wiring (replaces Claude-Design {{ }} bindings) ---------------- */
  wireEvents() {
    document.querySelectorAll('[data-target]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        this.scrollToId(el.getAttribute('data-target'));
        if (this.menuOpen) this.toggleMenu();
      });
    });
    const burger = document.getElementById('nav-burger');
    if (burger) burger.addEventListener('click', () => this.toggleMenu());
    const mclose = document.getElementById('mobile-close');
    if (mclose) mclose.addEventListener('click', () => this.toggleMenu());

    const launch = document.getElementById('hud-launch');
    if (launch) launch.addEventListener('click', () => this.enterLab());
    const lclose = document.getElementById('law-close');
    if (lclose) lclose.addEventListener('click', () => this.exitLab());
    document.querySelectorAll('[data-law-btn]').forEach((btn) => {
      btn.addEventListener('click', () => this.routeLaw(btn.getAttribute('data-law-btn'), btn));
    });

    const revive = document.getElementById('revive-btn');
    if (revive) revive.addEventListener('click', () => this.revive());
    // never trap the user: Esc (and browser back) revive from THE END
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.worldPhase === 'ended') this.revive(); });
    window.addEventListener('popstate', () => { if (this.worldPhase === 'ended' || this.worldPhase === 'swallowing') this.revive(); });

    this.initContactForm();
  }

  toggleMenu() {
    this.menuOpen = !this.menuOpen;
    const m = document.getElementById('mobile-menu'); if (!m) return;
    if (this.menuOpen) { m.style.opacity = '1'; m.style.transform = 'translateY(0)'; m.style.pointerEvents = 'auto'; }
    else { m.style.opacity = '0'; m.style.transform = 'translateY(-26px)'; m.style.pointerEvents = 'none'; }
  }

  /* ---------------- style-hover / style-focus helper ----------------
     Reproduces the prototype's declarative hover/focus styling without a
     framework: read the attribute, apply on enter/focus, restore on leave. */
  initInlineHover() {
    const parse = (s) => s.split(';').map((r) => r.trim()).filter(Boolean).map((r) => {
      const i = r.indexOf(':'); return [r.slice(0, i).trim(), r.slice(i + 1).trim()];
    });
    const bind = (attr, onEvents, offEvents) => {
      document.querySelectorAll('[' + attr + ']').forEach((el) => {
        const rules = parse(el.getAttribute(attr));
        const enter = () => { el._hsOrig = el._hsOrig || {}; rules.forEach(([p, v]) => { el._hsOrig[p] = el.style.getPropertyValue(p); el.style.setProperty(p, v.replace('!important', ''), v.includes('!important') ? 'important' : ''); }); };
        const leave = () => { if (!el._hsOrig) return; rules.forEach(([p]) => { el.style.setProperty(p, el._hsOrig[p] || ''); }); };
        onEvents.forEach((ev) => el.addEventListener(ev, enter));
        offEvents.forEach((ev) => el.addEventListener(ev, leave));
      });
    };
    bind('style-hover', ['mouseenter'], ['mouseleave']);
    bind('style-focus', ['focus'], ['blur']);
  }

  /* ---------------- physics playground ---------------- */
  initLawsDefault() {
    this.laws = {
      enabled: false, preset: 'earth', sound: true,
      gx: 0, gy: 1, gScale: 0.001, timeScale: 1, friction: 0.09, restitution: 0.38, airDrag: 0.02,
      gxT: 0, gyT: 1, gScaleT: 0.001, timeScaleT: 1, frictionT: 0.09, restitutionT: 0.38, airDragT: 0.02,
      slowmo: false, blackHole: false, timeState: 'live', resetting: false,
    };
    this.PRESETS = {
      earth:   { gScale: 0.001,   gy: 1, gx: 0, fr: 0.09, rest: 0.38, air: 0.02,  cap: 'EARTH · 1g — normal gravity' },
      zerog:   { gScale: 0,       gy: 0, gx: 0, fr: 0.0,  rest: 0.9,  air: 0.004, cap: 'ZERO-G — gravity off, free drift' },
      mars:    { gScale: 0.00038, gy: 1, gx: 0, fr: 0.03, rest: 0.68, air: 0.012, cap: 'MARS · 0.38g — floaty falls' },
      moon:    { gScale: 0.00016, gy: 1, gx: 0, fr: 0.03, rest: 0.8,  air: 0.01,  cap: 'MOON · 0.16g — big bounces' },
      jupiter: { gScale: 0.0025,  gy: 1, gx: 0, fr: 0.12, rest: 0.2,  air: 0.035, cap: 'JUPITER · 2.5g — crushing pull' },
    };
  }

  ensureSplit() {
    if (this._nameSplit) return;
    this._letters = this.splitName();
    this._nameSplit = true;
  }

  enterLab() {
    if (this.laws && this.laws.enabled) { const bar = document.getElementById('law-bar'); if (bar) bar.style.display = 'flex'; return; }
    this.enterPhysics();
  }

  exitLab() { this.exitPhysics(); }

  initHudDrag() {
    const p = document.getElementById('law-bar'); const h = document.getElementById('law-drag');
    if (!p || !h) return;
    this._hudPos = { x: 0, y: 0 }; let sx, sy, ox, oy, drag = false;
    const apply = () => { p.style.transform = 'translateX(-50%) translate(' + this._hudPos.x + 'px,' + this._hudPos.y + 'px)'; };
    const down = (e) => { drag = true; const pt = e.touches ? e.touches[0] : e; sx = pt.clientX; sy = pt.clientY; ox = this._hudPos.x; oy = this._hudPos.y; h.style.cursor = 'grabbing'; if (e.cancelable) e.preventDefault(); };
    const move = (e) => { if (!drag) return; const pt = e.touches ? e.touches[0] : e; this._hudPos.x = ox + (pt.clientX - sx); this._hudPos.y = oy + (pt.clientY - sy); apply(); };
    const up = () => { drag = false; h.style.cursor = 'grab'; };
    h.addEventListener('mousedown', down); window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
    h.addEventListener('touchstart', down, { passive: false }); window.addEventListener('touchmove', move, { passive: false }); window.addEventListener('touchend', up);
  }

  ensurePhysicsLib(cb) {
    if (window.Matter) return cb();
    const t0 = Date.now();
    const tick = () => { if (window.Matter) return cb(); if (Date.now() - t0 > 4000) return; setTimeout(tick, 80); };
    tick();
  }

  enterPhysics() {
    this.ensurePhysicsLib(() => {
      if (this.laws.enabled) return;
      if (this.lenis) { try { this.lenis.scrollTo(0, { immediate: true }); } catch (e) {} } else { window.scrollTo(0, 0); }
      setTimeout(() => this._buildPhysics(), 70);
    });
  }

  _buildPhysics() {
    const M = window.Matter;
    this.ensureSplit();
    const chars = [];
    (this._letters || []).forEach((el) => chars.push(el));
    document.querySelectorAll('[data-phys-chip]').forEach((el) => chars.push(el));
    if (!chars.length) return;
    let layer = document.getElementById('phys-layer');
    if (!layer) { layer = document.createElement('div'); layer.id = 'phys-layer'; layer.style.cssText = 'position:fixed;inset:0;z-index:45;pointer-events:none;overflow:hidden;'; document.body.appendChild(layer); }
    layer.innerHTML = '';
    this.engine = M.Engine.create({ enableSleeping: true });
    this.world = this.engine.world;
    this.bodies = [];
    chars.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      const isChip = el.hasAttribute('data-phys-chip');
      const st = getComputedStyle(el);
      const clone = el.cloneNode(true);
      clone.style.position = 'absolute'; clone.style.left = '0'; clone.style.top = '0'; clone.style.margin = '0';
      clone.style.width = r.width + 'px'; clone.style.height = r.height + 'px';
      clone.style.display = 'flex'; clone.style.alignItems = 'center'; clone.style.justifyContent = 'center';
      clone.style.whiteSpace = 'nowrap'; clone.style.willChange = 'transform'; clone.style.pointerEvents = 'none'; clone.style.visibility = 'visible';
      clone.style.fontFamily = st.fontFamily; clone.style.fontSize = st.fontSize; clone.style.fontWeight = st.fontWeight; clone.style.color = st.color; clone.style.lineHeight = st.lineHeight;
      if (isChip) { clone.style.background = st.backgroundColor; clone.style.border = st.border; clone.style.borderRadius = st.borderRadius; clone.style.backdropFilter = 'none'; clone.style.webkitBackdropFilter = 'none'; }
      clone.style.transform = 'translate(' + r.left + 'px,' + r.top + 'px)';
      layer.appendChild(clone);
      el.style.visibility = 'hidden';
      const body = M.Bodies.rectangle(r.left + r.width / 2, r.top + r.height / 2, r.width, r.height, {
        restitution: this.laws.restitution, friction: this.laws.friction, frictionAir: this.laws.airDrag,
        chamfer: { radius: Math.min(7, r.height / 3) }, sleepThreshold: 60,
      });
      M.World.add(this.world, body);
      this.bodies.push({ el, clone, body, w: r.width, h: r.height, rest: { x: r.left + r.width / 2, y: r.top + r.height / 2 } });
    });
    this.buildWalls();
    this.mouseObj = M.Mouse.create(document.body);
    try { document.body.removeEventListener('mousewheel', this.mouseObj.mousewheel); document.body.removeEventListener('DOMMouseScroll', this.mouseObj.mousewheel); } catch (e) {}
    this.mc = M.MouseConstraint.create(this.engine, { mouse: this.mouseObj, constraint: { stiffness: 0.18, render: { visible: false } } });
    M.World.add(this.world, this.mc);
    M.Events.on(this.engine, 'collisionStart', (ev) => this.onCollide(ev));
    this.laws.enabled = true;
    this.startPhysLoop();
    const bar = document.getElementById('law-bar'); if (bar) { bar.style.display = 'flex'; bar.style.opacity = '1'; bar.style.transform = 'translateX(-50%)'; const g = this.gsap; if (g) g.from(bar, { y: 18, duration: 0.45, ease: 'power3.out' }); }
    const launch = document.getElementById('hud-launch'); if (launch) launch.style.display = 'none';
    this.restyleButtons();
    this.toast('PHYSICS ON — grab the letters, then bend the rules');
  }

  buildWalls() {
    const M = window.Matter; if (!this.engine) return;
    if (this.walls) this.walls.forEach((w) => M.World.remove(this.world, w));
    const w = window.innerWidth, h = window.innerHeight, t = 240;
    const opt = { isStatic: true, restitution: this.laws.restitution, friction: this.laws.friction };
    this.walls = [
      M.Bodies.rectangle(w / 2, -t / 2, w + 2 * t, t, opt),
      M.Bodies.rectangle(w / 2, h + t / 2, w + 2 * t, t, opt),
      M.Bodies.rectangle(-t / 2, h / 2, t, h + 2 * t, opt),
      M.Bodies.rectangle(w + t / 2, h / 2, t, h + 2 * t, opt),
    ];
    M.World.add(this.world, this.walls);
  }

  startPhysLoop() {
    const M = window.Matter;
    this._buf = [];
    const tick = () => {
      this._physRaf = requestAnimationFrame(tick);
      if (!this.engine) return;
      const L = this.laws;
      // ease every law toward its target — nothing ever snaps
      L.gScale += (L.gScaleT - L.gScale) * 0.06;
      L.gx += (L.gxT - L.gx) * 0.06;
      L.gy += (L.gyT - L.gy) * 0.06;
      L.timeScale += (L.timeScaleT - L.timeScale) * 0.05;
      L.friction += (L.frictionT - L.friction) * 0.08;
      L.restitution += (L.restitutionT - L.restitution) * 0.08;
      L.airDrag += (L.airDragT - L.airDrag) * 0.08;
      this.engine.gravity.x = L.gx; this.engine.gravity.y = L.gy; this.engine.gravity.scale = L.gScale;
      this.engine.timing.timeScale = Math.max(0.02, L.timeScale);
      for (let i = 0; i < this.bodies.length; i++) { const b = this.bodies[i]; if (b.consumed) continue; const bd = b.body; bd.friction = L.friction; bd.frictionStatic = L.friction * 1.6; bd.restitution = L.restitution; bd.frictionAir = (L.preset === 'zerog') ? 0.004 : L.airDrag; }

      if (L.resetting) { this.renderClones(); return; }
      if (L.timeState === 'freeze') { this.bodies.forEach((b) => { if (b.consumed) return; M.Body.setVelocity(b.body, { x: 0, y: 0 }); M.Body.setAngularVelocity(b.body, 0); }); this.renderClones(); return; }
      if (L.timeState === 'rewind') { this.playRewind(); this.renderClones(); return; }

      if (L.blackHole) this.applyBlackHoleForces();
      if (L.preset === 'zerog' && !L.blackHole) this.applyZeroGDrift();
      M.Engine.update(this.engine, 1000 / 60);
      this.recordFrame();
      this.renderClones();
    };
    tick();
  }

  renderClones() {
    for (let i = 0; i < this.bodies.length; i++) {
      const b = this.bodies[i]; if (b.consumed) continue;
      const p = b.body.position, a = b.body.angle;
      let tf = 'translate(' + (p.x - b.w / 2) + 'px,' + (p.y - b.h / 2) + 'px) rotate(' + a + 'rad)';
      if (b.stretch) tf += ' scale(' + b.stretch.sx.toFixed(3) + ',' + b.stretch.sy.toFixed(3) + ')';
      b.clone.style.transform = tf;
    }
  }

  recordFrame() {
    if (!this._buf) this._buf = [];
    const snap = this.bodies.map((b) => ({ x: b.body.position.x, y: b.body.position.y, a: b.body.angle }));
    this._buf.push(snap);
    if (this._buf.length > 240) this._buf.shift();
  }

  playRewind() {
    const M = window.Matter; const buf = this._buf;
    if (!buf || !buf.length) { this.laws.timeState = 'live'; this.setTimeLabel('Time'); this.restyleButtons(); this.toast('REWIND DONE — live, 1×'); return; }
    if (this._rewindIdx == null) this._rewindIdx = buf.length - 1;
    const frame = buf[Math.max(0, this._rewindIdx)];
    for (let i = 0; i < frame.length; i++) { const b = this.bodies[i]; if (!b || b.consumed) continue; M.Body.setPosition(b.body, { x: frame[i].x, y: frame[i].y }); M.Body.setAngle(b.body, frame[i].a); M.Body.setVelocity(b.body, { x: 0, y: 0 }); M.Body.setAngularVelocity(b.body, 0); }
    this._rewindIdx -= 2;
    if (this._rewindIdx < 0) { this._rewindIdx = null; this.laws.timeState = 'live'; this._buf = []; this.setTimeLabel('Time'); this.restyleButtons(); this.toast('REWIND DONE — live, 1×'); }
  }

  applyZeroGDrift() {
    const M = window.Matter; if (!this.mouseObj) return; const mp = this.mouseObj.position; if (!mp) return;
    this.bodies.forEach((b) => { if (b.consumed) return; const p = b.body.position; const dx = p.x - mp.x, dy = p.y - mp.y; const d = Math.hypot(dx, dy); if (d < 150 && d > 0.5) { const f = 0.0011 * b.body.mass * (1 - d / 150); M.Body.applyForce(b.body, p, { x: dx / d * f, y: dy / d * f }); } });
  }

  applyBlackHoleForces() {
    const M = window.Matter; const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    this.bodies.forEach((b) => {
      if (b.consumed) return;
      const p = b.body.position; const dx = cx - p.x, dy = cy - p.y;
      const dist = Math.max(22, Math.hypot(dx, dy)); const ux = dx / dist, uy = dy / dist;
      let accel = 220 / (dist * dist); accel = Math.min(accel, 0.014);
      const f = accel * b.body.mass;
      M.Body.applyForce(b.body, p, { x: ux * f - uy * f * 0.55, y: uy * f + ux * f * 0.55 });
      M.Body.setAngularVelocity(b.body, b.body.angularVelocity + 0.02);
      if (dist < 230) { const k = 1 - dist / 230; b.stretch = { sx: 1 + k * 1.7, sy: Math.max(0.18, 1 - k * 0.72) }; } else b.stretch = null;
      if (dist <= 34) this.consume(b, cx, cy);
    });
  }

  routeLaw(law, btn) {
    if (!this.engine) return;
    if (this.worldPhase !== 'idle') return; // locked during swallow / THE END / revive
    if (btn) this.pressBtn(btn);
    if (['earth', 'zerog', 'mars', 'moon', 'jupiter'].indexOf(law) >= 0) return this.applyGravityPreset(law);
    if (law === 'slowmo') return this.toggleSlowmo();
    if (law === 'blackhole') return this.handleBlackHole();
    if (law === 'time') return this.cycleTime();
    if (law === 'bigbang') return this.bigBang();
    if (law === 'reset') return this.resetUniverse();
  }

  applyGravityPreset(name) {
    const p = this.PRESETS[name]; if (!p) return; const L = this.laws;
    if (L.blackHole) { this.removeBlackHoleEl(); L.blackHole = false; this.setBhLabel('Black Hole'); }
    L.preset = name;
    L.gScaleT = p.gScale; L.gyT = p.gy; L.gxT = p.gx; L.frictionT = p.fr; L.restitutionT = p.rest; L.airDragT = p.air;
    this.wake();
    if (name === 'zerog') this.zeroGKick();
    this.toast(p.cap); this.restyleButtons();
  }

  toggleSlowmo() {
    const L = this.laws; L.slowmo = !L.slowmo;
    if (L.slowmo) { L.timeState = 'live'; this.setTimeLabel('Time'); L.timeScaleT = 0.22; this.timePulse(); this.toast('BULLET TIME — 0.2× speed'); }
    else { L.timeScaleT = 1; this.toast('NORMAL SPEED — 1×'); }
    this.wake(); this.restyleButtons();
  }

  // First tap forms the singularity; a second tap escalates to the full-page swallow.
  handleBlackHole() {
    const L = this.laws;
    if (L.blackHole) return this.swallowUniverse();
    L.blackHole = true; L.preset = 'blackhole';
    L.gScaleT = 0; L.gxT = 0; L.gyT = 0; L.airDragT = 0.012;
    this.spawnBlackHole(); this.wake();
    this.setBhLabel('Collapse');
    this.toast('SINGULARITY FORMING — tap again to collapse everything'); this.restyleButtons();
  }

  spawnBlackHole() {
    const layer = document.getElementById('phys-layer'); if (!layer) return;
    let bh = document.getElementById('black-hole');
    if (!bh) {
      bh = document.createElement('div'); bh.id = 'black-hole';
      bh.style.cssText = 'position:absolute;left:50%;top:50%;width:210px;height:210px;margin:-105px 0 0 -105px;pointer-events:none;z-index:3;';
      bh.innerHTML = '<div data-bh-disk style="position:absolute;inset:0;border-radius:50%;background:conic-gradient(from 0deg,#22D3EE,#8B5CF6,#A78BFA,#22D3EE);filter:blur(7px);opacity:0;animation:spin 3.4s linear infinite;"></div>'
        + '<div data-bh-ring style="position:absolute;inset:20%;border-radius:50%;border:1px solid rgba(167,139,250,0.45);"></div>'
        + '<div data-bh-core style="position:absolute;inset:33%;border-radius:50%;background:#04040a;box-shadow:0 0 60px 14px rgba(34,211,238,0.45),inset 0 0 26px rgba(0,0,0,1);"></div>';
      layer.appendChild(bh);
    }
    const g = this.gsap;
    if (g) { g.fromTo(bh, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.7, ease: 'back.out(1.6)' }); const disk = bh.querySelector('[data-bh-disk]'); if (disk) g.to(disk, { opacity: 0.55, duration: 0.9 }); }
    this.bhEl = bh;
  }

  removeBlackHoleEl() { const bh = document.getElementById('black-hole'); if (bh) bh.remove(); this.bhEl = null; }
  setBhLabel(text) { const el = document.querySelector('[data-bh-label]'); if (el) el.textContent = text; }

  consume(b, cx, cy) {
    if (b.consumed) return; const M = window.Matter; b.consumed = true; b.stretch = null;
    try { M.World.remove(this.world, b.body); } catch (e) {}
    const g = this.gsap;
    if (g) g.to(b.clone, { opacity: 0, duration: 0.22, ease: 'power2.in', onComplete: () => { b.clone.style.visibility = 'hidden'; } });
    else b.clone.style.visibility = 'hidden';
    this.burst(cx, cy); if (this.laws.sound) this.blip(0.5);
  }

  burst(x, y) {
    const layer = document.getElementById('phys-layer'); if (!layer) return; const g = this.gsap;
    for (let i = 0; i < 10; i++) {
      const d = document.createElement('div'); const ang = Math.random() * Math.PI * 2; const dist = 28 + Math.random() * 64;
      d.style.cssText = 'position:absolute;left:' + x + 'px;top:' + y + 'px;width:6px;height:6px;margin:-3px 0 0 -3px;border-radius:50%;background:' + (i % 2 ? '#22D3EE' : '#A78BFA') + ';pointer-events:none;';
      layer.appendChild(d);
      if (g) g.fromTo(d, { x: 0, y: 0, opacity: 1 }, { x: Math.cos(ang) * dist, y: Math.sin(ang) * dist, opacity: 0, duration: 0.6, ease: 'power2.out', onComplete: () => d.remove() });
      else setTimeout(() => d.remove(), 600);
    }
  }

  cycleTime() {
    const L = this.laws; const order = ['freeze', 'rewind', 'ff', 'live'];
    const idx = order.indexOf(L.timeState); const next = order[(idx + 1) % order.length];
    L.timeState = next; L.slowmo = false;
    if (next === 'freeze') { this.timePulse(); this.setTimeLabel('Frozen'); this.toast('TIME FROZEN — tap to rewind'); }
    else if (next === 'rewind') { this._rewindIdx = this._buf ? this._buf.length - 1 : 0; this.setTimeLabel('Rewind'); this.toast('REWINDING — tap to fast-forward'); }
    else if (next === 'ff') { L.timeScaleT = 2.4; this.wake(); this.setTimeLabel('Fast'); this.toast('FAST-FORWARD — ~3×'); }
    else { L.timeScaleT = 1; this.wake(); this.setTimeLabel('Time'); this.toast('RESUME — live, 1×'); }
    this.restyleButtons();
  }

  setTimeLabel(text) { const el = document.querySelector('[data-time-label]'); if (el) el.textContent = text; }

  timePulse() {
    const g = this.gsap;
    const f = document.createElement('div');
    f.style.cssText = 'position:fixed;inset:0;z-index:64;pointer-events:none;background:radial-gradient(circle at 50% 50%, rgba(34,211,238,0.18), transparent 60%);opacity:0;mix-blend-mode:screen;';
    document.body.appendChild(f);
    if (g) g.fromTo(f, { opacity: 0 }, { opacity: 1, duration: 0.18, yoyo: true, repeat: 1, ease: 'power2.inOut', onComplete: () => f.remove() });
    else setTimeout(() => f.remove(), 420);
  }

  zeroGKick() {
    const M = window.Matter;
    this.bodies.forEach((b) => { if (b.consumed) return; M.Sleeping.set(b.body, false); M.Body.applyForce(b.body, b.body.position, { x: (Math.random() - 0.5) * 0.013 * b.body.mass, y: (Math.random() - 0.5) * 0.013 * b.body.mass }); M.Body.setAngularVelocity(b.body, (Math.random() - 0.5) * 0.2); });
  }

  wake() { const M = window.Matter; (this.bodies || []).forEach((b) => { if (!b.consumed) M.Sleeping.set(b.body, false); }); }

  bigBang() {
    if (!this.engine) return; const M = window.Matter;
    const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    this.bodies.forEach((b) => { if (b.consumed) return; M.Sleeping.set(b.body, false); const dx = b.body.position.x - cx, dy = b.body.position.y - cy; const d = Math.max(36, Math.hypot(dx, dy)); const f = 0.06 * b.body.mass; M.Body.applyForce(b.body, b.body.position, { x: dx / d * f, y: dy / d * f }); M.Body.setAngularVelocity(b.body, (Math.random() - 0.5) * 0.6); });
    this.burst(cx, cy); if (this.laws.sound) this.blip(0.85); this.toast('BIG BANG — everything scatters');
  }

  resetUniverse() {
    if (!this.engine) return; const M = window.Matter; const g = this.gsap; const L = this.laws;
    this.removeBlackHoleEl(); this.setBhLabel('Black Hole');
    L.blackHole = false; L.slowmo = false; L.timeState = 'live'; L.preset = 'earth'; L.timeScaleT = 1;
    const p = this.PRESETS.earth; L.gScaleT = p.gScale; L.gyT = p.gy; L.gxT = p.gx; L.frictionT = p.fr; L.restitutionT = p.rest; L.airDragT = p.air;
    this._buf = []; this.setTimeLabel('Time');
    const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    let pending = 0; L.resetting = true;
    this.bodies.forEach((b, i) => {
      if (b.consumed) { b.consumed = false; try { M.World.add(this.world, b.body); } catch (e) {} b.clone.style.visibility = 'visible'; M.Body.setPosition(b.body, { x: cx, y: cy }); }
      b.stretch = null; b.clone.style.opacity = '1';
      M.Sleeping.set(b.body, false); M.Body.setVelocity(b.body, { x: 0, y: 0 }); M.Body.setAngularVelocity(b.body, 0);
      if (g) {
        pending++;
        const o = { x: b.body.position.x, y: b.body.position.y, a: b.body.angle };
        g.to(o, { x: b.rest.x, y: b.rest.y, a: 0, duration: 1.0, delay: i * 0.012, ease: 'elastic.out(1,0.6)',
          onUpdate: () => { M.Body.setPosition(b.body, { x: o.x, y: o.y }); M.Body.setAngle(b.body, o.a); M.Body.setVelocity(b.body, { x: 0, y: 0 }); b.clone.style.transform = 'translate(' + (o.x - b.w / 2) + 'px,' + (o.y - b.h / 2) + 'px) rotate(' + o.a + 'rad)'; },
          onComplete: () => { pending--; if (pending <= 0) L.resetting = false; } });
      } else { M.Body.setPosition(b.body, b.rest); M.Body.setAngle(b.body, 0); L.resetting = false; }
    });
    if (pending === 0) L.resetting = false;
    this.toast('UNIVERSE RESET — Earth restored'); this.restyleButtons();
  }

  exitPhysics() {
    if (!this.laws || !this.laws.enabled) return; const M = window.Matter;
    if (this._physRaf) cancelAnimationFrame(this._physRaf);
    this.removeBlackHoleEl();
    try { if (this.mouseObj) M.Mouse.clearSourceEvents(this.mouseObj); } catch (e) {}
    try { if (this.engine) { M.Events.off(this.engine); M.World.clear(this.world, false); M.Engine.clear(this.engine); } } catch (e) {}
    this.engine = null; this.world = null; this.bodies = []; this.walls = null; this._buf = [];
    const layer = document.getElementById('phys-layer'); if (layer) layer.innerHTML = '';
    (this._letters || []).forEach((el) => { el.style.visibility = ''; });
    document.querySelectorAll('[data-phys-chip]').forEach((el) => { el.style.visibility = ''; });
    this.laws.enabled = false; this.laws.blackHole = false; this.laws.slowmo = false; this.laws.timeState = 'live'; this.laws.preset = 'earth';
    this.setTimeLabel('Time'); this.setBhLabel('Black Hole');
    const bar = document.getElementById('law-bar');
    if (bar) { bar.style.transition = 'opacity .25s ease'; bar.style.opacity = '0'; setTimeout(() => { bar.style.display = 'none'; bar.style.opacity = '1'; bar.style.transition = ''; bar.style.transform = 'translateX(-50%)'; }, 270); }
    this._hudPos = { x: 0, y: 0 };
    const toast = document.getElementById('law-toast'); if (toast) toast.style.opacity = '0';
    const launch = document.getElementById('hud-launch'); if (launch) { launch.style.display = 'inline-flex'; launch.style.opacity = '1'; }
  }

  onCollide(ev) {
    const L = this.laws;
    ev.pairs.forEach((p) => {
      const va = p.bodyA.velocity, vb = p.bodyB.velocity;
      const rel = Math.hypot(va.x - vb.x, va.y - vb.y);
      if (rel > 4.2) { if (L.sound) this.blip(Math.min(1, rel / 18)); if (p.collision && p.collision.supports && p.collision.supports[0]) this.spark(p.collision.supports[0]); }
    });
  }

  spark(pt) {
    const layer = document.getElementById('phys-layer'); if (!layer) return;
    const s = document.createElement('div');
    s.style.cssText = 'position:absolute;left:0;top:0;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;background:radial-gradient(circle,#fff,rgba(34,211,238,0.6),transparent 70%);transform:translate(' + pt.x + 'px,' + pt.y + 'px) scale(0.4);opacity:0.9;pointer-events:none;';
    layer.appendChild(s);
    const g = this.gsap;
    if (g) g.to(s, { opacity: 0, scale: 1.7, duration: 0.4, ease: 'power2.out', onComplete: () => s.remove() });
    else setTimeout(() => s.remove(), 420);
  }

  blip(vol) {
    try {
      if (!this.laws.sound) return;
      if (!this._ac) this._ac = new (window.AudioContext || window.webkitAudioContext)();
      const ac = this._ac; if (ac.state === 'suspended') ac.resume();
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'triangle'; o.frequency.value = 120 + Math.random() * 130;
      o.connect(g); g.connect(ac.destination);
      const t = ac.currentTime;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol * 0.07), t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
      o.start(t); o.stop(t + 0.14);
    } catch (e) {}
  }

  toast(text) {
    const t = document.getElementById('law-toast'); if (!t) return; t.textContent = text; const g = this.gsap;
    if (g) { g.killTweensOf(t); g.fromTo(t, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' }); g.to(t, { opacity: 0, duration: 0.4, delay: 1.8, ease: 'power2.in' }); }
    else { t.style.opacity = '1'; clearTimeout(this._toastT); this._toastT = setTimeout(() => { t.style.opacity = '0'; }, 2100); }
  }

  pressBtn(btn) {
    const g = this.gsap;
    if (g) g.fromTo(btn, { scale: 0.94 }, { scale: 1, duration: 0.5, ease: 'elastic.out(1,0.5)' });
    const r = document.createElement('span');
    r.style.cssText = 'position:absolute;left:50%;top:50%;width:10px;height:10px;border-radius:50%;background:rgba(255,255,255,0.4);transform:translate(-50%,-50%);pointer-events:none;';
    btn.appendChild(r);
    if (g) g.fromTo(r, { scale: 0, opacity: 0.6 }, { scale: 13, opacity: 0, duration: 0.6, ease: 'power2.out', onComplete: () => r.remove() });
    else setTimeout(() => r.remove(), 600);
  }

  restyleButtons() {
    const L = this.laws; if (!L) return;
    document.querySelectorAll('[data-law-btn]').forEach((btn) => {
      const law = btn.getAttribute('data-law-btn'); if (law === 'reset') return; let active = false;
      if (['earth', 'zerog', 'mars', 'moon', 'jupiter'].indexOf(law) >= 0) active = (L.preset === law && !L.blackHole);
      else if (law === 'slowmo') active = L.slowmo;
      else if (law === 'blackhole') active = L.blackHole;
      else if (law === 'time') active = (L.timeState !== 'live');
      this.styleBtn(btn, active);
    });
  }

  styleBtn(btn, active) {
    if (active) { btn.style.borderColor = 'var(--accent)'; btn.style.background = 'rgba(139,92,246,0.2)'; btn.style.color = '#fff'; btn.style.animation = 'pulseRing 2s ease-in-out infinite'; }
    else { btn.style.borderColor = 'var(--line)'; btn.style.background = 'rgba(255,255,255,0.04)'; btn.style.color = '#c9ccd8'; btn.style.animation = 'none'; btn.style.boxShadow = 'none'; }
  }

  /* =====================================================================
     BLACK HOLE SWALLOWS THE WHOLE WEBSITE -> THE END -> REVIVE
     One GSAP master timeline animates the DOM root + canvas + iris mask
     toward the singularity. REVIVE simply reverses it for a perfect undo.
     ===================================================================== */
  swallowUniverse() {
    if (this.worldPhase !== 'idle') return;
    this.worldPhase = 'swallowing';
    // snapshot state we must restore on revive
    this._savedScroll = window.scrollY || window.pageYOffset || 0;
    try { history.pushState({ universe: 'swallow' }, ''); } catch (e) {}
    this.lockLawBar(true);
    this.toast('SINGULARITY FORMING… run.');

    const g = this.gsap;
    const fx = document.getElementById('swallow-fx');
    if (!g) { this.showTheEnd(); return; }

    const tl = this.buildSwallowTimeline();
    this._swallowTl = tl;
    tl.play();
  }

  buildSwallowTimeline() {
    const g = this.gsap;
    const root = document.getElementById('universe-root');
    const fx = document.getElementById('swallow-fx');
    const swirl = document.getElementById('swallow-swirl');
    const iris = document.getElementById('swallow-iris');
    const ring = document.getElementById('swallow-ring');
    const mount = document.getElementById('gl-mount');
    const fb = document.getElementById('gl-fallback');
    const bar = document.getElementById('law-bar');

    g.set(root, { transformOrigin: '50% 50%' });
    g.set(iris, { '--iris': '140%' });
    g.set(fx, { opacity: 0 });

    const tl = g.timeline({ paused: true,
      onComplete: () => this.onSwallowComplete(),
      onReverseComplete: () => this.onReviveComplete(),
    });

    if (this.prefersReduced) {
      // gentle, non-violent collapse for reduced-motion users
      tl.to(fx, { opacity: 1, duration: 0.6, ease: 'power1.inOut' }, 0)
        .to(iris, { '--iris': '0%', duration: 0.6, ease: 'power1.inOut' }, 0)
        .to(root, { opacity: 0, duration: 0.6, ease: 'power1.inOut' }, 0);
      return tl;
    }

    // 1 — singularity forms (0–0.8s)
    tl.to(fx, { opacity: 1, duration: 0.8, ease: 'power1.in' }, 0)
      .fromTo(swirl, { rotate: 0, scale: 1 }, { rotate: 460, scale: 1.25, duration: 4.2, ease: 'power3.in' }, 0)
    // 2 — intake (0.6–2.2s): rotate + scale down + drift + blur, iris closing
      .to(root, { scale: 0.34, rotate: 20, filter: 'blur(6px)', duration: 1.7, ease: 'power2.in' }, 0.6)
      .to([mount, fb], { scale: 0.55, opacity: 0.45, duration: 1.7, ease: 'power2.in' }, 0.6)
      .to(bar, { opacity: 0, y: 30, scale: 0.6, duration: 0.6, ease: 'power2.in' }, 0.6)
      .to(iris, { '--iris': '56%', duration: 1.5, ease: 'power1.in' }, 0.8)
    // 3 — collapse (2.2–3.4s): rush the final stretch to a point
      .to(root, { scale: 0.02, rotate: 96, filter: 'blur(20px)', opacity: 0, duration: 1.15, ease: 'power3.in' }, 2.2)
      .to([mount, fb], { scale: 0.04, opacity: 0, duration: 1.15, ease: 'power3.in' }, 2.2)
      .to(iris, { '--iris': '0%', duration: 1.0, ease: 'power3.in' }, 2.45)
    // gravitational flash / Einstein ring as the last of the site disappears
      .fromTo(ring, { opacity: 0, scale: 0, boxShadow: '0 0 0 0 rgba(255,255,255,0)' },
        { opacity: 1, scale: 70, boxShadow: '0 0 50px 16px rgba(255,255,255,0.9)', duration: 0.5, ease: 'power2.out' }, 3.05)
      .to(ring, { opacity: 0, duration: 0.45, ease: 'power2.in' }, 3.55);
    return tl;
  }

  onSwallowComplete() {
    this.worldPhase = 'ended';
    this.showTheEnd();
  }

  showTheEnd() {
    const g = this.gsap;
    const end = document.getElementById('the-end');
    const title = document.getElementById('the-end-title');
    const btn = document.getElementById('revive-btn');
    const hint = document.getElementById('the-end-hint');
    const grain = document.getElementById('the-end-grain');
    if (grain && !grain.style.backgroundImage) {
      const svg = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E";
      grain.style.backgroundImage = 'url("' + svg + '")';
      if (!this.prefersReduced) grain.style.animation = 'grain 8s steps(10) infinite, flicker 6s steps(12) infinite';
    }
    if (!end) return;
    end.style.display = 'flex';
    this.worldPhase = 'ended';
    if (!g) {
      title.style.opacity = '1'; btn.style.display = 'inline-flex'; hint.style.opacity = '1'; btn.focus();
      return;
    }
    // fade in THE END, let it land, then reveal REVIVE
    g.fromTo(title, { opacity: 0, letterSpacing: '0.28em', scale: 1.04 }, { opacity: 1, letterSpacing: '0.08em', scale: 1, duration: 1.1, ease: 'power2.out' });
    g.set(btn, { display: 'inline-flex', opacity: 0, y: 14 });
    g.to(btn, { opacity: 1, y: 0, duration: 0.7, delay: 1.5, ease: 'power3.out', onComplete: () => { btn.style.animation = 'revivePulse 2.4s ease-in-out infinite'; try { btn.focus(); } catch (e) {} } });
    g.to(hint, { opacity: 1, duration: 0.6, delay: 1.9, ease: 'power2.out' });
  }

  revive() {
    if (this.worldPhase !== 'ended' && this.worldPhase !== 'swallowing') return;
    this.worldPhase = 'reviving';
    const g = this.gsap;
    const end = document.getElementById('the-end');
    const title = document.getElementById('the-end-title');
    const btn = document.getElementById('revive-btn');
    const hint = document.getElementById('the-end-hint');
    if (btn) btn.style.animation = 'none';
    this.toast('REVIVING UNIVERSE…');

    const reverseNow = () => { if (this._swallowTl) this._swallowTl.reverse(); else this.onReviveComplete(); };
    if (g && end) {
      g.to([title, hint, btn], { opacity: 0, duration: 0.4, ease: 'power2.in' });
      g.to(end, { opacity: 0, duration: 0.5, ease: 'power2.in', onComplete: () => { end.style.display = 'none'; end.style.opacity = '1'; reverseNow(); } });
    } else {
      if (end) end.style.display = 'none';
      reverseNow();
    }
  }

  onReviveComplete() {
    const g = this.gsap;
    const root = document.getElementById('universe-root');
    const fx = document.getElementById('swallow-fx');
    // clear any residual transforms from the timeline so layout is pixel-identical
    if (g) { g.set(root, { clearProps: 'transform,filter,opacity' }); g.set(fx, { opacity: 0 }); }
    // bodies respawn + spiral back to their resting positions; Earth gravity restored
    try { this.resetUniverse(); } catch (e) {}
    this.lockLawBar(false);
    // restore scroll exactly where the user left off
    const y = this._savedScroll || 0;
    if (this.lenis) { try { this.lenis.scrollTo(y, { immediate: true }); } catch (e) { window.scrollTo(0, y); } }
    else window.scrollTo(0, y);
    this.worldPhase = 'idle';
  }

  lockLawBar(locked) {
    const bar = document.getElementById('law-bar'); if (!bar) return;
    bar.querySelectorAll('[data-law-btn]').forEach((b) => {
      if (b.getAttribute('data-law-btn') === 'reset') return;
      b.style.pointerEvents = locked ? 'none' : '';
      b.style.opacity = locked ? '0.4' : '';
    });
  }

  /* ---------------- helpers ---------------- */
  hasWebGL() {
    try {
      const c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) { return false; }
  }

  waitForDeps() {
    return new Promise((resolve) => {
      const t0 = Date.now();
      const need = () => window.gsap && window.ScrollTrigger
        && (!this.use3D || window.THREE) && (!this.useLenis || window.Lenis);
      const tick = () => {
        if (need()) return resolve(true);
        if (Date.now() - t0 > 5000) return resolve(false);
        setTimeout(tick, 80);
      };
      tick();
    });
  }

  scrollToId(id) {
    const el = document.getElementById(id);
    if (!el) return;
    if (this.lenis) this.lenis.scrollTo(el, { offset: 0, duration: 1.4 });
    else window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY, behavior: this.prefersReduced ? 'auto' : 'smooth' });
  }

  initGrain() {
    const grain = document.getElementById('grain');
    if (!grain) return;
    const svg = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E";
    grain.style.backgroundImage = 'url("' + svg + '")';
    if (this.prefersReduced) grain.style.animation = 'none';
  }

  /* ---------------- boot ---------------- */
  boot() {
    if (window.gsap && window.ScrollTrigger) {
      this.gsap = window.gsap; this.ST = window.ScrollTrigger;
      this.gsap.registerPlugin(this.ST);
    }
    if (this.useCursor) this.initCursor();
    if (this.useLenis && window.Lenis && this.gsap) this.initLenis();
    if (this.use3D && window.THREE) {
      try { this.initThree(); } catch (e) { console.warn('3D init failed', e); this.use3D = false; this.showFallback(); }
    } else {
      this.showFallback();
    }
    this.initReveals();
    this.initTilt();
    this.initCounters();
    this.bindMouse();
    this._onResize = () => this.onResize();
    window.addEventListener('resize', this._onResize);
    this.initHudDrag();
    this.applyTweaks();
    this.finishPreloader();
  }

  showFallback() {
    const f = document.getElementById('gl-fallback'); if (f) f.style.display = 'block';
    const m = document.getElementById('gl-mount'); if (m) m.style.display = 'none';
    if (this.prefersReduced && f) f.querySelectorAll('*').forEach((e) => { e.style.animation = 'none'; });
  }
  hideFallback() {
    const f = document.getElementById('gl-fallback'); if (f) f.style.display = 'none';
  }

  /* ---------------- preloader ---------------- */
  startPreloader() {
    const cEl = document.getElementById('pre-count');
    const bar = document.getElementById('pre-bar');
    this._pre = { v: 0, target: 90, done: false };
    const step = () => {
      this._pre.v += (this._pre.target - this._pre.v) * 0.05 + 0.25;
      if (this._pre.v > this._pre.target) this._pre.v = this._pre.target;
      if (cEl) cEl.textContent = String(Math.floor(this._pre.v)).padStart(2, '0');
      if (bar) bar.style.transform = 'scaleX(' + (this._pre.v / 100) + ')';
      if (!this._pre.done) this._preRaf = requestAnimationFrame(step);
    };
    step();
  }

  finishPreloader() {
    if (!this._pre) return;
    this._pre.done = true;
    if (this._preRaf) cancelAnimationFrame(this._preRaf);
    const cEl = document.getElementById('pre-count');
    const bar = document.getElementById('pre-bar');
    const g = this.gsap;
    const finalize = () => this.revealHero();
    if (g) {
      const o = { v: this._pre.v };
      g.to(o, {
        v: 100, duration: 0.5, ease: 'power2.out',
        onUpdate: () => { if (cEl) cEl.textContent = String(Math.floor(o.v)).padStart(2, '0'); if (bar) bar.style.transform = 'scaleX(' + (o.v / 100) + ')'; },
        onComplete: () => {
          const tl = g.timeline({ onComplete: finalize });
          tl.to('#pre-center', { opacity: 0, y: -20, duration: 0.5, ease: 'power2.out' }, 0)
            .to('#pre-top', { yPercent: -100, duration: 0.95, ease: 'expo.inOut' }, 0.2)
            .to('#pre-bottom', { yPercent: 100, duration: 0.95, ease: 'expo.inOut' }, 0.2)
            .set('#preloader', { display: 'none' });
        }
      });
    } else {
      if (cEl) cEl.textContent = '100';
      const pre = document.getElementById('preloader');
      if (pre) { pre.style.transition = 'opacity .6s'; pre.style.opacity = '0'; setTimeout(() => { pre.style.display = 'none'; }, 650); }
      finalize();
    }
    this._revealSafety = setTimeout(() => { const pre = document.getElementById('preloader'); if (pre && pre.style.display !== 'none') this.hardReveal(); }, 2200);
  }

  hardReveal() {
    if (this._hardRevealed) return; this._hardRevealed = true;
    const pre = document.getElementById('preloader'); if (pre) pre.style.display = 'none';
    this.active = true;
    try { this.ensureSplit(); } catch (e) {}
    document.querySelectorAll('#hero-name [data-name-line] span').forEach((s) => { s.style.opacity = '1'; s.style.transform = 'none'; });
    ['#nav', '#hero-kicker', '#hero-name', '#hero-tag', '#hero-sub', '#hero-cta', '#hero-chips', '#scroll-ind'].forEach((sel) => { const e = document.querySelector(sel); if (e) { e.style.opacity = '1'; e.style.transform = 'none'; } });
  }

  splitName() {
    const lines = document.querySelectorAll('#hero-name [data-name-line]');
    const out = [];
    lines.forEach((line) => {
      const text = line.textContent; line.textContent = '';
      text.split('').forEach((ch) => {
        const s = document.createElement('span');
        s.textContent = ch === ' ' ? ' ' : ch;
        s.style.display = 'inline-block';
        s.style.willChange = 'transform';
        line.appendChild(s); out.push(s);
      });
    });
    return out;
  }

  revealHero() {
    this.active = true;
    if (this._hardRevealed) return;
    const g = this.gsap;
    if (!g || this.prefersReduced) {
      ['#nav', '#hero-kicker', '#hero-name', '#hero-tag', '#hero-sub', '#hero-cta', '#scroll-ind']
        .forEach((s) => { const e = document.querySelector(s); if (e) { e.style.opacity = '1'; e.style.transform = 'none'; } });
      return;
    }
    this.ensureSplit();
    const letters = this._letters;
    const tl = g.timeline();
    tl.from('#nav', { y: -30, opacity: 0, duration: 0.8, ease: 'power3.out' }, 0)
      .from('#hero-kicker', { y: 16, opacity: 0, duration: 0.7, ease: 'power3.out' }, 0.15)
      .from(letters, { yPercent: 120, opacity: 0, rotateZ: 6, duration: 1.0, stagger: 0.035, ease: 'expo.out' }, 0.2)
      .from('#hero-tag', { y: 24, opacity: 0, duration: 0.8, ease: 'power3.out' }, '-=0.5')
      .from('#hero-sub', { y: 20, opacity: 0, duration: 0.7, ease: 'power3.out' }, '-=0.5')
      .from('#hero-cta', { y: 20, opacity: 0, duration: 0.7, ease: 'power3.out' }, '-=0.5')
      .from('#scroll-ind', { opacity: 0, duration: 0.8 }, '-=0.3');
  }

  /* ---------------- cursor ---------------- */
  initCursor() {
    const dot = document.getElementById('cursor-dot');
    const ring = document.getElementById('cursor-ring');
    const ringI = document.getElementById('cursor-ring-i');
    if (!dot || !ring) return;
    document.documentElement.style.cursor = 'none';
    const g = this.gsap;
    dot.style.display = 'block'; ring.style.display = 'block';
    g.set([dot, ring], { x: window.innerWidth / 2, y: window.innerHeight / 2 });
    const dx = g.quickTo(dot, 'x', { duration: 0.12, ease: 'power3' });
    const dy = g.quickTo(dot, 'y', { duration: 0.12, ease: 'power3' });
    const rx = g.quickTo(ring, 'x', { duration: 0.4, ease: 'power3' });
    const ry = g.quickTo(ring, 'y', { duration: 0.4, ease: 'power3' });
    this._cursorMove = (e) => { dx(e.clientX); dy(e.clientY); rx(e.clientX); ry(e.clientY); };
    window.addEventListener('mousemove', this._cursorMove);
    document.querySelectorAll('a, button, [data-magnetic], [data-cursor]').forEach((el) => {
      el.addEventListener('mouseenter', () => { if (ringI) { ringI.style.transform = 'scale(1.9)'; ringI.style.borderColor = 'var(--accent)'; ringI.style.background = 'rgba(139,92,246,0.10)'; } });
      el.addEventListener('mouseleave', () => { if (ringI) { ringI.style.transform = 'scale(1)'; ringI.style.borderColor = 'rgba(255,255,255,0.6)'; ringI.style.background = 'transparent'; } });
    });
    this.initMagnetic();
  }

  initMagnetic() {
    const g = this.gsap;
    document.querySelectorAll('[data-magnetic]').forEach((el) => {
      const strength = parseFloat(el.getAttribute('data-magnetic')) || 0.35;
      const xTo = g.quickTo(el, 'x', { duration: 0.4, ease: 'power3' });
      const yTo = g.quickTo(el, 'y', { duration: 0.4, ease: 'power3' });
      el.addEventListener('mousemove', (e) => {
        const r = el.getBoundingClientRect();
        xTo((e.clientX - (r.left + r.width / 2)) * strength);
        yTo((e.clientY - (r.top + r.height / 2)) * strength);
      });
      el.addEventListener('mouseleave', () => { xTo(0); yTo(0); });
    });
  }

  /* ---------------- smooth scroll ---------------- */
  initLenis() {
    const Lenis = window.Lenis; const g = this.gsap;
    this.lenis = new Lenis({ duration: 1.1, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true });
    this.lenis.on('scroll', () => { if (this.ST) this.ST.update(); });
    g.ticker.add((time) => { this.lenis.raf(time * 1000); });
    g.ticker.lagSmoothing(0);
  }

  /* ---------------- reveals + parallax ---------------- */
  initReveals() {
    const dist = this.motion ? 34 : 0;
    this._reveals = [];
    document.querySelectorAll('[data-reveal]').forEach((el) => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(' + dist + 'px)';
      el.style.willChange = 'opacity, transform';
      this._reveals.push(el);
    });
    this._revealCheck = () => {
      const vh = window.innerHeight;
      for (let i = this._reveals.length - 1; i >= 0; i--) {
        const el = this._reveals[i];
        const r = el.getBoundingClientRect();
        if (r.top < vh * 0.92 && r.bottom > 0) {
          el.style.transition = 'opacity .8s cubic-bezier(.2,.8,.2,1), transform .8s cubic-bezier(.2,.8,.2,1)';
          el.style.opacity = '1'; el.style.transform = 'none';
          this._reveals.splice(i, 1);
        }
      }
    };
    this._revealOnScroll = () => this._revealCheck();
    window.addEventListener('scroll', this._revealOnScroll, { passive: true });
    window.addEventListener('resize', this._revealOnScroll);
    this._revealCheck();
  }

  /* ---------------- mouse ---------------- */
  bindMouse() {
    this._mm = (e) => {
      this.mouse.tx = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouse.ty = -((e.clientY / window.innerHeight) * 2 - 1);
      this._lastMove = Date.now();
    };
    window.addEventListener('mousemove', this._mm);
  }

  /* ---------------- three.js ---------------- */
  initThree() {
    const THREE = window.THREE;
    const mount = document.getElementById('gl-mount');
    const w = window.innerWidth, h = window.innerHeight;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h); renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%';
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a0a0f, 0.045);
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    camera.position.set(0, 0, 5.2);

    this.three = { THREE, renderer, scene, camera };
    this.camState = { px: 0, py: 0, pz: 5.2, tx: 0, ty: 0, tz: 0 };
    this.stations = [
      { p: [0, 0, 5.2], t: [0, 0, 0] },
      { p: [1.2, -7, 4.6], t: [0.4, -7, 0] },
      { p: [-1.4, -14, 4.9], t: [0, -14, 0] },
      { p: [1.4, -21, 4.9], t: [0, -21, 0] },
      { p: [-1.2, -28, 4.9], t: [0, -28, 0] },
      { p: [0, -35, 5.0], t: [0, -35, 0] },
    ];

    this.buildGlow(); this.buildSphere(); this.buildShell(); this.buildRings(); this.buildOrbiters(); this.buildTorus(); this.buildShards(); this.buildStars();
    this._sectionEls = ['home', 'about', 'skills', 'experience', 'projects', 'contact'].map((id) => document.getElementById(id)).filter(Boolean);
    this._clock = new THREE.Clock();
    this.hideFallback();
    document.addEventListener('visibilitychange', () => { this._hidden = document.hidden; });
    this.loop();
  }

  makeGlow(r, g, b) {
    const THREE = window.THREE;
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const ctx = c.getContext('2d');
    const grd = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',0.9)');
    grd.addColorStop(0.35, 'rgba(' + r + ',' + g + ',' + b + ',0.32)');
    grd.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0)');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }

  buildGlow() {
    const THREE = window.THREE; const s = this.three.scene;
    const mk = (tex, scale, pos, op) => {
      const m = new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true, opacity: op });
      const sp = new THREE.Sprite(m); sp.scale.set(scale, scale, 1); sp.position.set(pos[0], pos[1], pos[2]); s.add(sp); return sp;
    };
    this.glowV = mk(this.makeGlow(139, 92, 246), 8.5, [0.4, 0.2, -1.6], 0.9);
    this.glowC = mk(this.makeGlow(34, 211, 238), 6.0, [-0.9, -0.5, -1.2], 0.7);
  }

  buildSphere() {
    const THREE = window.THREE; const s = this.three.scene;
    const VERT = `
      uniform float uTime; uniform float uAmp; uniform float uFreq;
      varying float vNoise; varying vec3 vNormalW; varying vec3 vPosW;
      vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
      vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
      float snoise(vec3 v){
        const vec2 C = vec2(1.0/6.0, 1.0/3.0); const vec4 D = vec4(0.0,0.5,1.0,2.0);
        vec3 i  = floor(v + dot(v, C.yyy)); vec3 x0 = v - i + dot(i, C.xxx);
        vec3 g = step(x0.yzx, x0.xyz); vec3 l = 1.0 - g; vec3 i1 = min(g.xyz,l.zxy); vec3 i2 = max(g.xyz,l.zxy);
        vec3 x1 = x0 - i1 + C.xxx; vec3 x2 = x0 - i2 + C.yyy; vec3 x3 = x0 - D.yyy;
        i = mod(i,289.0);
        vec4 p = permute(permute(permute(i.z + vec4(0.0,i1.z,i2.z,1.0)) + i.y + vec4(0.0,i1.y,i2.y,1.0)) + i.x + vec4(0.0,i1.x,i2.x,1.0));
        float n_ = 1.0/7.0; vec3 ns = n_ * D.wyz - D.xzx;
        vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
        vec4 x_ = floor(j * ns.z); vec4 y_ = floor(j - 7.0 * x_);
        vec4 x = x_ * ns.x + ns.yyyy; vec4 y = y_ * ns.x + ns.yyyy; vec4 h = 1.0 - abs(x) - abs(y);
        vec4 b0 = vec4(x.xy,y.xy); vec4 b1 = vec4(x.zw,y.zw);
        vec4 s0 = floor(b0)*2.0+1.0; vec4 s1 = floor(b1)*2.0+1.0; vec4 sh = -step(h, vec4(0.0));
        vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy; vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
        vec3 p0 = vec3(a0.xy,h.x); vec3 p1 = vec3(a0.zw,h.y); vec3 p2 = vec3(a1.xy,h.z); vec3 p3 = vec3(a1.zw,h.w);
        vec4 norm = taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
        p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
        vec4 m = max(0.6 - vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)), 0.0); m = m*m;
        return 42.0 * dot(m*m, vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
      }
      void main(){
        float n = snoise(position*uFreq + vec3(0.0, uTime*0.3, 0.0));
        float n2 = snoise(position*(uFreq*2.1) + vec3(uTime*0.2));
        float disp = (n*0.7 + n2*0.3) * uAmp;
        vec3 pos = position + normal*disp;
        vNoise = n;
        vec4 wp = modelMatrix*vec4(pos,1.0); vPosW = wp.xyz;
        vNormalW = normalize(mat3(modelMatrix)*normal);
        gl_Position = projectionMatrix*viewMatrix*wp;
      }`;
    const FRAG = `
      uniform vec3 uColorA; uniform vec3 uColorB; uniform vec3 uBase; uniform float uFresnel;
      varying float vNoise; varying vec3 vNormalW; varying vec3 vPosW;
      void main(){
        vec3 V = normalize(cameraPosition - vPosW);
        float fres = pow(1.0 - clamp(dot(V, normalize(vNormalW)),0.0,1.0), uFresnel);
        float t = clamp(vNoise*0.5+0.5,0.0,1.0);
        vec3 accent = mix(uColorA, uColorB, t);
        vec3 col = mix(uBase, accent, fres);
        col += accent*fres*0.9;
        col += accent*pow(t,3.0)*0.18;
        gl_FragColor = vec4(col,1.0);
      }`;
    const geo = new THREE.SphereGeometry(1.3, 128, 128);
    this.sphereUniforms = {
      uTime: { value: 0 }, uAmp: { value: 0.18 }, uFreq: { value: 1.15 },
      uColorA: { value: new THREE.Color(0x8B5CF6) }, uColorB: { value: new THREE.Color(0x22D3EE) },
      uBase: { value: new THREE.Color(0x0a0a12) }, uFresnel: { value: 2.6 }
    };
    const mat = new THREE.ShaderMaterial({ uniforms: this.sphereUniforms, vertexShader: VERT, fragmentShader: FRAG });
    this.sphere = new THREE.Mesh(geo, mat);
    s.add(this.sphere);
  }

  buildTorus() {
    const THREE = window.THREE; const s = this.three.scene;
    const geo = new THREE.TorusKnotGeometry(0.85, 0.26, 170, 26, 2, 3);
    const mat = new THREE.MeshBasicMaterial({ color: 0x8B5CF6, wireframe: true, transparent: true, opacity: 0.55 });
    this.torus = new THREE.Mesh(geo, mat); this.torus.position.set(2.4, -7, 0); s.add(this.torus);
    const tg = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.makeGlow(34, 211, 238), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 }));
    tg.scale.set(5, 5, 1); tg.position.set(2.4, -7, -1); s.add(tg);
  }

  buildShards() {
    const THREE = window.THREE; const s = this.three.scene; this.shards = [];
    const geos = [new THREE.OctahedronGeometry(0.2), new THREE.TetrahedronGeometry(0.22), new THREE.IcosahedronGeometry(0.17), new THREE.DodecahedronGeometry(0.18), new THREE.TorusKnotGeometry(0.12, 0.045, 64, 8)];
    for (let i = 0; i < 11; i++) {
      const g = geos[i % geos.length];
      const m = new THREE.MeshBasicMaterial({ color: i % 2 ? 0x22D3EE : 0x8B5CF6, wireframe: true, transparent: true, opacity: 0.7 });
      const mesh = new THREE.Mesh(g, m);
      const ang = (i / 11) * Math.PI * 2; const rad = 2.1 + Math.random() * 1.7;
      mesh.position.set(Math.cos(ang) * rad, (Math.random() - 0.5) * 3.0, Math.sin(ang) * 1.8 - 0.5);
      mesh.userData = { sp: 0.3 + Math.random() * 0.5, ph: Math.random() * Math.PI * 2, baseY: mesh.position.y, rot: 0.2 + Math.random() * 0.5 };
      s.add(mesh); this.shards.push(mesh);
    }
  }

  buildStars() {
    const THREE = window.THREE; const s = this.three.scene;
    const N = 900; const pos = new Float32Array(N * 3); const col = new Float32Array(N * 3);
    const cV = new THREE.Color(0x8B5CF6), cC = new THREE.Color(0x22D3EE), cW = new THREE.Color(0xffffff);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 26;
      pos[i * 3 + 1] = 2 - Math.random() * 42;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 22 - 4;
      const r = Math.random(); const c = r < 0.5 ? cW : (r < 0.78 ? cV : cC);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.PointsMaterial({ size: 0.05, vertexColors: true, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true });
    this.stars = new THREE.Points(g, m); s.add(this.stars);
  }

  buildShell() {
    const THREE = window.THREE;
    const geo = new THREE.IcosahedronGeometry(1.85, 1);
    const mat = new THREE.MeshBasicMaterial({ color: 0x67E8F9, wireframe: true, transparent: true, opacity: 0.14 });
    this.shell = new THREE.Mesh(geo, mat); this.three.scene.add(this.shell);
  }

  buildRings() {
    const THREE = window.THREE; const s = this.three.scene; this.rings = [];
    const mk = (r, tube, col, rx, rz, op) => {
      const g = new THREE.TorusGeometry(r, tube, 16, 200);
      const m = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false });
      const mesh = new THREE.Mesh(g, m); mesh.rotation.x = rx; mesh.rotation.z = rz; s.add(mesh); this.rings.push(mesh);
    };
    mk(2.0, 0.013, 0x8B5CF6, Math.PI * 0.5, 0.32, 0.75);
    mk(2.32, 0.008, 0x22D3EE, Math.PI * 0.42, -0.5, 0.6);
  }

  buildOrbiters() {
    const THREE = window.THREE; const s = this.three.scene; this.orbiters = [];
    const texV = this.makeGlow(167, 139, 250), texC = this.makeGlow(103, 232, 238);
    for (let i = 0; i < 7; i++) {
      const tex = i % 2 ? texC : texV;
      const m = new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.95 });
      const sp = new THREE.Sprite(m); const sc = 0.22 + Math.random() * 0.22; sp.scale.set(sc, sc, 1);
      sp.userData = { r: 1.85 + Math.random() * 0.8, sp: 0.3 + Math.random() * 0.55, ph: Math.random() * Math.PI * 2, yr: (Math.random() - 0.5) * 1.5 };
      s.add(sp); this.orbiters.push(sp);
    }
  }

  loop() {
    this._raf = requestAnimationFrame(() => this.loop());
    if (this._hidden) return;
    const { renderer, scene, camera } = this.three;
    const t = this._clock.getElapsedTime();
    this.mouse.x += (this.mouse.tx - this.mouse.x) * 0.06;
    this.mouse.y += (this.mouse.ty - this.mouse.y) * 0.06;

    if (this.sphere) {
      this.sphereUniforms.uTime.value = this.motion ? t : t * 0.4;
      this.sphere.rotation.y += this.motion ? 0.0016 : 0.0007;
      if (this.motion) {
        this.sphere.rotation.x = this.mouse.y * 0.3;
        this.sphere.rotation.z = this.mouse.x * 0.15;
        const moved = (Date.now() - (this._lastMove || 0)) < 420;
        const targetAmp = (this._baseAmp || 0.18) + (moved ? 0.14 : 0);
        this.sphereUniforms.uAmp.value += (targetAmp - this.sphereUniforms.uAmp.value) * 0.05;
      } else {
        this.sphereUniforms.uAmp.value += ((this._baseAmp || 0.18) - this.sphereUniforms.uAmp.value) * 0.05;
      }
    }
    if (this.torus) { this.torus.rotation.x = t * 0.25; this.torus.rotation.y = t * 0.32; }
    if (this.shards) this.shards.forEach((m) => { const u = m.userData; m.position.y = u.baseY + Math.sin(t * u.sp + u.ph) * 0.35; m.rotation.x += 0.01 * u.rot; m.rotation.y += 0.012 * u.rot; });
    if (this.stars) this.stars.rotation.y += 0.0004;
    if (this.shell) { this.shell.rotation.y -= this.motion ? 0.0012 : 0.0005; this.shell.rotation.x += this.motion ? 0.0006 : 0.0003; }
    if (this.rings) this.rings.forEach((r, k) => { r.rotation.z += (this.motion ? 0.004 : 0.0018) * (k ? -1 : 1); });
    if (this.orbiters) this.orbiters.forEach((o) => { const u = o.userData; const a = (this.motion ? t : t * 0.5) * u.sp + u.ph; o.position.set(Math.cos(a) * u.r, u.yr + Math.sin(a * 1.3) * 0.32, Math.sin(a) * u.r * 0.8); });

    const vh = window.innerHeight;
    const probe = (window.scrollY || window.pageYOffset || 0) + vh * 0.5;
    const secs = this._sectionEls || [];
    let i = 0;
    for (let k = 0; k < secs.length; k++) {
      const top = secs[k].getBoundingClientRect().top + window.scrollY;
      if (probe >= top) i = k;
    }
    if (i > this.stations.length - 2) i = this.stations.length - 2;
    const curTop = secs[i] ? secs[i].getBoundingClientRect().top + window.scrollY : 0;
    const nxtTop = secs[i + 1] ? secs[i + 1].getBoundingClientRect().top + window.scrollY : curTop + vh;
    let f = (probe - curTop) / Math.max(1, nxtTop - curTop);
    f = Math.min(1, Math.max(0, f)); f = f * f * (3 - 2 * f);
    const a = this.stations[i], b = this.stations[i + 1];
    const lp = (x, y) => x + (y - x) * f;
    const mo = this.motion ? 1 : 0;
    const px = lp(a.p[0], b.p[0]) + this.mouse.x * 0.25 * mo;
    const py = lp(a.p[1], b.p[1]) + this.mouse.y * 0.18 * mo;
    const pz = lp(a.p[2], b.p[2]);
    const tx = lp(a.t[0], b.t[0]) + this.mouse.x * 0.15 * mo;
    const ty = lp(a.t[1], b.t[1]) + this.mouse.y * 0.1 * mo;
    const tz = lp(a.t[2], b.t[2]);
    this.camState.px += (px - this.camState.px) * 0.08;
    this.camState.py += (py - this.camState.py) * 0.08;
    this.camState.pz += (pz - this.camState.pz) * 0.08;
    this.camState.tx += (tx - this.camState.tx) * 0.08;
    this.camState.ty += (ty - this.camState.ty) * 0.08;
    this.camState.tz += (tz - this.camState.tz) * 0.08;
    camera.position.set(this.camState.px, this.camState.py, this.camState.pz);
    camera.lookAt(this.camState.tx, this.camState.ty, this.camState.tz);
    renderer.render(scene, camera);
  }

  onResize() {
    if (this.three) {
      const w = window.innerWidth, h = window.innerHeight;
      this.three.camera.aspect = w / h; this.three.camera.updateProjectionMatrix();
      this.three.renderer.setSize(w, h);
    }
    if (this.engine) this.buildWalls();
    if (this.ST) this.ST.refresh();
  }

  /* ---------------- tweaks ---------------- */
  applyTweaks() {
    const THREE = window.THREE;
    const mode = this.props.accentMode || 'Duotone';
    const map = { Violet: ['#8B5CF6', '#A78BFA'], Cyan: ['#22D3EE', '#67E8F9'], Duotone: ['#8B5CF6', '#22D3EE'] };
    const pair = map[mode] || map.Duotone;
    const a = pair[0], b = pair[1];
    const root = document.documentElement;
    root.style.setProperty('--accent', a);
    root.style.setProperty('--accent-2', b);
    root.style.setProperty('--accent-grad', 'linear-gradient(120deg,' + a + ' 0%,' + a + ' 35%,' + b + ' 100%)');
    if (this.sphereUniforms && THREE) {
      this.sphereUniforms.uColorA.value = new THREE.Color(a);
      this.sphereUniforms.uColorB.value = new THREE.Color(b);
    }
    const d = this.props.orbDistortion;
    if (typeof d === 'number') this._baseAmp = d;
    const grain = document.getElementById('grain');
    if (grain) grain.style.display = (this.props.grain === false) ? 'none' : 'block';
  }

  /* =====================================================================
     CONTENT SECTIONS — rendered from data.js (Skills / Experience /
     Projects / Achievements) plus the contact form behaviour.
     ===================================================================== */
  renderSections() {
    const P = window.PROFILE; if (!P) return;
    this.renderSkills(P.skills);
    this.renderExperience(P.experience);
    this.renderProjects(P.projects);
    this.renderAchievements(P.achievements, P.achievementNotes);
  }

  esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  renderSkills(groups) {
    const mount = document.getElementById('skills-mount'); if (!mount || !groups) return;
    mount.innerHTML = groups.map((gp) => {
      const color = gp.accent === 'c' ? 'var(--accent-2)' : 'var(--accent)';
      const chips = gp.items.map((it) => '<span class="skill-chip">' + this.esc(it) + '</span>').join('');
      return '<div class="skill-group" data-reveal>'
        + '<div class="sg-head"><span class="sg-dot" style="background:' + color + ';color:' + color + ';"></span>'
        + '<span class="sg-name">' + this.esc(gp.group) + '</span>'
        + '<span class="sg-count">' + gp.items.length + ' tools</span></div>'
        + '<div class="skill-chips">' + chips + '</div></div>';
    }).join('');
  }

  renderExperience(items) {
    const mount = document.getElementById('experience-mount'); if (!mount || !items) return;
    mount.innerHTML = items.map((e) => {
      const pts = e.points.map((p) => '<li>' + this.esc(p) + '</li>').join('');
      return '<div class="exp-item" data-reveal><span class="exp-dot"></span>'
        + '<div class="exp-head"><span class="exp-role">' + this.esc(e.role) + '</span>'
        + '<span class="exp-period">' + this.esc(e.period) + '</span></div>'
        + '<div class="exp-org">' + this.esc(e.org) + '</div>'
        + '<span class="exp-tag">' + this.esc(e.tag) + '</span>'
        + '<ul class="exp-points">' + pts + '</ul></div>';
    }).join('');
  }

  renderProjects(projects) {
    const mount = document.getElementById('projects-mount'); if (!mount || !projects) return;
    mount.innerHTML = projects.map((p) => {
      const tags = p.tags.map((t) => '<span class="proj-tag">' + this.esc(t) + '</span>').join('');
      const links = p.links.map((l, idx) => {
        const primary = idx === 0 ? ' primary' : '';
        return '<a class="proj-link' + primary + '" href="' + this.esc(l.href) + '" target="_blank" rel="noopener" data-magnetic="0.2">'
          + this.esc(l.label) + ' <span class="arrow">↗</span></a>';
      }).join('');
      const badge = p.featured
        ? '<span class="proj-badge">★ Featured</span>'
        : '';
      const propTag = p.proprietary ? '<span class="proj-badge muted">Enterprise · Proprietary</span>' : '';
      return '<article class="proj-card' + (p.featured ? ' featured' : '') + '" data-tilt data-reveal>'
        + '<div class="proj-top">' + badge + propTag + '</div>'
        + '<h3 class="proj-title">' + this.esc(p.title) + '</h3>'
        + '<p class="proj-blurb">' + this.esc(p.blurb) + '</p>'
        + '<div class="proj-tags">' + tags + '</div>'
        + '<div class="proj-links">' + links + '</div>'
        + '</article>';
    }).join('');
  }

  renderAchievements(items, notes) {
    const mount = document.getElementById('achievements-mount'); if (!mount || !items) return;
    const cards = items.map((a) => {
      const pre = a.prefix ? (a.suffix || '') : '';
      const suf = a.prefix ? '' : (a.suffix || '');
      return '<div class="ach-card" data-reveal>'
        + '<div class="ach-num"><span class="ach-pre">' + this.esc(pre) + '</span>'
        + '<span class="ach-n" data-count="' + a.value + '">0</span>'
        + '<span class="ach-suf">' + this.esc(suf) + '</span></div>'
        + '<div class="ach-label">' + this.esc(a.label) + '</div></div>';
    }).join('');
    const noteHtml = (notes || []).map((n) => '<div class="ach-note">' + this.esc(n) + '</div>').join('');
    mount.innerHTML = '<div class="ach-grid">' + cards + '</div>'
      + (noteHtml ? '<div class="ach-notes" data-reveal>' + noteHtml + '</div>' : '');
  }

  /* count-up when the achievements section scrolls into view */
  initCounters() {
    const nums = Array.from(document.querySelectorAll('.ach-n')); if (!nums.length) return;
    const run = (el) => {
      const target = parseFloat(el.getAttribute('data-count')) || 0;
      if (this.prefersReduced) { el.textContent = String(target); return; }
      const g = this.gsap; const o = { v: 0 };
      if (g) g.to(o, { v: target, duration: 1.6, ease: 'power2.out', onUpdate: () => { el.textContent = String(Math.floor(o.v)); }, onComplete: () => { el.textContent = String(target); } });
      else el.textContent = String(target);
    };
    if (!('IntersectionObserver' in window)) { nums.forEach(run); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { run(en.target); io.unobserve(en.target); } });
    }, { threshold: 0.5 });
    nums.forEach((n) => io.observe(n));
  }

  /* 3D tilt for project + about cards (pointer only) */
  initTilt() {
    if (this.isTouch) return;
    document.querySelectorAll('[data-tilt]').forEach((card) => {
      const max = 9;
      card.addEventListener('mousemove', (e) => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        const rx = (py - 0.5) * -2 * max, ry = (px - 0.5) * 2 * max;
        card.style.transform = 'perspective(900px) rotateX(' + rx.toFixed(2) + 'deg) rotateY(' + ry.toFixed(2) + 'deg)';
        card.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
        card.style.setProperty('--my', (py * 100).toFixed(1) + '%');
      });
      card.addEventListener('mouseleave', () => { card.style.transform = 'perspective(900px) rotateX(0) rotateY(0)'; });
    });
  }

  /* frosted contact form — static, opens a prefilled mail draft */
  initContactForm() {
    const form = document.getElementById('contact-form'); if (!form) return;
    const status = document.getElementById('cf-status');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = (form.name.value || '').trim();
      const email = (form.email.value || '').trim();
      const msg = (form.message.value || '').trim();
      if (!name || !email || !msg) { if (status) { status.textContent = 'Please fill in every field.'; status.style.color = '#ff9b9b'; } return; }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { if (status) { status.textContent = 'That email doesn’t look right.'; status.style.color = '#ff9b9b'; } return; }
      const subject = encodeURIComponent('Portfolio enquiry from ' + name);
      const body = encodeURIComponent(msg + '\n\n— ' + name + ' (' + email + ')');
      window.location.href = 'mailto:syedazeeem.13@gmail.com?subject=' + subject + '&body=' + body;
      if (status) { status.textContent = 'Opening your mail app… or write to syedazeeem.13@gmail.com directly.'; status.style.color = 'var(--accent-2)'; }
      form.reset();
    });
  }
}

/* ---------------- bootstrap ---------------- */
const portfolio = new Portfolio();
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => portfolio.init());
else portfolio.init();
