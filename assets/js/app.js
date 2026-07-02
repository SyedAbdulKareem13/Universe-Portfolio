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
    this.worldPhase = 'idle'; // idle | swallowing | ended | reviving | apocalypse | impacted | rebuilding
    this._bhLens = { strength: 0 }; // gravitational-lensing strength for the 3D black hole
    this._apocShake = { amp: 0 };   // bounded camera-shake amplitude for the Apocalypse set-piece
  }

  /* ---------------- lifecycle ---------------- */
  init() {
    if (this._init) return; this._init = true;
    const mm = (q) => { try { return window.matchMedia(q).matches; } catch (e) { return false; } };
    // Motion policy: the animations ARE this site's product, so we default to FULL
    // motion even when the OS reports prefers-reduced-motion (Windows "animation
    // effects off" was silently freezing the ticker, skipping the Apocalypse
    // asteroids and disabling smooth scroll for some visitors). An explicit,
    // persisted "Motion" toggle in the ✦ panel is the accessible opt-out, and the
    // photosensitivity guards (no strobe, spaced luminance-limited flashes) stay
    // on regardless of this setting.
    this.osPrefersReduced = mm('(prefers-reduced-motion: reduce)');
    let motionPref = null; try { motionPref = localStorage.getItem('uv-motion'); } catch (e) {}
    this.prefersReduced = motionPref ? (motionPref === 'reduced') : false;
    this.isTouch = mm('(hover: none), (pointer: coarse)');
    this.isSmall = window.innerWidth < 768;
    this.use3D = !this.isSmall && this.hasWebGL();
    this.tier = this.detectTier();        // 'ultra' | 'high' | 'low' (graphics quality)
    this.tierManual = false;              // becomes true once the user picks a tier
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
    const rebuild = document.getElementById('rebuild-btn');
    if (rebuild) rebuild.addEventListener('click', () => this.rebuild());
    // never trap the user: Esc + browser-back recover from any set-piece, including its forward window
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (this.worldPhase === 'ended' || this.worldPhase === 'swallowing') this.revive();
      else if (this.worldPhase === 'impacted' || this.worldPhase === 'apocalypse') this.rebuild();
    });
    window.addEventListener('popstate', () => {
      if (this._ignoreNextPop) { this._ignoreNextPop = false; return; } // our own history.back() reconciliation
      if (this.worldPhase === 'ended' || this.worldPhase === 'swallowing') { this._recoverViaPop = true; this.revive(); }
      else if (this.worldPhase === 'impacted' || this.worldPhase === 'apocalypse') { this._recoverViaPop = true; this.rebuild(); }
    });

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
    if (this._eraSwitching) return;          // and during an in-flight time-warp (no set-piece mid-warp)
    if (btn) this.pressBtn(btn);
    if (['earth', 'zerog', 'mars', 'moon', 'jupiter'].indexOf(law) >= 0) return this.applyGravityPreset(law);
    if (law === 'slowmo') return this.toggleSlowmo();
    if (law === 'blackhole') return this.handleBlackHole();
    if (law === 'time') return this.cycleTime();
    if (law === 'bigbang') return this.bigBang();
    if (law === 'apocalypse') return this.handleApocalypse();
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
    if (this.three) this.spawnBlackHole3D(); else this.spawnBlackHole(); // 3D in WebGL, DOM fallback otherwise
    this.wake();
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

  /* ---------------- 3D black hole (WebGL) ----------------
     Event horizon (black sphere) + swirling accretion-disk shader + bright
     photon ring + screen-space gravitational lensing (grade pass). The hero
     sphere gives way to it. All spawn/despawn timings are fixed (no random). */
  accretionMaterial() {
    const THREE = window.THREE;
    return new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 } },
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `
        uniform float uTime; varying vec2 vP;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          float a=hash(i), b=hash(i+vec2(1.,0.)), c=hash(i+vec2(0.,1.)), d=hash(i+vec2(1.,1.));
          return mix(mix(a,b,f.x), mix(c,d,f.x), f.y); }
        void main(){
          float r = length(vP); float ang = atan(vP.y, vP.x);
          float inner = smoothstep(0.55, 0.66, r);
          float outer = 1.0 - smoothstep(1.45, 1.85, r);
          float mask = inner * outer; if (mask <= 0.001) discard;
          float spin = ang * 2.0 + uTime * (2.6 - r * 0.9);                 // differential rotation, inner faster
          float bands = 0.6 + 0.4 * sin(spin * 3.0);
          float n = noise(vec2(spin, r * 6.0 - uTime * 0.9)) * (0.6 + 0.6 * noise(vec2(ang * 3.0, r * 2.0 + uTime * 0.3)));
          float doppler = 0.4 + 0.6 * smoothstep(-1.0, 1.0, sin(ang));      // relativistic beaming — one side brighter
          float intensity = mask * (0.4 + 0.6 * bands) * (0.45 + 0.7 * n) * doppler;
          float tr = clamp((r - 0.55) / (1.85 - 0.55), 0.0, 1.0);
          // Interstellar amber/gold temperature ramp: hot white inner -> deep amber rim (no blue)
          vec3 white = vec3(1.0, 0.96, 0.86), gold = vec3(1.0, 0.72, 0.34), amber = vec3(0.82, 0.38, 0.15);
          vec3 col = mix(white, mix(gold, amber, smoothstep(0.35, 1.0, tr)), smoothstep(0.0, 0.45, tr));
          gl_FragColor = vec4(col * intensity * 1.7, intensity);
        }`,
    });
  }

  spawnBlackHole3D() {
    const THREE = window.THREE; const s = this.three.scene; const g = this.gsap;
    if (this.bh3d) return;
    const grp = new THREE.Group();
    // event horizon — pure black, opaque so it occludes the disk's far side (the lensed arc wraps over the top)
    const horizon = new THREE.Mesh(new THREE.SphereGeometry(0.5, 64, 64), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    horizon.renderOrder = 0; grp.add(horizon);
    // bright thin photon / Einstein ring hugging the shadow — Gargantua's halo (blooms)
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.54, 0.014, 28, 256), new THREE.MeshBasicMaterial({ color: 0xffe6b0 }));
    ring.renderOrder = 2; grp.add(ring);
    // accretion disk (shader fade radii 0.55..1.85 — keep matched); nearly edge-on so the far side arcs over the top
    const disk = new THREE.Mesh(new THREE.RingGeometry(0.55, 1.85, 300, 1), this.accretionMaterial());
    disk.rotation.x = -1.2; disk.renderOrder = 1; grp.add(disk);
    this._bhDisk = disk;
    // PARENT TO CAMERA so it is locked to the exact middle of the screen, sized to sit centred
    grp.position.set(0, 0, -3.4);
    this.three.camera.add(grp);
    this.bh3d = grp; this._bhLens.strength = 0;
    grp.scale.setScalar(0.001);
    this.fadeHeroAmbient(0.1, 0.7); // declutter rings/shell/orbiters/glow so the black hole stands alone
    if (g) {
      g.to(grp.scale, { x: 0.5, y: 0.5, z: 0.5, duration: 0.8, ease: 'power2.out' });   // fixed 0.8s spawn, well-sized
      g.to(this._bhLens, { strength: 0.85, duration: 0.8, ease: 'power2.out' });
      if (this.sphere) g.to(this.sphere.scale, { x: 0.001, y: 0.001, z: 0.001, duration: 0.7, ease: 'power2.in' });
    } else {
      grp.scale.setScalar(0.5); this._bhLens.strength = 0.85; if (this.sphere) this.sphere.scale.setScalar(0.001);
    }
  }

  fadeHeroAmbient(factor, dur) {
    const g = this.gsap;
    (this._heroAmbient || []).forEach((o) => {
      if (!o || !o.material) return; o.material.transparent = true;
      if (o.userData._baseOp == null) o.userData._baseOp = (o.material.opacity != null ? o.material.opacity : 1);
      const target = o.userData._baseOp * factor;
      if (g) g.to(o.material, { opacity: target, duration: dur, ease: 'power2.inOut' }); else o.material.opacity = target;
    });
  }

  restoreHeroAmbient(dur) {
    const g = this.gsap;
    (this._heroAmbient || []).forEach((o) => {
      if (!o || !o.material || o.userData._baseOp == null) return;
      if (g) g.to(o.material, { opacity: o.userData._baseOp, duration: dur, ease: 'power2.out' }); else o.material.opacity = o.userData._baseOp;
    });
  }

  removeBlackHole3D() {
    const g = this.gsap; const s = this.three && this.three.scene;
    if (this.sphere && this.sphere.scale.x < 0.5) { if (g) g.to(this.sphere.scale, { x: 1, y: 1, z: 1, duration: 0.6, ease: 'power2.out' }); else this.sphere.scale.setScalar(1); }
    this.restoreHeroAmbient(0.6);
    this._bhLens.strength = 0;
    if (!this.bh3d) return;
    const grp = this.bh3d; this.bh3d = null; this._bhDisk = null;
    const fin = () => { try { if (grp.parent) grp.parent.remove(grp); grp.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); } catch (e) {} };
    if (g) g.to(grp.scale, { x: 0.001, y: 0.001, z: 0.001, duration: 0.5, ease: 'power3.in', onComplete: fin }); else fin();
  }

  removeBlackHoleEl() { const bh = document.getElementById('black-hole'); if (bh) bh.remove(); this.bhEl = null; this.removeBlackHole3D(); }
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
    const N = 10, dist = 64; // deterministic: evenly-spaced spokes, fixed radius/duration
    for (let i = 0; i < N; i++) {
      const d = document.createElement('div'); const ang = (i / N) * Math.PI * 2;
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
      const law = btn.getAttribute('data-law-btn'); if (law === 'reset' || law === 'apocalypse') return; let active = false;
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
    try { history.pushState({ universe: 'swallow' }, ''); this._pushedHistory = true; } catch (e) {}
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
    const D = 4.0; // fixed, deterministic total duration — exactly 4 seconds
    const root = document.getElementById('universe-root');
    const fx = document.getElementById('swallow-fx');
    const swirl = document.getElementById('swallow-swirl');
    const iris = document.getElementById('swallow-iris');
    const ring = document.getElementById('swallow-ring');
    const bar = document.getElementById('law-bar');

    g.set(root, { transformOrigin: '50% 50%' });
    g.set(iris, { '--iris': '140%' });
    g.set(fx, { opacity: 0 });

    const tl = g.timeline({ paused: true,
      onComplete: () => this.onSwallowComplete(),
      onReverseComplete: () => this.onReviveComplete(),
    });

    if (this.prefersReduced) {
      // gentle, non-violent collapse — still exactly 4s
      tl.to(fx, { opacity: 1, duration: 1.0, ease: 'power1.inOut' }, 0)
        .to(iris, { '--iris': '0%', duration: 3.4, ease: 'power1.inOut' }, 0.6)
        .to(root, { opacity: 0, duration: 3.4, ease: 'power1.inOut' }, 0.6);
      if (this.bh3d) tl.to(this.bh3d.scale, { x: 2.2, y: 2.2, z: 2.2, duration: 3.4, ease: 'power1.inOut' }, 0.6);
      return tl;
    }

    // the 3D black hole grows and its lensing intensifies across the whole 4s
    if (this.bh3d) {
      tl.to(this.bh3d.scale, { x: 2.7, y: 2.7, z: 2.7, duration: D, ease: 'power3.in' }, 0);
      tl.to(this._bhLens, { strength: 2.6, duration: D, ease: 'power3.in' }, 0);
    }
    // singularity forms
    tl.to(fx, { opacity: 1, duration: 0.8, ease: 'power1.in' }, 0)
      .fromTo(swirl, { rotate: 0, scale: 1 }, { rotate: 440, scale: 1.25, duration: D, ease: 'power3.in' }, 0)
    // intake — the DOM site spirals + scales down + blurs (3D black hole stays visible behind it)
      .to(root, { scale: 0.34, rotate: 20, filter: 'blur(6px)', duration: 2.0, ease: 'power2.in' }, 0.5)
      .to(bar, { opacity: 0, y: 30, scale: 0.6, duration: 0.6, ease: 'power2.in' }, 0.5)
      .to(iris, { '--iris': '54%', duration: 1.7, ease: 'power1.in' }, 0.8)
    // collapse — rush the final stretch to a point
      .to(root, { scale: 0.015, rotate: 96, filter: 'blur(20px)', opacity: 0, duration: 1.3, ease: 'power3.in' }, 2.5)
      .to(iris, { '--iris': '0%', duration: 1.1, ease: 'power3.in' }, 2.7)
    // Einstein-ring flash as the last of the site disappears (resolves exactly at 4.0s)
      .fromTo(ring, { opacity: 0, scale: 0, boxShadow: '0 0 0 0 rgba(255,255,255,0)' },
        { opacity: 1, scale: 70, boxShadow: '0 0 50px 16px rgba(255,255,255,0.9)', duration: 0.5, ease: 'power2.out' }, 3.1)
      .to(ring, { opacity: 0, duration: 0.4, ease: 'power2.in' }, 3.6);
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
    this._reconcileHistory();
  }

  // if a set-piece pushed a history entry and recovery did NOT come from Back,
  // pop our own entry so the browser Back button isn't silently consumed later
  _reconcileHistory() {
    if (this._pushedHistory) {
      this._pushedHistory = false;
      if (!this._recoverViaPop) { try { this._ignoreNextPop = true; history.back(); } catch (e) { this._ignoreNextPop = false; } }
    }
    this._recoverViaPop = false;
  }

  lockLawBar(locked) {
    const bar = document.getElementById('law-bar'); if (!bar) return;
    // disable EVERY law button during a set-piece (incl. reset) so nothing looks clickable-but-dead;
    // recovery is via the REVIVE/REBUILD overlay button, Esc or browser-back.
    bar.querySelectorAll('[data-law-btn]').forEach((b) => {
      b.style.pointerEvents = locked ? 'none' : '';
      b.style.opacity = locked ? '0.4' : '';
    });
    // keep the time-travel dial consistent (no dead-but-clickable affordance during set-pieces)
    if (this._timeDial) { this._timeDial.style.pointerEvents = locked ? 'none' : ''; this._timeDial.style.opacity = locked ? '0.35' : ''; }
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
      // 3D needs the gfx ES-module (three + post-processing addons) loaded
      const need = () => window.gsap && window.ScrollTrigger
        && (!this.use3D || (window.THREE && window.GFX))
        && (!this.useLenis || window.Lenis);
      const tick = () => {
        if (need()) return resolve(true);
        if (Date.now() - t0 > 9000) return resolve(false);
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
    this.buildTimeTravelUI();
    this.initNavGlass();
    this.applyTweaks();
    this.finishPreloader();
    // OS reports reduced-motion but we're running full (owner's default):
    // surface the accessible opt-out once, without nagging
    if (this.osPrefersReduced && !this.prefersReduced) {
      setTimeout(() => { try { this.toast('FULL MOTION ON — reduce it anytime in the ✦ panel'); } catch (e) {} }, 2600);
    }
  }

  // premium touch: the transparent nav gains a frosted-glass backing once you scroll
  initNavGlass() {
    const nav = document.getElementById('nav'); if (!nav) return;
    nav.style.transition = 'background .45s cubic-bezier(.2,.8,.2,1), box-shadow .45s cubic-bezier(.2,.8,.2,1), backdrop-filter .45s ease';
    let glassed = null;
    const apply = () => {
      const on = (window.scrollY || window.pageYOffset || 0) > 40;
      if (on === glassed) return; glassed = on;
      nav.style.background = on ? 'rgba(10,10,16,0.55)' : 'transparent';
      nav.style.backdropFilter = on ? 'blur(14px)' : 'none';
      nav.style.webkitBackdropFilter = nav.style.backdropFilter;
      nav.style.boxShadow = on ? '0 10px 32px rgba(0,0,0,0.28)' : 'none';
    };
    window.addEventListener('scroll', apply, { passive: true });
    apply();
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

  /* ---------------- quality tiers ----------------
     Lightweight GPU heuristic (no detect-gpu dependency, keeps the site
     build-free). Returns 'ultra' | 'high' | 'low'. Never picks ultra on
     touch/mobile; never auto-runs the heavy stack on weak GPUs. */
  detectTier() {
    if (this.isTouch || this.isSmall) return 'low';
    let gpu = '';
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
      const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
      if (ext) gpu = (gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '').toLowerCase();
    } catch (e) {}
    const cores = navigator.hardwareConcurrency || 4;
    const mem = navigator.deviceMemory || 4;
    const strong = /(rtx|gtx 1[06]|rx 6|rx 7|radeon pro|apple m\d|nvidia|geforce)/.test(gpu);
    const weak = /(intel.*(hd|uhd)|mali|adreno|swiftshader|llvmpipe|microsoft basic)/.test(gpu);
    if (weak || cores <= 4 || mem <= 4) return 'high'; // still good, just no SSAO/DoF
    if (strong && cores >= 8) return 'ultra';
    return 'high';
  }

  tierConfig(tier) {
    const dpr = window.devicePixelRatio || 1;
    const reduce = this.prefersReduced;
    const P = (n) => (reduce ? Math.round(n * 0.4) : n);
    if (tier === 'ultra') return { dpr: Math.min(dpr, 2), antialias: true, composer: true, bloom: true, ssao: true, dof: !reduce, shadows: true, particles: P(1500), sphereSeg: 128 };
    if (tier === 'low') return { dpr: 1, antialias: false, composer: false, bloom: false, ssao: false, dof: false, shadows: false, particles: P(280), sphereSeg: 64 };
    // high: dpr capped at 1.5 — visually near-identical, dramatically cheaper fill-rate on 1080p+ laptops
    return { dpr: Math.min(dpr, 1.5), antialias: true, composer: true, bloom: true, ssao: false, dof: false, shadows: false, particles: P(800), sphereSeg: 96 };
  }

  /* ---------------- three.js ---------------- */
  initThree() {
    const THREE = window.THREE;
    const cfg = this.cfg = this.tierConfig(this.tier);
    const mount = document.getElementById('gl-mount');
    const w = window.innerWidth, h = window.innerHeight;
    // preserveDrawingBuffer OFF — it blocks buffer-swap optimisations and forces a
    // per-frame copy on many GPUs; removing it is one of the biggest fps wins here.
    const renderer = new THREE.WebGLRenderer({ antialias: cfg.antialias, alpha: true, powerPreference: 'high-performance', stencil: false });
    renderer.setPixelRatio(Math.min(cfg.dpr, 2));
    renderer.setSize(w, h); renderer.setClearColor(0x000000, 0);
    // filmic, game-cinematic output
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    if (cfg.shadows) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; }
    renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%';
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a0a0f, 0.045);
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    camera.position.set(0, 0, 5.2);

    this.three = { THREE, renderer, scene, camera };
    scene.add(camera); // so camera-parented objects (the 3D black hole, kept dead-centre) get rendered
    this.camState = { px: 0, py: 0, pz: 5.2, tx: 0, ty: 0, tz: 0 };
    this._lastT = 0;
    this.stations = [
      { p: [0, 0, 5.2], t: [0, 0, 0] },
      { p: [1.2, -7, 4.6], t: [0.4, -7, 0] },
      { p: [-1.4, -14, 4.9], t: [0, -14, 0] },
      { p: [1.4, -21, 4.9], t: [0, -21, 0] },
      { p: [-1.2, -28, 4.9], t: [0, -28, 0] },
      { p: [0, -35, 5.0], t: [0, -35, 0] },
    ];

    // image-based lighting: procedural RoomEnvironment -> PMREM (no asset weight,
    // gives realistic reflections + cohesive mood for the PBR materials)
    try {
      const pmrem = new THREE.PMREMGenerator(renderer);
      this.envRT = pmrem.fromScene(new window.GFX.RoomEnvironment(), 0.04);
      scene.environment = this.envRT.texture;
      pmrem.dispose();
    } catch (e) { console.warn('IBL env failed', e); }

    // a couple of real lights for spec highlights + (ultra) contact shadow
    const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(3, 4, 5);
    const rim = new THREE.PointLight(0x22D3EE, 24, 40); rim.position.set(-4, -1, 2);
    const fill = new THREE.PointLight(0x8B5CF6, 18, 40); fill.position.set(4, 2, -2);
    scene.add(key, rim, fill);
    this.keyLight = key; this.rimLight = rim; this.fillLight = fill; // era-tinted via lerpEraVisuals

    this.buildSkyDome();
    this.buildGlow(); this.buildSphere(); this.buildShell(); this.buildRings(); this.buildOrbiters(); this.buildTorus(); this.buildShards(); this.buildStars(); this.buildParticles(cfg.particles);
    // hero-centred objects to fade out when the black hole takes the stage
    this._heroAmbient = [this.shell, this.glowV, this.glowC].concat(this.rings || []).concat(this.orbiters || []).filter(Boolean);
    if (this.tier !== 'low') this.buildSectionObjects();
    this.buildSpaceRoamers();
    this.buildRocket();
    this.initEras();
    this._sectionEls = ['home', 'about', 'skills', 'experience', 'projects', 'contact'].map((id) => document.getElementById(id)).filter(Boolean);
    this._clock = new THREE.Clock();
    this._bhScreen = new THREE.Vector3();

    if (cfg.composer) this.buildComposer(cfg);
    this.buildQualityUI();

    // fps monitor for auto-downgrade
    this._fps = { last: 0, acc: 0, frames: 0, low: 0 };
    this.hideFallback();
    document.addEventListener('visibilitychange', () => { this._hidden = document.hidden; });
    this.loop();
  }

  /* ---------------- post-processing composer (tier-aware) ---------------- */
  buildComposer(cfg) {
    const THREE = window.THREE; const G = window.GFX;
    const { renderer, scene, camera } = this.three;
    const w = window.innerWidth, h = window.innerHeight;
    const composer = new G.EffectComposer(renderer);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
    composer.addPass(new G.RenderPass(scene, camera));

    if (cfg.ssao) {
      const ssao = new G.SSAOPass(scene, camera, w, h);
      ssao.kernelRadius = 0.7; ssao.minDistance = 0.0016; ssao.maxDistance = 0.12;
      composer.addPass(ssao); this.ssaoPass = ssao;
    }
    if (cfg.bloom) {
      // half-resolution bloom chain — bloom is inherently blurry, so this is visually
      // indistinguishable while roughly quartering the pass's fill-rate cost
      const bloom = new G.UnrealBloomPass(new THREE.Vector2(Math.max(1, w >> 1), Math.max(1, h >> 1)), 0.7, 0.6, 0.88); // strength, radius, threshold (selective)
      composer.addPass(bloom); this.bloomPass = bloom;
    }
    if (cfg.dof) {
      const bokeh = new G.BokehPass(scene, camera, { focus: 5.2, aperture: 0.0009, maxblur: 0.008, width: w, height: h });
      composer.addPass(bokeh); this.bokehPass = bokeh;
    }
    composer.addPass(new G.OutputPass()); // ACES tone-map + sRGB encode

    // final display-space grade: subtle chromatic aberration + vignette + film grain
    const grade = new G.ShaderPass(this.gradeShader());
    grade.uniforms.uReduce.value = this.prefersReduced ? 1 : 0;
    grade.uniforms.uRes.value.set(w, h);
    composer.addPass(grade); this.gradePass = grade;

    this.composer = composer;
  }

  disposeComposer() {
    if (!this.composer) return;
    try { this.composer.passes.forEach((p) => { if (p.dispose) p.dispose(); }); } catch (e) {}
    try { this.composer.renderTarget1 && this.composer.renderTarget1.dispose(); this.composer.renderTarget2 && this.composer.renderTarget2.dispose(); } catch (e) {}
    this.composer = null; this.bloomPass = this.ssaoPass = this.bokehPass = this.gradePass = null;
  }

  gradeShader() {
    return {
      uniforms: {
        tDiffuse: { value: null }, uTime: { value: 0 }, uAberration: { value: 0.0016 },
        uVignette: { value: 1.08 }, uGrain: { value: 0.045 }, uReduce: { value: 0 },
        uRes: { value: new window.THREE.Vector2(1280, 720) },
        uBh: { value: new window.THREE.Vector3(0.5, 0.5, 0) }, // xy = black-hole screen pos, z = lens strength
        uWarp: { value: 0 }, // 0..1 time-travel transmission distortion
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `
        uniform sampler2D tDiffuse; uniform float uTime, uAberration, uVignette, uGrain, uReduce, uWarp;
        uniform vec2 uRes; uniform vec3 uBh; varying vec2 vUv;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        void main(){
          vec2 uv = vUv;
          // ---- time-travel transmission distortion: swirl + zoom ripple toward centre ----
          if (uWarp > 0.001) {
            vec2 c = uv - 0.5; float d = length(c);
            float sw = uWarp * 2.4 * (0.55 - d);
            float cs2 = cos(sw), sn2 = sin(sw);
            c = mat2(cs2, -sn2, sn2, cs2) * c;
            c *= 1.0 - uWarp * 0.22 * sin(d * 9.0 - uTime * 4.0);
            uv = c + 0.5;
          }
          // ---- gravitational lensing: bend + swirl toward the black hole ----
          if (uBh.z > 0.001) {
            float asp = uRes.x / max(uRes.y, 1.0);
            vec2 d2 = uv - uBh.xy; d2.x *= asp;
            float dist = length(d2);
            float pull = min(uBh.z * 0.05 / (dist * dist + 0.015), 0.6);
            float sw = uBh.z * 0.35 / (dist + 0.05);
            float cs = cos(sw), sn = sin(sw);
            d2 = mat2(cs, -sn, sn, cs) * d2 * (1.0 - pull);
            d2.x /= asp;
            uv = uBh.xy + d2;
          }
          vec2 dir = uv - 0.5; float r2 = dot(dir, dir);
          float ca = uAberration * (0.5 + r2) + uWarp * 0.018; // chromatic aberration, boosted while warping
          vec3 col;
          if (uWarp > 0.01) {
            // radial blur streaks during the warp (uWarp is uniform -> safe control flow)
            vec2 rb = (0.5 - uv) * uWarp * 0.14; vec3 acc = vec3(0.0);
            for (int i = 0; i < 6; i++) { float tt = float(i) / 5.0; vec2 s = uv + rb * tt; acc.r += texture2D(tDiffuse, s - dir * ca).r; acc.g += texture2D(tDiffuse, s).g; acc.b += texture2D(tDiffuse, s + dir * ca).b; }
            col = acc / 6.0;
            col += uWarp * 0.12; // luminance pulse at peak warp
          } else {
            col.r = texture2D(tDiffuse, uv - dir * ca).r;
            col.g = texture2D(tDiffuse, uv).g;
            col.b = texture2D(tDiffuse, uv + dir * ca).b;
          }
          // vignette
          float vig = smoothstep(1.15, 0.25, r2 * uVignette + 0.18);
          col *= mix(0.78, 1.0, vig);
          // film grain (animated unless reduced-motion)
          float t = (uReduce > 0.5) ? 0.0 : uTime;
          float g = hash(uv * vec2(1280.0, 720.0) + t) - 0.5;
          col += g * uGrain;
          gl_FragColor = vec4(col, 1.0);
        }`,
    };
  }

  /* ---------------- manual quality toggle (seamless, no reload) ---------------- */
  buildQualityUI() {
    if (document.getElementById('gfx-toggle')) return;
    const wrap = document.createElement('div');
    wrap.id = 'gfx-toggle';
    wrap.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:70;display:flex;flex-direction:column;align-items:flex-end;gap:8px;font-family:Space Grotesk,sans-serif;';
    const panel = document.createElement('div');
    panel.style.cssText = 'display:none;flex-direction:column;gap:4px;padding:8px;border-radius:14px;border:1px solid var(--line);background:rgba(12,12,18,0.82);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);box-shadow:0 18px 50px rgba(0,0,0,0.5);';
    ['ultra', 'high', 'low'].forEach((t) => {
      const b = document.createElement('button');
      b.textContent = t === 'ultra' ? 'Ultra' : t === 'high' ? 'High' : 'Low';
      b.dataset.tier = t;
      b.style.cssText = 'padding:7px 16px;border-radius:9px;border:1px solid var(--line);background:rgba(255,255,255,0.04);color:#c9ccd8;font:600 12px Space Grotesk,sans-serif;cursor:pointer;letter-spacing:0.04em;text-align:right;';
      b.addEventListener('click', () => { this.applyTier(t, true); });
      panel.appendChild(b);
    });
    // Motion preference (persisted): the accessible opt-out for the full-motion default
    const div = document.createElement('div');
    div.style.cssText = 'height:1px;background:var(--line);margin:4px 0;';
    panel.appendChild(div);
    [['full', 'Motion: Full'], ['reduced', 'Motion: Reduced']].forEach(([k, label]) => {
      const b = document.createElement('button');
      b.textContent = label; b.dataset.motion = k;
      b.setAttribute('aria-label', label);
      b.style.cssText = 'padding:7px 16px;border-radius:9px;border:1px solid var(--line);background:rgba(255,255,255,0.04);color:#c9ccd8;font:600 12px Space Grotesk,sans-serif;cursor:pointer;letter-spacing:0.04em;text-align:right;';
      b.addEventListener('click', () => this.setMotionPref(k));
      panel.appendChild(b);
    });
    const gear = document.createElement('button');
    gear.setAttribute('aria-label', 'Graphics quality');
    gear.style.cssText = 'display:inline-flex;align-items:center;gap:8px;padding:10px 14px;border-radius:999px;border:1px solid var(--line);background:rgba(10,10,18,0.7);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);color:#ECEDF2;font:600 12px Space Grotesk,sans-serif;letter-spacing:0.06em;cursor:pointer;box-shadow:0 8px 30px rgba(0,0,0,0.4);';
    gear.innerHTML = '<span style="font-size:13px;">✦</span><span id="gfx-label">' + this.tier.toUpperCase() + '</span>';
    gear.addEventListener('click', () => { panel.style.display = panel.style.display === 'flex' ? 'none' : 'flex'; this.markTierUI(); });
    wrap.appendChild(panel); wrap.appendChild(gear);
    document.body.appendChild(wrap);
    this._gfxPanel = panel; this.markTierUI();
  }

  markTierUI() {
    const lbl = document.getElementById('gfx-label'); if (lbl) lbl.textContent = this.tier.toUpperCase();
    if (!this._gfxPanel) return;
    this._gfxPanel.querySelectorAll('button').forEach((b) => {
      let on;
      if (b.dataset.tier) on = b.dataset.tier === this.tier;
      else if (b.dataset.motion) on = b.dataset.motion === (this.prefersReduced ? 'reduced' : 'full');
      else return;
      b.style.borderColor = on ? 'var(--accent)' : 'var(--line)';
      b.style.background = on ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.04)';
      b.style.color = on ? '#fff' : '#c9ccd8';
    });
  }

  // persist the motion preference and reload — motion affects init-time systems
  // (Lenis, cursor, reveal distances, particle counts), so a clean boot is honest
  setMotionPref(k) {
    try { localStorage.setItem('uv-motion', k); } catch (e) {}
    location.reload();
  }

  // seamless tier switch: rebuild composer + dpr + particle count, no reload
  applyTier(tier, manual) {
    if (!this.three) return;
    this.tier = tier; if (manual) this.tierManual = true;
    const cfg = this.cfg = this.tierConfig(tier);
    const { renderer } = this.three;
    renderer.setPixelRatio(Math.min(cfg.dpr, 2));
    if (cfg.shadows) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = window.THREE.PCFSoftShadowMap; }
    else renderer.shadowMap.enabled = false;
    this.disposeComposer();
    if (cfg.composer) this.buildComposer(cfg);
    this.setParticleCount(cfg.particles);
    const w = window.innerWidth, h = window.innerHeight;
    if (this.composer) this.composer.setSize(w, h);
    this.markTierUI();
    if (this.toast) this.toast('GRAPHICS — ' + tier.toUpperCase());
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
      uniform vec3 uColorA; uniform vec3 uColorB; uniform vec3 uBase; uniform float uFresnel; uniform float uTime;
      varying float vNoise; varying vec3 vNormalW; varying vec3 vPosW;
      void main(){
        vec3 V = normalize(cameraPosition - vPosW);
        float fres = pow(1.0 - clamp(dot(V, normalize(vNormalW)),0.0,1.0), uFresnel);
        float t = clamp(vNoise*0.5+0.5,0.0,1.0);
        vec3 accent = mix(uColorA, uColorB, t);
        vec3 col = mix(uBase, accent, fres);
        col += accent*fres*0.9;
        col += accent*pow(t,3.0)*0.18;
        // thin-film iridescence: hue cycles with view angle + surface noise
        vec3 irid = 0.5 + 0.5*cos(6.28318*(fres*1.3 + t*0.4 + vec3(0.0, 0.33, 0.67)) + uTime*0.15);
        col = mix(col, col*irid*1.5, smoothstep(0.25, 1.0, fres)*0.55);
        // bright iridescent rim feeds the bloom pass
        col += irid * pow(fres, 3.0) * 0.6;
        gl_FragColor = vec4(col, 1.0);
      }`;
    const seg = (this.cfg && this.cfg.sphereSeg) || 96; // tier-aware density — the noise vertex shader is the cost
    const geo = new THREE.SphereGeometry(1.3, seg, seg);
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
    const geo = new THREE.TorusKnotGeometry(0.85, 0.26, 160, 24, 2, 3); // lighter tessellation, visually identical at viewing distance
    const mat = new THREE.MeshPhysicalMaterial({ color: 0x6d4bd1, metalness: 1.0, roughness: 0.16, iridescence: 1.0, iridescenceIOR: 1.5, clearcoat: 1.0, clearcoatRoughness: 0.18, emissive: 0x160b2e, emissiveIntensity: 0.5, envMapIntensity: 1.4 });
    this.torus = new THREE.Mesh(geo, mat); this.torus.position.set(2.4, -7, 0); if (this.cfg && this.cfg.shadows) this.torus.castShadow = true; s.add(this.torus);
    const tg = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.makeGlow(34, 211, 238), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.5 }));
    tg.scale.set(5, 5, 1); tg.position.set(2.4, -7, -1); s.add(tg);
  }

  buildShards() {
    const THREE = window.THREE; const s = this.three.scene; this.shards = [];
    const geos = [new THREE.OctahedronGeometry(0.22), new THREE.TetrahedronGeometry(0.24), new THREE.IcosahedronGeometry(0.19), new THREE.DodecahedronGeometry(0.2), new THREE.TorusKnotGeometry(0.13, 0.05, 80, 12)];
    for (let i = 0; i < 11; i++) {
      const g = geos[i % geos.length];
      const cyan = i % 2;
      // metallic, iridescent crystals — reflect the IBL, emissive edge feeds bloom
      const m = new THREE.MeshPhysicalMaterial({ color: cyan ? 0x22D3EE : 0x8B5CF6, metalness: 1.0, roughness: 0.22, iridescence: 0.9, iridescenceIOR: 1.4, clearcoat: 0.8, clearcoatRoughness: 0.25, emissive: cyan ? 0x0b3a44 : 0x241046, emissiveIntensity: 0.55, envMapIntensity: 1.5 });
      const mesh = new THREE.Mesh(g, m);
      const ang = (i / 11) * Math.PI * 2; const rad = 2.1 + Math.random() * 1.7;
      mesh.position.set(Math.cos(ang) * rad, (Math.random() - 0.5) * 3.0, Math.sin(ang) * 1.8 - 0.5);
      if (this.cfg && this.cfg.shadows) mesh.castShadow = true;
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
      const g = new THREE.TorusGeometry(r, tube, 16, 220);
      // emissive neon rings — picked up by the bloom pass
      const m = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: col, emissiveIntensity: 2.4, metalness: 0.0, roughness: 0.5, transparent: true, opacity: op });
      const mesh = new THREE.Mesh(g, m); mesh.rotation.x = rx; mesh.rotation.z = rz; s.add(mesh); this.rings.push(mesh);
    };
    mk(2.0, 0.014, 0x8B5CF6, Math.PI * 0.5, 0.32, 0.85);
    mk(2.32, 0.009, 0x22D3EE, Math.PI * 0.42, -0.5, 0.7);
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

  /* GPU dust / embers — instanced points drifting + twinkling, count is tier-driven */
  buildParticles(count) { this._dust = null; this.setParticleCount(count); }

  setParticleCount(count) {
    const THREE = window.THREE; const s = this.three.scene;
    if (this._dust) { s.remove(this._dust); this._dust.geometry.dispose(); this._dust.material.dispose(); this._dust = null; }
    count = Math.max(0, count | 0); if (!count) return;
    const pos = new Float32Array(count * 3); const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 16;
      pos[i * 3 + 1] = 2 - Math.random() * 44;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 12 - 2;
      seed[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uColorA: { value: new THREE.Color(0xA78BFA) }, uColorB: { value: new THREE.Color(0x67E8F9) }, uSize: { value: (window.devicePixelRatio || 1) } },
      vertexShader: `uniform float uTime; uniform float uSize; attribute float aSeed; varying float vA;
        void main(){
          vec3 p = position;
          p.y += sin(uTime*0.3 + aSeed*6.2831)*0.45;
          p.x += cos(uTime*0.2 + aSeed*6.2831)*0.3;
          vec4 mv = modelViewMatrix*vec4(p,1.0);
          vA = 0.5 + 0.5*sin(uTime*1.6 + aSeed*22.0);
          gl_PointSize = (3.5 + 7.0*aSeed) * uSize * (300.0 / -mv.z) * 0.045;
          gl_Position = projectionMatrix*mv;
        }`,
      fragmentShader: `varying float vA; uniform vec3 uColorA; uniform vec3 uColorB;
        void main(){
          vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard;
          float a = smoothstep(0.5, 0.0, r) * (0.22 + 0.55*vA);
          gl_FragColor = vec4(mix(uColorA, uColorB, vA), a);
        }`,
    });
    this._dust = new THREE.Points(g, mat); this._dust.frustumCulled = false; s.add(this._dust);
  }

  /* meaningful 3D centerpiece for each section, parked at that section's camera
     station (y = 0,-7,-14,-21,-28,-35). Each represents its content. */
  buildSectionObjects() {
    const THREE = window.THREE; const s = this.three.scene; this.sectionFX = [];
    const pbr = (color, emissive, opts) => Object.assign({ color, metalness: 1, roughness: 0.22, emissive, emissiveIntensity: 0.5, envMapIntensity: 1.4 }, opts || {});
    const neon = (emissive, ei) => new THREE.MeshStandardMaterial({ color: 0x000000, emissive, emissiveIntensity: ei == null ? 2.0 : ei, roughness: 0.5, metalness: 0 });

    // SKILLS (-14): a constellation of skill "nodes" linked by faint lines (the skill cloud)
    {
      const grp = new THREE.Group(); grp.position.y = -14;
      const N = 12, R = 1.7; const pts = []; const nodeGeo = new THREE.IcosahedronGeometry(0.13, 0);
      const positions = [];
      for (let i = 0; i < N; i++) {
        const phi = Math.acos(1 - 2 * (i + 0.5) / N), th = Math.PI * (1 + Math.sqrt(5)) * i;
        const p = new THREE.Vector3(R * Math.cos(th) * Math.sin(phi), R * Math.sin(th) * Math.sin(phi), R * Math.cos(phi));
        const cyan = i % 2;
        const mesh = new THREE.Mesh(nodeGeo, new THREE.MeshPhysicalMaterial(pbr(cyan ? 0x22D3EE : 0x8B5CF6, cyan ? 0x0b3a44 : 0x241046, { iridescence: 0.8 })));
        mesh.position.copy(p); grp.add(mesh); positions.push(p);
      }
      for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) if (positions[i].distanceTo(positions[j]) < 1.85) pts.push(positions[i].x, positions[i].y, positions[i].z, positions[j].x, positions[j].y, positions[j].z);
      const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      grp.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x7c5cff, transparent: true, opacity: 0.22 })));
      s.add(grp); this.sectionFX.push({ grp, spin: 0.12 });
    }

    // EXPERIENCE (-21): a vertical timeline — three glowing rings up a spine (KEBS / Ericsson / PTU)
    {
      const grp = new THREE.Group(); grp.position.y = -21;
      const cols = [0xA78BFA, 0x8B5CF6, 0x22D3EE];
      [1.0, 0.0, -1.0].forEach((y, i) => {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5 + i * 0.28, 0.03, 16, 140), neon(cols[i], 2.0));
        ring.position.y = y * 1.2; grp.add(ring);
        const node = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 0), new THREE.MeshPhysicalMaterial(pbr(cols[i], cols[i], { emissiveIntensity: 0.8 })));
        node.position.set(0.5 + i * 0.28, y * 1.2, 0); grp.add(node);
      });
      grp.add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 3.0, 8), neon(0x7c5cff, 1.0)));
      s.add(grp); this.sectionFX.push({ grp, spin: 0.18 });
    }

    // PROJECTS (-28): a fan of floating glass "cards"
    {
      const grp = new THREE.Group(); grp.position.y = -28;
      const cardGeo = new THREE.BoxGeometry(0.95, 1.35, 0.05);
      for (let i = 0; i < 5; i++) {
        const card = new THREE.Mesh(cardGeo, new THREE.MeshPhysicalMaterial(pbr(0x1a1433, 0x2a1d52, { metalness: 0.6, roughness: 0.14, clearcoat: 1, emissiveIntensity: 0.35 })));
        const ang = (i - 2) * 0.42;
        card.position.set(Math.sin(ang) * 1.9, 0, Math.cos(ang) * 0.7 - 0.4); card.rotation.y = -ang;
        card.userData.by = card.position.y; grp.add(card);
      }
      s.add(grp); this.sectionFX.push({ grp, spin: 0.05, cards: true });
    }

    // CONTACT (-35): an iridescent crystal beacon inside a halo ring
    {
      const grp = new THREE.Group(); grp.position.y = -35;
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.95, 0), new THREE.MeshPhysicalMaterial(pbr(0x8B5CF6, 0x241046, { roughness: 0.1, iridescence: 1, iridescenceIOR: 1.6, emissiveIntensity: 0.6, envMapIntensity: 1.6 })));
      grp.add(crystal);
      const halo = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.02, 16, 160), neon(0x22D3EE, 2.0)); halo.rotation.x = Math.PI / 2.3; grp.add(halo);
      s.add(grp); this.sectionFX.push({ grp, spin: 0.2, crystal });
    }
  }

  /* ---------------- interactive 3D rocket ----------------
     Follows the cursor with velocity-based thrusters; banks toward its heading;
     after 5s of no mouse movement it flies to and perches on the nearest solid
     object, and takes off again the instant the cursor moves. */
  buildRocket() {
    const THREE = window.THREE; const s = this.three.scene;
    const grp = new THREE.Group();
    const bodyMat = new THREE.MeshPhysicalMaterial({ color: 0xf2f4f8, metalness: 1, roughness: 0.24, clearcoat: 1, clearcoatRoughness: 0.14, envMapIntensity: 1.8 });
    const accent = new THREE.MeshPhysicalMaterial({ color: 0x8B5CF6, metalness: 1, roughness: 0.32, emissive: 0x3a1d6e, emissiveIntensity: 0.6, envMapIntensity: 1.3 });
    const dark = new THREE.MeshPhysicalMaterial({ color: 0x2a2d3a, metalness: 1, roughness: 0.42, envMapIntensity: 1.1 });
    const glass = new THREE.MeshPhysicalMaterial({ color: 0x22D3EE, metalness: 0.3, roughness: 0.08, emissive: 0x0b3a44, emissiveIntensity: 1.0, clearcoat: 1 });
    const P = (r, y) => new THREE.Vector2(r, y);

    // smooth fuselage as a single lathed profile (nose tip at +Y), realistic silhouette
    grp.add(new THREE.Mesh(new THREE.LatheGeometry([
      P(0.0, -0.16), P(0.055, -0.15), P(0.078, -0.10), P(0.088, -0.02),
      P(0.09, 0.06), P(0.082, 0.13), P(0.06, 0.21), P(0.032, 0.28), P(0.0, 0.33),
    ], 32), bodyMat));
    // painted accent band
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0915, 0.0915, 0.05, 32), accent); grp.add(band);
    // flared bell nozzle (dark metal)
    grp.add(new THREE.Mesh(new THREE.LatheGeometry([P(0.03, -0.15), P(0.045, -0.2), P(0.075, -0.27)], 28), dark));
    // cockpit window + rim
    const win = new THREE.Mesh(new THREE.CircleGeometry(0.028, 24), glass); win.position.set(0, 0.13, 0.082); win.lookAt(0, 0.17, 1.2); grp.add(win);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.006, 12, 28), accent); rim.position.copy(win.position); rim.quaternion.copy(win.quaternion); grp.add(rim);
    // 3 swept-back fins (extruded shape, radial)
    const fs = new THREE.Shape(); fs.moveTo(0.07, 0.02); fs.lineTo(0.07, -0.13); fs.lineTo(0.2, -0.2); fs.lineTo(0.085, -0.02); fs.closePath();
    const finGeo = new THREE.ExtrudeGeometry(fs, { depth: 0.012, bevelEnabled: false }); finGeo.translate(0, 0, -0.006);
    for (let i = 0; i < 3; i++) { const pivot = new THREE.Group(); pivot.rotation.y = (i / 3) * Math.PI * 2; pivot.add(new THREE.Mesh(finGeo, accent)); grp.add(pivot); }
    // thruster flames
    const flameMat = () => new THREE.MeshBasicMaterial({ color: 0x8fe9ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const mkFlame = (px) => { const f = new THREE.Mesh(new THREE.ConeGeometry(0.042, 0.22, 16), flameMat()); f.position.set(px, -0.3, 0); f.rotation.z = Math.PI; grp.add(f); return f; };
    const main = mkFlame(0), left = mkFlame(-0.045), right = mkFlame(0.045);
    left.scale.setScalar(0.55); right.scale.setScalar(0.55);

    grp.scale.setScalar(0.62);  // a bit smaller per request
    grp.position.set(1.4, 0.6, 2.6); s.add(grp);
    this.rocket = {
      grp, main, left, right, vel: new THREE.Vector3(), prev: grp.position.clone(),
      up: new THREE.Vector3(0, 1, 0), q: new THREE.Quaternion(), state: 'fly',
      restTarget: new THREE.Vector3(), restNormal: new THREE.Vector3(0, 1, 0),
      tmpA: new THREE.Vector3(), tmpB: new THREE.Vector3(),
    };
  }

  updateRocket(t, dt) {
    const R = this.rocket; if (!R) return; const cam = this.three.camera;
    if (this.worldPhase !== 'idle' || (this.era && this.era !== 'space')) { R.grp.visible = false; return; } // hidden during set-pieces and outside the Space era
    R.grp.visible = true;
    const idle = (Date.now() - (this._lastMove || 0)) > 5000;

    // cursor -> a point ~3.2 units in front of the camera (slightly below dead-centre)
    const target = R.tmpA.set(this.mouse.x * 0.92, this.mouse.y * 0.92 - 0.12, 0.5).unproject(cam);
    const dir = R.tmpB.copy(target).sub(cam.position).normalize();
    target.copy(cam.position).addScaledVector(dir, 3.2);

    if (!idle && (R.state === 'rested' || R.state === 'landing')) R.state = 'takeoff';

    if (R.state === 'fly' || R.state === 'takeoff') {
      R.prev.copy(R.grp.position);
      R.grp.position.lerp(target, Math.min(1, dt * 4.5));
      R.vel.copy(R.grp.position).sub(R.prev).multiplyScalar(1 / dt);
      const speed = R.vel.length();
      if (speed > 0.25) { const vdir = R.tmpB.copy(R.vel).normalize(); R.q.setFromUnitVectors(R.up, vdir); R.grp.quaternion.slerp(R.q, Math.min(1, dt * 6)); }
      const k = Math.min(speed / 7, 1);                       // 0..1 by speed
      R.main.material.opacity = 0.55 + k * 0.45; R.main.scale.set(1, 0.7 + k * 1.6 + Math.sin(t * 45) * 0.06, 1);
      const side = k > 0.45 ? (k - 0.45) / 0.55 : 0;          // side thrusters ignite only at higher speed
      R.left.material.opacity = side * 0.8; R.left.scale.set(0.6, 0.4 + side * 1.1, 0.6);
      R.right.material.opacity = side * 0.8; R.right.scale.set(0.6, 0.4 + side * 1.1, 0.6);
      if (R.state === 'takeoff' && R.grp.position.distanceTo(target) < 0.6) R.state = 'fly';
      if (idle && R.state === 'fly') this.rocketBeginLanding();
    } else if (R.state === 'landing') {
      R.grp.position.lerp(R.restTarget, Math.min(1, dt * 3));
      R.q.setFromUnitVectors(R.up, R.restNormal); R.grp.quaternion.slerp(R.q, Math.min(1, dt * 4));
      R.main.material.opacity *= 0.9; R.left.material.opacity *= 0.9; R.right.material.opacity *= 0.9; R.main.scale.y *= 0.95;
      if (R.grp.position.distanceTo(R.restTarget) < 0.06) { R.state = 'rested'; R.main.material.opacity = 0; R.left.material.opacity = 0; R.right.material.opacity = 0; }
    } else { // rested
      R.grp.position.lerp(R.restTarget, 0.08);
      R.main.material.opacity = 0.08 + 0.05 * Math.sin(t * 3); // idle pilot light
    }
  }

  rocketBeginLanding() {
    const R = this.rocket; const THREE = window.THREE;
    const cands = [];
    if (this.sphere && this.sphere.scale.x > 0.5) cands.push({ c: this.sphere.getWorldPosition(new THREE.Vector3()), r: 1.35 });
    if (this.torus) cands.push({ c: this.torus.getWorldPosition(new THREE.Vector3()), r: 0.95 });
    (this.shards || []).forEach((m) => cands.push({ c: m.getWorldPosition(new THREE.Vector3()), r: 0.32 }));
    (this.sectionFX || []).forEach((o) => cands.push({ c: o.grp.getWorldPosition(new THREE.Vector3()), r: 1.1 }));
    if (!cands.length) return;
    let best = null, bd = 1e9;
    cands.forEach((o) => { const d = R.grp.position.distanceTo(o.c); if (d < bd) { bd = d; best = o; } });
    R.restNormal.subVectors(R.grp.position, best.c).normalize();
    if (R.restNormal.lengthSq() < 0.001) R.restNormal.set(0, 1, 0);
    R.restTarget.copy(best.c).addScaledVector(R.restNormal, best.r + 0.2);
    R.state = 'landing';
  }

  /* =====================================================================
     SPACE ROAMERS — a living space scene: slowly-rotating stations,
     roaming rockets on curved paths, and comets with GPU-particle tails.
     Background roamers move on cheap animated paths (not physics).
     ===================================================================== */
  makeRoamerRocket() {
    const THREE = window.THREE; const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.2, 6, 14), new THREE.MeshPhysicalMaterial({ color: 0xdfe4ee, metalness: 1, roughness: 0.3, envMapIntensity: 1.5 })); g.add(body);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.1, 16), new THREE.MeshPhysicalMaterial({ color: 0x8B5CF6, metalness: 1, roughness: 0.35, emissive: 0x2a1046, emissiveIntensity: 0.5 })); nose.position.y = 0.2; g.add(nose);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.16, 12), new THREE.MeshBasicMaterial({ color: 0x7fe0ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })); flame.position.y = -0.2; flame.rotation.z = Math.PI; g.add(flame);
    g.userData.flame = flame; return g;
  }

  buildStation() {
    const THREE = window.THREE; const g = new THREE.Group();
    const metal = new THREE.MeshPhysicalMaterial({ color: 0x9aa3b5, metalness: 1, roughness: 0.45, envMapIntensity: 1.3 });
    const truss = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.4, 14), metal); truss.rotation.z = Math.PI / 2; g.add(truss);
    [-0.42, 0.42].forEach((x) => { const r = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.04, 12, 44), metal); r.position.x = x; r.rotation.y = Math.PI / 2; g.add(r); });
    const wings = new THREE.Group();
    [-1, 1].forEach((side) => {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6), metal); arm.position.x = side * 0.72; arm.rotation.z = Math.PI / 2; wings.add(arm);
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.012, 0.72), new THREE.MeshPhysicalMaterial({ color: 0x16213a, metalness: 0.4, roughness: 0.3, emissive: 0x122a6e, emissiveIntensity: 0.45, envMapIntensity: 1.2 })); panel.position.x = side * 1.05; wings.add(panel);
    });
    g.add(wings); g.userData.wings = wings;
    const lights = []; [[0.62, 0.18, 0, 0xff5555], [-0.62, -0.18, 0, 0x55ff88], [0, 0.22, 0.22, 0x55aaff]].forEach(([x, y, z, c]) => { const l = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 10), new THREE.MeshBasicMaterial({ color: c })); l.position.set(x, y, z); g.add(l); lights.push(l); });
    g.userData.lights = lights; return g;
  }

  buildComet() {
    const THREE = window.THREE; const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.08, 0), new THREE.MeshStandardMaterial({ color: 0xbfeaff, metalness: 0.2, roughness: 0.6, emissive: 0x2a5a7a, emissiveIntensity: 0.7 })));
    const N = 120, pos = new Float32Array(N * 3), al = new Float32Array(N);
    for (let i = 0; i < N; i++) { const f = i / N; pos[i * 3] = 0; pos[i * 3 + 1] = f * 1.7; pos[i * 3 + 2] = 0; al[i] = 1 - f; } // tail along +Y local
    const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); tg.setAttribute('aA', new THREE.BufferAttribute(al, 1));
    const tm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: new THREE.Color(0x9fe6ff) } },
      vertexShader: 'attribute float aA; varying float vA; void main(){ vA=aA; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=(7.0*aA+1.0)*(200.0/-mv.z)*0.05; gl_Position=projectionMatrix*mv; }',
      fragmentShader: 'varying float vA; uniform vec3 uColor; void main(){ vec2 d=gl_PointCoord-0.5; if(length(d)>0.5) discard; gl_FragColor=vec4(uColor, vA*0.5); }' });
    g.add(new THREE.Points(tg, tm)); return g;
  }

  buildSpaceRoamers() {
    if (!this.three) return;
    const THREE = window.THREE; const s = this.three.scene; const tier = this.tier;
    const nRockets = tier === 'ultra' ? 6 : tier === 'low' ? 2 : 4;
    const nComets = tier === 'ultra' ? 3 : tier === 'low' ? 1 : 2;
    const nStations = tier === 'low' ? 0 : 1;
    this.roamers = { stations: [], rockets: [], comets: [], sun: new THREE.Vector3(7, 5, 4) };
    for (let i = 0; i < nStations; i++) { const st = this.buildStation(); st.position.set(-3.4, -12, -4.5); st.scale.setScalar(1.15); s.add(st); this.roamers.stations.push({ grp: st, spin: 0.04 }); }
    for (let i = 0; i < nRockets; i++) {
      const rk = this.makeRoamerRocket(); rk.scale.setScalar(0.7); s.add(rk);
      const sd = (n) => { const x = Math.sin((i * 12.9 + n * 78.2)) * 43758.5; return x - Math.floor(x); }; // deterministic per-roamer
      const path = { cx: (i % 2 ? 2.6 : -2.6), cy: -(i * 5) - 2, cz: -2.5 - (i % 3), a: 1.6 + sd(1) * 1.2, b: 1.0 + sd(2) * 0.8, w: 0.16 + sd(3) * 0.12, ph: sd(4) * 6.28 };
      this.roamers.rockets.push({ grp: rk, path, prev: new THREE.Vector3(), q: new THREE.Quaternion() });
    }
    for (let i = 0; i < nComets; i++) { const cm = this.buildComet(); s.add(cm); this.roamers.comets.push({ grp: cm, y: -(i * 9) - 4, z: -6 - i * 2, speed: 1.2 + i * 0.4, ph: i * 2.3, span: 13, q: new THREE.Quaternion() }); }
  }

  animateRoamers(t) {
    const R = this.roamers; if (!R || (this.era && this.era !== 'space')) return; const THREE = window.THREE; const UP = this._UP || (this._UP = new THREE.Vector3(0, 1, 0));
    R.stations.forEach((o) => { o.grp.rotation.z = t * o.spin; if (o.grp.userData.wings) o.grp.userData.wings.rotation.x = t * 0.3; (o.grp.userData.lights || []).forEach((l, k) => { l.visible = Math.sin(t * 3 + k * 2.1) > -0.3; }); });
    R.rockets.forEach((o) => {
      const p = o.path; o.prev.copy(o.grp.position);
      o.grp.position.set(p.cx + Math.cos(t * p.w + p.ph) * p.a, p.cy + Math.sin(t * p.w * 0.8 + p.ph) * p.b, p.cz + Math.sin(t * p.w + p.ph * 1.3) * 0.8);
      const v = this._rkTmp2 || (this._rkTmp2 = new THREE.Vector3()); v.copy(o.grp.position).sub(o.prev);
      if (v.lengthSq() > 1e-6) { o.q.setFromUnitVectors(UP, v.normalize()); o.grp.quaternion.slerp(o.q, 0.2); }
      if (o.grp.userData.flame) o.grp.userData.flame.scale.y = 0.8 + Math.sin(t * 30 + p.ph) * 0.2;
    });
    R.comets.forEach((o) => {
      const span = o.span; let x = ((t * o.speed + o.ph) % (span * 2)) - span;
      o.grp.position.set(-x, o.y + x * 0.15, o.z);
      const away = (this._cmTmp || (this._cmTmp = new THREE.Vector3())).copy(o.grp.position).sub(R.sun).normalize();
      o.q.setFromUnitVectors(UP, away); o.grp.quaternion.copy(o.q);
      o.grp.visible = (1 - Math.min(1, Math.abs(x) / span)) > 0.06;
    });
  }

  /* =====================================================================
     TIME TRAVEL — 5 data-driven eras with a time-warp transmission morph.
     Each era reskins sky dome + fog + HUD/scene accent + dust + a signature
     procedural 3D backdrop. The grade-pass uWarp (swirl + radial blur +
     chromatic + flash) masks the hard era swap, so the new era "renders" out
     of the distortion. prefers-reduced-motion -> instant crossfade.
     ===================================================================== */
  buildSkyDome() {
    const THREE = window.THREE;
    this.skyUniforms = { uTop: { value: new THREE.Color(0x14111f) }, uBottom: { value: new THREE.Color(0x0a0a0f) } };
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, fog: false, depthWrite: false,
      uniforms: this.skyUniforms,
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 uTop, uBottom; varying vec3 vP; void main(){ float h = clamp(vP.y/60.0*0.5+0.5, 0.0, 1.0); gl_FragColor = vec4(mix(uBottom, uTop, pow(h, 0.8)), 1.0); }',
    });
    this.skyDome = new THREE.Mesh(new THREE.SphereGeometry(60, 32, 24), mat);
    this.skyDome.renderOrder = -1; this.three.scene.add(this.skyDome);
  }

  initEras() {
    this.eraEnv = {};
    this.ERAS = {
      dino:       { name: 'Dinosaur Age', emoji: '🦕', a: 0x4fb06a, b: 0xff8a3c, fog: 0x0c1a0e, fogD: 0.052, skyTop: 0x2b4020, skyBot: 0x0a1108, dustA: 0x8fe07a, dustB: 0xffcf6b, keyC: 0xffd9a0, rimC: 0x4fb06a, fillC: 0xff8a3c, build: 'buildDinoEra' },
      kingdom:    { name: 'Kingdom Age',  emoji: '🏰', a: 0xd8b34a, b: 0xb05566, fog: 0x171108, skyTop: 0x46301a, skyBot: 0x120b06, fogD: 0.046, dustA: 0xffcf8a, dustB: 0xd8b34a, keyC: 0xffc26b, rimC: 0xb05566, fillC: 0xd8b34a, build: 'buildKingdomEra' },
      space:      { name: 'Space Age',    emoji: '🚀', a: 0x8B5CF6, b: 0x22D3EE, fog: 0x0a0a0f, fogD: 0.045, skyTop: 0x14111f, skyBot: 0x0a0a0f, dustA: 0xA78BFA, dustB: 0x67E8F9, keyC: 0xffffff, rimC: 0x22D3EE, fillC: 0x8B5CF6, build: null },
      apocalypse: { name: 'Apocalypse',   emoji: '☄️', a: 0xff5a3c, b: 0xff9a3c, fog: 0x1a0805, fogD: 0.06, skyTop: 0x4a120a, skyBot: 0x0a0302, dustA: 0xff7a3c, dustB: 0xffb27a, keyC: 0xff8a5a, rimC: 0xff4a2a, fillC: 0xff9a3c, build: 'buildApocalypseEra' },
      post:       { name: 'Post-Apoc',    emoji: '🌿', a: 0x9bbf8a, b: 0xb9826a, fog: 0x14130f, fogD: 0.05, skyTop: 0x3a3f2c, skyBot: 0x0d0e0a, dustA: 0xc2d2b0, dustB: 0xc9a08a, keyC: 0xd6dcc6, rimC: 0x9bbf8a, fillC: 0xb9826a, build: 'buildPostEra' },
    };
    const C = window.THREE.Color; this._lc0 = new C(); this._lcA = new C(); this._lcB = new C(); this._lcT = new C(); // reusable scratch for lerpEraVisuals
    this.era = 'space';
    // "only space should have space": every space-scene object that must vanish in the other eras
    this._spaceOnly = [this.stars, this.glowV, this.glowC, this.shell, this.torus]
      .concat(this.rings || []).concat(this.orbiters || []).concat(this.shards || [])
      .concat((this.sectionFX || []).map((o) => o.grp)).filter(Boolean);
  }

  ensureEraEnv(era) {
    if (this.eraEnv[era]) return this.eraEnv[era];
    const fn = this.ERAS[era] && this.ERAS[era].build;
    const grp = (fn && this[fn]) ? this[fn]() : null;
    if (grp) { grp.visible = false; this.three.scene.add(grp); this.eraEnv[era] = grp; }
    return grp || { visible: false };
  }

  setSpaceRoamersVisible(v) {
    const R = this.roamers; if (!R) return;
    R.stations.forEach((o) => { o.grp.visible = v; });
    R.rockets.forEach((o) => { o.grp.visible = v; });
    R.comets.forEach((o) => { o.grp.visible = v; });
  }

  swapEraEnv(target) {
    Object.keys(this.eraEnv).forEach((k) => { if (this.eraEnv[k]) this.eraEnv[k].visible = false; });
    if (target !== 'space') {
      const e = this.ensureEraEnv(target);
      if (e) { e.visible = true; if (e.userData && e.userData.follow && e.position) e.position.y = this.camState ? this.camState.py : 0; } // snap the world to the camera
    }
    const showSpace = target === 'space';
    this.setSpaceRoamersVisible(showSpace);
    (this._spaceOnly || []).forEach((o) => { o.visible = showSpace; }); // stars/nebula/crystals/neon exist only in the Space era
  }

  lerpEraVisuals(from, to, p) {
    const tmp = this._lcT; const lc = (h1, h2, out) => out.set(h1).lerp(tmp.set(h2), p); // reuse scratch colours — no per-frame GC churn
    if (this.skyUniforms) { this.skyUniforms.uTop.value.copy(lc(from.skyTop, to.skyTop, this._lc0)); this.skyUniforms.uBottom.value.copy(lc(from.skyBot, to.skyBot, this._lc0)); }
    if (this.three && this.three.scene.fog) { this.three.scene.fog.color.copy(lc(from.fog, to.fog, this._lc0)); this.three.scene.fog.density = from.fogD + (to.fogD - from.fogD) * p; }
    const a = lc(from.a, to.a, this._lcA), b = lc(from.b, to.b, this._lcB); // a & b held together -> distinct scratch
    const aHex = '#' + a.getHexString(), bHex = '#' + b.getHexString();
    const root = document.documentElement;
    root.style.setProperty('--accent', aHex); root.style.setProperty('--accent-2', bHex);
    root.style.setProperty('--accent-grad', 'linear-gradient(120deg,' + aHex + ' 0%,' + aHex + ' 35%,' + bHex + ' 100%)');
    if (this.sphereUniforms) { this.sphereUniforms.uColorA.value.copy(a); this.sphereUniforms.uColorB.value.copy(b); }
    if (this._dust) { this._dust.material.uniforms.uColorA.value.copy(lc(from.dustA, to.dustA, this._lc0)); this._dust.material.uniforms.uColorB.value.copy(lc(from.dustB, to.dustB, this._lc0)); }
    // era-tinted lighting: warm sunset for dino, torch-gold for kingdom, red for apocalypse, pale dawn for post
    if (this.keyLight && from.keyC != null) this.keyLight.color.copy(lc(from.keyC, to.keyC, this._lc0));
    if (this.rimLight && from.rimC != null) this.rimLight.color.copy(lc(from.rimC, to.rimC, this._lc0));
    if (this.fillLight && from.fillC != null) this.fillLight.color.copy(lc(from.fillC, to.fillC, this._lc0));
    const fb = document.getElementById('gl-fallback');
    if (fb) fb.style.background = 'radial-gradient(120% 120% at 50% -10%, #' + lc(from.skyTop, to.skyTop, this._lc0).getHexString() + ' 0%, #' + lc(from.fog, to.fog, this._lc0).getHexString() + ' 60%)';
  }

  applyEraInstant(era) {
    const cfg = this.ERAS[era]; if (!cfg) return;
    this.swapEraEnv(era); this.lerpEraVisuals(cfg, cfg, 1); this.era = era; this.markEraUI();
  }

  switchEra(target, opts) {
    opts = opts || {};
    if (!this.ERAS || !this.ERAS[target]) return;
    if (this._eraSwitching) return;
    if (target === this.era && !opts.force) return;
    if (this.worldPhase !== 'idle' && !opts.force) return; // not during a set-piece
    const g = this.gsap; const from = this.ERAS[this.era], to = this.ERAS[target];
    this._eraSwitching = true;
    const finish = () => { this.era = target; this._eraSwitching = false; this.markEraUI(); };
    if (!g || this.prefersReduced) { this.swapEraEnv(target); this.lerpEraVisuals(from, to, 1); finish(); return; }
    const gp = this.gradePass; const warpEl = document.getElementById('warp-fx'); const proxy = { p: 0 };
    this.toast('TIME WARP — ' + to.name);
    const tl = g.timeline({ onComplete: finish, onInterrupt: () => { this._eraSwitching = false; if (gp) gp.uniforms.uWarp.value = 0; if (warpEl) warpEl.style.opacity = '0'; } });
    if (gp) { tl.to(gp.uniforms.uWarp, { value: 1, duration: 0.55, ease: 'power2.in' }, 0); tl.to(gp.uniforms.uWarp, { value: 0, duration: 0.95, ease: 'power2.out' }, 0.6); }
    if (warpEl) { tl.fromTo(warpEl, { opacity: 0 }, { opacity: 1, duration: 0.5, ease: 'power2.in' }, 0); tl.to(warpEl, { opacity: 0, duration: 0.7, ease: 'power2.out' }, 0.7); }
    // commit the era at the masked swap (peak warp) so the new era's movers animate immediately and the arc captures the right era
    tl.add(() => { this.era = target; this.swapEraEnv(target); this.markEraUI(); }, 0.55);
    tl.to(proxy, { p: 1, duration: 0.95, ease: 'power2.inOut', onUpdate: () => this.lerpEraVisuals(from, to, proxy.p) }, 0.5);
    this._eraTl = tl; return tl;
  }

  animateEra(t) {
    const env = this.era && this.eraEnv[this.era]; if (!env || !env.visible) return;
    // the era world travels with the camera (smooth lag) so it surrounds every section
    if (env.userData.follow && this.camState) env.position.y += (this.camState.py - env.position.y) * 0.08;
    (env.userData.movers || []).forEach((m) => {
      if (m.kind === 'glide') { m.mesh.position.x = m.x0 + (((t * m.sp + m.ph) % m.span) - m.span * 0.5); m.mesh.position.y = m.y0 + Math.sin(t * 0.7 + m.ph) * 0.35; m.mesh.rotation.z = Math.sin(t * 2 + m.ph) * 0.2; }
      else if (m.kind === 'sway') { m.mesh.rotation.z = Math.sin(t * 0.5 + m.ph) * 0.05; }
      else if (m.kind === 'wave') { m.mesh.rotation.y = Math.sin(t * 1.6 + m.ph) * 0.35; }
      else if (m.kind === 'flicker') { m.mesh.material.emissiveIntensity = m.base + Math.sin(t * 6 + m.ph) * 0.45 + 0.45; }
      else if (m.kind === 'dino') {
        // living dinosaurs: neck grazing sweep, tail swish, breathing bob
        if (m.neck) { m.neck.rotation.z = Math.sin(t * 0.45 + m.ph) * 0.1 - 0.04; m.neck.rotation.y = Math.sin(t * 0.3 + m.ph * 1.3) * 0.12; }
        if (m.tail) m.tail.rotation.y = Math.sin(t * 0.7 + m.ph) * 0.18;
        m.mesh.position.y = m.y0 + Math.sin(t * 1.1 + m.ph) * 0.025;
      }
      else if (m.kind === 'rise') {
        const cy = ((t * m.sp + m.ph) % m.h);
        m.mesh.position.y = m.y0 + cy;
        m.mesh.material.opacity = m.o * (1 - cy / m.h);
      }
      else if (m.kind === 'spin') { m.mesh.rotation.z = t * m.sp; }
      else if (m.kind === 'pulse') { m.mesh.material.opacity = m.base + Math.sin(t * m.sp + m.ph) * m.amp; }
    });
  }

  /* =====================================================================
     ERA WORLDS — full environments (ground + flora/architecture + creatures
     + sun) that FOLLOW the camera down the scroll, so every section of the
     page sits inside the era's world. Space elements are hidden outside the
     Space era (see _spaceOnly in initEras / swapEraEnv).
     ===================================================================== */
  _eraMat(c, e, ei, rough) { return new window.THREE.MeshStandardMaterial({ color: c, roughness: rough == null ? 0.92 : rough, metalness: 0.06, emissive: e || 0x000000, emissiveIntensity: ei || 0 }); }

  // displaced ground disc — flat near the centre (content area), rolling further out
  _ground(color, radius) {
    const THREE = window.THREE;
    const geo = new THREE.CircleGeometry(radius, 56);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i); const r = Math.hypot(x, y);
      const f = Math.min(1, Math.max(0, (r - 4.5) / 8));
      pos.setZ(i, (Math.sin(x * 0.33) * Math.cos(y * 0.27) + Math.sin(x * 0.11 + y * 0.17) * 0.6) * 0.55 * f);
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, this._eraMat(color, 0x000000, 0, 1.0));
    m.rotation.x = -Math.PI / 2; m.position.y = -3.4;
    return m;
  }

  // deterministic instanced scatter in a ring around the camera path
  _scatterInst(grp, geo, mat, count, rMin, rMax, seed, yAt, sMin, sMax) {
    const THREE = window.THREE;
    const inst = new THREE.InstancedMesh(geo, mat, count);
    const d = new THREE.Object3D();
    const sd = (n) => { const x = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453; return x - Math.floor(x); };
    for (let i = 0; i < count; i++) {
      const a = sd(i) * Math.PI * 2; const r = rMin + sd(i + 57) * (rMax - rMin);
      const s = sMin + sd(i + 113) * (sMax - sMin);
      d.position.set(Math.cos(a) * r, yAt, Math.sin(a) * r);
      d.rotation.y = sd(i + 211) * Math.PI * 2; d.scale.setScalar(s);
      d.updateMatrix(); inst.setMatrixAt(i, d.matrix);
    }
    inst.instanceMatrix.needsUpdate = true; grp.add(inst); return inst;
  }

  _tube(pts, radius, mat, segs) {
    const THREE = window.THREE;
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
    return new THREE.Mesh(new THREE.TubeGeometry(curve, segs || 14, radius, 8, false), mat);
  }

  _sunSprite(r, g, b, scale, pos, opacity) {
    const THREE = window.THREE;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.makeGlow(r, g, b), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: opacity }));
    sp.scale.set(scale, scale, 1); sp.position.set(pos[0], pos[1], pos[2]); return sp;
  }

  /* ---- a proper low-poly sauropod: curved tube neck + tail, legged body ---- */
  makeSauropod(color) {
    const THREE = window.THREE; const grp = new THREE.Group();
    const mat = this._eraMat(color, 0x000000, 0, 0.95);
    const belly = this._eraMat(color, 0x000000, 0, 0.95); // same tone, kept separate for future tinting
    // body (feet at local y=0)
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.78, 20, 16), mat); body.scale.set(1.65, 1.05, 1.1); body.position.y = 1.62; grp.add(body);
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.62, 16, 14), belly); chest.position.set(0.75, 1.66, 0); grp.add(chest);
    // neck: smooth curve rising forward, pivoted at the shoulder so it can sway
    const neckGrp = new THREE.Group(); neckGrp.position.set(1.05, 1.85, 0);
    const neck = this._tube([[0, 0, 0], [0.55, 0.7, 0.05], [0.8, 1.45, 0.1], [0.85, 2.1, 0.05]], 0.2, mat, 16); neckGrp.add(neck);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 12), mat); head.scale.set(1.5, 0.85, 0.9); head.position.set(0.98, 2.16, 0.05); neckGrp.add(head);
    const snout = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), mat); snout.scale.set(1.5, 0.8, 0.9); snout.position.set(1.3, 2.1, 0.05); neckGrp.add(snout);
    grp.add(neckGrp);
    // tail: long tapering curve, pivoted at the hip
    const tailGrp = new THREE.Group(); tailGrp.position.set(-1.15, 1.6, 0);
    const tail = this._tube([[0, 0, 0], [-0.9, -0.25, 0.15], [-1.8, -0.8, 0.35], [-2.5, -1.35, 0.5]], 0.17, mat, 16); tailGrp.add(tail);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.5, 8), mat); tip.position.set(-2.62, -1.5, 0.53); tip.rotation.z = 2.15; tailGrp.add(tip);
    grp.add(tailGrp);
    // 4 legs + feet
    [[0.75, 0.42], [0.75, -0.42], [-0.8, 0.42], [-0.8, -0.42]].forEach(([x, z]) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.21, 1.25, 10), mat); leg.position.set(x, 0.63, z); grp.add(leg);
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.14, 10), mat); foot.position.set(x, 0.07, z); grp.add(foot);
    });
    // dorsal ridge along the spine + eyes
    for (let i = 0; i < 7; i++) { const pl = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.2, 4), mat); pl.position.set(0.95 - i * 0.36, 2.34 - Math.abs(i - 3) * 0.1, 0); pl.scale.z = 0.45; grp.add(pl); }
    const eyeM = this._eraMat(0x0a0c08, 0x000000, 0, 0.4);
    [0.14, -0.14].forEach((z) => { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), eyeM); eye.position.set(1.08, 2.24, z); neckGrp.add(eye); });
    grp.userData.neck = neckGrp; grp.userData.tail = tailGrp;
    return grp;
  }

  /* ---- a theropod (rex-like): tilted body, big head, strong legs, long tail ---- */
  makeTheropod(color) {
    const THREE = window.THREE; const grp = new THREE.Group();
    const mat = this._eraMat(color, 0x000000, 0, 0.95);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 18, 14), mat); body.scale.set(1.55, 0.95, 0.9); body.position.set(0, 1.28, 0); body.rotation.z = 0.28; grp.add(body);
    const neckGrp = new THREE.Group(); neckGrp.position.set(0.72, 1.62, 0);
    const neck = this._tube([[0, 0, 0], [0.28, 0.3, 0], [0.5, 0.52, 0]], 0.16, mat, 8); neckGrp.add(neck);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.34, 0.3), mat); head.position.set(0.82, 0.6, 0); neckGrp.add(head);
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.24), mat); jaw.position.set(0.9, 0.42, 0); jaw.rotation.z = -0.12; neckGrp.add(jaw);
    grp.add(neckGrp);
    const tailGrp = new THREE.Group(); tailGrp.position.set(-0.75, 1.2, 0);
    const tail = this._tube([[0, 0, 0], [-0.85, 0.02, 0.1], [-1.7, -0.12, 0.25], [-2.3, -0.3, 0.35]], 0.13, mat, 14); tailGrp.add(tail);
    grp.add(tailGrp);
    [[0.12, 0.26], [0.12, -0.26]].forEach(([x, z]) => {
      const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.11, 0.7, 8), mat); thigh.position.set(x, 0.85, z); thigh.rotation.z = 0.18; grp.add(thigh);
      const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.62, 8), mat); shin.position.set(x + 0.08, 0.32, z); grp.add(shin);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.2), mat); foot.position.set(x + 0.16, 0.05, z); grp.add(foot);
    });
    [[0.55, 1.42, 0.18], [0.55, 1.42, -0.18]].forEach(([x, y, z]) => { const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.3, 6), mat); arm.position.set(x, y, z); arm.rotation.z = 1.0; grp.add(arm); });
    // eyes + brow ridge
    const teyeM = this._eraMat(0x0c0a06, 0x000000, 0, 0.4);
    [0.13, -0.13].forEach((z) => { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), teyeM); eye.position.set(0.7, 0.72, z); neckGrp.add(eye); });
    grp.userData.neck = neckGrp; grp.userData.tail = tailGrp;
    return grp;
  }

  /* ---- a stegosaur: double row of back plates + tail spikes ---- */
  makeStegosaur(color, plateColor) {
    const THREE = window.THREE; const grp = new THREE.Group();
    const mat = this._eraMat(color, 0x000000, 0, 0.95);
    const plateM = this._eraMat(plateColor, 0x000000, 0, 0.9);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.68, 18, 14), mat); body.scale.set(1.7, 1.0, 1.05); body.position.y = 0.98; grp.add(body);
    // low head on a short neck
    const neckGrp = new THREE.Group(); neckGrp.position.set(1.0, 0.95, 0);
    const neck = this._tube([[0, 0, 0], [0.32, -0.1, 0], [0.6, -0.22, 0]], 0.14, mat, 8); neckGrp.add(neck);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), mat); head.scale.set(1.5, 0.8, 0.9); head.position.set(0.72, -0.26, 0); neckGrp.add(head);
    grp.add(neckGrp);
    // the iconic double row of alternating plates
    for (let i = 0; i < 5; i++) {
      [0.1, -0.1].forEach((z, r) => {
        const pl = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 4), plateM);
        pl.position.set(0.85 - i * 0.42 - r * 0.2, 1.62 - Math.abs(i - 2) * 0.12, z);
        pl.scale.z = 0.3; grp.add(pl);
      });
    }
    // tail with thagomizer spikes
    const tailGrp = new THREE.Group(); tailGrp.position.set(-1.1, 0.9, 0);
    const tail = this._tube([[0, 0, 0], [-0.8, -0.15, 0.1], [-1.5, -0.5, 0.2], [-1.95, -0.8, 0.25]], 0.13, mat, 12); tailGrp.add(tail);
    [[0.12], [-0.12]].forEach(([z]) => { const spike = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.42, 6), plateM); spike.position.set(-1.9, -0.62, 0.25 + z); spike.rotation.z = 0.9; tailGrp.add(spike); });
    grp.add(tailGrp);
    [[0.7, 0.36], [0.7, -0.36], [-0.72, 0.36], [-0.72, -0.36]].forEach(([x, z]) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 0.85, 8), mat); leg.position.set(x, 0.43, z); grp.add(leg);
    });
    grp.userData.neck = neckGrp; grp.userData.tail = tailGrp;
    return grp;
  }

  /* ---- 🦕 primordial jungle: forest, ferns, volcano, real dinosaurs ---- */
  buildDinoEra() {
    const THREE = window.THREE; const g = new THREE.Group(); const movers = [];
    g.userData.follow = true;
    g.add(this._ground(0x13240f, 34));
    const dense = this.tier === 'ultra' ? 130 : this.tier === 'low' ? 45 : 90;
    // jungle canopy trees (instanced trunks + blob canopies share the scatter seed -> aligned)
    const trunkMat = this._eraMat(0x2c1f12);
    this._scatterInst(g, new THREE.CylinderGeometry(0.09, 0.16, 2.7, 7), trunkMat, dense, 6.5, 27, 7, -3.4 + 1.3, 0.8, 1.9);
    this._scatterInst(g, new THREE.IcosahedronGeometry(1.05, 1), this._eraMat(0x1b4a22, 0x0a2410, 0.12), dense, 6.5, 27, 7, -3.4 + 3.1, 0.8, 1.9);
    // ferns near the ground
    this._scatterInst(g, new THREE.ConeGeometry(0.4, 0.55, 6), this._eraMat(0x2a6a30, 0x123a16, 0.15), Math.round(dense * 0.6), 5.2, 22, 21, -3.4 + 0.26, 0.6, 1.4);
    // volcano on the horizon with a flickering caldera + smoke
    const volcano = new THREE.Mesh(new THREE.ConeGeometry(4.6, 8.5, 7), this._eraMat(0x1a140e)); volcano.position.set(-13, -3.4 + 4.2, -22); g.add(volcano);
    const lava = new THREE.Mesh(new THREE.SphereGeometry(1.1, 14, 12), this._eraMat(0x2a0d04, 0xff5a1e, 1.3)); lava.position.set(-13, 5.2, -22); g.add(lava); movers.push({ mesh: lava, kind: 'flicker', base: 0.9, ph: 0 });
    for (let i = 0; i < 3; i++) { const sm = this._sunSprite(90, 80, 78, 2.6 + i, [-13, 6.5 + i * 1.4, -22], 0.16); g.add(sm); movers.push({ mesh: sm, kind: 'rise', y0: 6.5 + i * 1.4, h: 3, sp: 0.5, ph: i * 1.1, o: 0.16 }); }
    // low warm sun through the haze
    g.add(this._sunSprite(255, 150, 70, 16, [14, 2.5, -30], 0.5));
    // dinosaurs — the stars of the era
    const s1 = this.makeSauropod(0x3d5a33); s1.position.set(-6.8, -3.4, -8.5); s1.scale.setScalar(1.2); g.add(s1);
    movers.push({ mesh: s1, kind: 'dino', neck: s1.userData.neck, tail: s1.userData.tail, y0: -3.4, ph: 0 });
    const s2 = this.makeSauropod(0x46543a); s2.position.set(6.2, -3.4, -11); s2.rotation.y = Math.PI * 0.85; s2.scale.setScalar(0.92); g.add(s2);
    movers.push({ mesh: s2, kind: 'dino', neck: s2.userData.neck, tail: s2.userData.tail, y0: -3.4, ph: 2.2 });
    const rex = this.makeTheropod(0x5a4a30); rex.position.set(3.6, -3.4, -5.5); rex.rotation.y = -Math.PI * 0.3; rex.scale.setScalar(0.95); g.add(rex);
    movers.push({ mesh: rex, kind: 'dino', neck: rex.userData.neck, tail: rex.userData.tail, y0: -3.4, ph: 4.1 });
    // a baby sauropod shadowing the adult, and a grazing stegosaur
    const baby = this.makeSauropod(0x55764a); baby.position.set(-4.5, -3.4, -7.0); baby.rotation.y = 0.55; baby.scale.setScalar(0.48); g.add(baby);
    movers.push({ mesh: baby, kind: 'dino', neck: baby.userData.neck, tail: baby.userData.tail, y0: -3.4, ph: 1.3 });
    const stego = this.makeStegosaur(0x4a5236, 0x8a5c34); stego.position.set(0.4, -3.4, -10); stego.rotation.y = 2.5; stego.scale.setScalar(1.05); g.add(stego);
    movers.push({ mesh: stego, kind: 'dino', neck: stego.userData.neck, tail: stego.userData.tail, y0: -3.4, ph: 3.2 });
    // a still jungle pond (env-map reflections make it read as water)
    const pond = new THREE.Mesh(new THREE.CircleGeometry(2.1, 28), new THREE.MeshPhysicalMaterial({ color: 0x0e2a2e, metalness: 0.85, roughness: 0.12, envMapIntensity: 1.6 }));
    pond.rotation.x = -Math.PI / 2; pond.position.set(4.6, -3.34, -7.5); g.add(pond);
    // mossy rocks + fallen logs
    this._scatterInst(g, new THREE.DodecahedronGeometry(0.42, 0), this._eraMat(0x1c241a), 20, 5.5, 24, 33, -3.4 + 0.22, 0.5, 1.4);
    const logGeo = new THREE.CylinderGeometry(0.13, 0.17, 1.7, 7); logGeo.rotateZ(Math.PI / 2);
    this._scatterInst(g, logGeo, this._eraMat(0x241a10), 12, 6, 22, 43, -3.4 + 0.14, 0.7, 1.4);
    // distant mountain ridge closes the horizon
    this._scatterInst(g, new THREE.ConeGeometry(3.2, 5.6, 5), this._eraMat(0x0e160b), 14, 28, 33, 53, -3.4 + 2.6, 1.0, 2.1);
    // low ground mist
    g.add(this._sunSprite(120, 150, 120, 12, [-5, -2.6, -10], 0.07));
    g.add(this._sunSprite(120, 150, 120, 10, [6, -2.7, -13], 0.06));
    // gliding pterosaurs
    for (let i = 0; i < 3; i++) {
      const p = new THREE.Group(); const w = this._eraMat(0x241a10);
      [-1, 1].forEach((s) => { const wing = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 0.34), w); wing.position.x = s * 0.65; wing.rotation.z = s * 0.45; p.add(wing); });
      const bd = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.5, 6), w); bd.rotation.x = Math.PI / 2; p.add(bd);
      p.position.set((i - 1) * 4, 3.5 + i, -9); g.add(p);
      movers.push({ mesh: p, kind: 'glide', x0: (i - 1) * 4, y0: 3.5 + i, sp: 1.2 + i * 0.4, span: 26, ph: i * 2.1 });
    }
    g.userData.movers = movers; return g;
  }

  /* ---- 🏰 dusk kingdom: castle on a hill, torches, banners, pines, moon ---- */
  buildKingdomEra() {
    const THREE = window.THREE; const g = new THREE.Group(); const movers = [];
    g.userData.follow = true;
    g.add(this._ground(0x1c1712, 34));
    const stone = this._eraMat(0x3a332b, 0x000000, 0, 0.98), roofM = this._eraMat(0x30171d);
    // hill + keep
    const hill = new THREE.Mesh(new THREE.ConeGeometry(7.5, 3.6, 9), this._eraMat(0x211b14)); hill.position.set(0, -3.4 + 1.6, -16); g.add(hill);
    const keep = new THREE.Mesh(new THREE.BoxGeometry(4.4, 3.6, 3.4), stone); keep.position.set(0, 0.6, -16); g.add(keep);
    const keepRoof = new THREE.Mesh(new THREE.ConeGeometry(3.1, 1.6, 4), roofM); keepRoof.position.set(0, 3.2, -16); keepRoof.rotation.y = Math.PI / 4; g.add(keepRoof);
    // four corner towers with conical roofs
    [[-2.6, -14.6], [2.6, -14.6], [-2.6, -17.4], [2.6, -17.4]].forEach(([x, z]) => {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.72, 4.6, 10), stone); t.position.set(x, 0.9, z); g.add(t);
      const r = new THREE.Mesh(new THREE.ConeGeometry(0.85, 1.5, 10), roofM); r.position.set(x, 3.9, z); g.add(r);
    });
    // curtain wall + gate
    const wall = new THREE.Mesh(new THREE.BoxGeometry(7.4, 1.5, 0.5), stone); wall.position.set(0, -2.0, -13.9); g.add(wall);
    const gate = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.4, 0.6), this._eraMat(0x120b06)); gate.position.set(0, -2.1, -13.85); g.add(gate);
    // warm windows (emissive) + torches that flicker
    const winM = this._eraMat(0x1a0e06, 0xffb851, 1.6);
    for (let i = 0; i < 6; i++) { const w = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.4), winM); w.position.set(-1.5 + (i % 3) * 1.5, 0.3 + Math.floor(i / 3) * 1.2, -14.28); g.add(w); }
    [[-3.6, -13.6], [3.6, -13.6]].forEach(([x, z], i) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.2, 6), stone); post.position.set(x, -2.4, z); g.add(post);
      const fl = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), this._eraMat(0x381505, 0xff9a3c, 1.8)); fl.position.set(x, -1.7, z); g.add(fl);
      movers.push({ mesh: fl, kind: 'flicker', base: 1.4, ph: i * 1.7 });
      g.add(this._sunSprite(255, 165, 80, 1.6, [x, -1.7, z], 0.5));
    });
    // banners on poles
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3, 6), stone); pole.position.y = 1.5; b.add(pole);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.62), this._eraMat(0x6a1f2c, 0x431018, 0.4)); flag.material.side = THREE.DoubleSide; flag.position.set(0.55, 2.6, 0); b.add(flag);
      b.position.set(-4 + i * 4, -3.4, -10.5); g.add(b);
      movers.push({ mesh: flag, kind: 'wave', ph: i });
    }
    // pine forest ring + village huts
    const dense = this.tier === 'ultra' ? 90 : this.tier === 'low' ? 30 : 60;
    this._scatterInst(g, new THREE.ConeGeometry(0.62, 2.4, 7), this._eraMat(0x14261a), dense, 8, 26, 31, -3.4 + 1.2, 0.8, 1.7);
    this._scatterInst(g, new THREE.BoxGeometry(0.9, 0.7, 0.9), this._eraMat(0x2b2117, 0xffb851, 0.12), 14, 9, 20, 41, -3.4 + 0.35, 0.8, 1.3);
    // crenellations along the curtain wall (single instanced mesh)
    const cren = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.28, 0.5), stone, 12);
    const dd = new THREE.Object3D();
    for (let i = 0; i < 12; i++) { dd.position.set(-3.3 + i * 0.6, -1.12, -13.9); dd.updateMatrix(); cren.setMatrixAt(i, dd.matrix); }
    cren.instanceMatrix.needsUpdate = true; g.add(cren);
    // windmill on the eastern rise, blades turning
    const mill = new THREE.Group();
    const mTower = new THREE.Mesh(new THREE.ConeGeometry(0.85, 2.6, 7), stone); mTower.position.y = 1.3; mill.add(mTower);
    const mCap = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 8), roofM); mCap.position.y = 2.7; mill.add(mCap);
    const blades = new THREE.Group();
    for (let i = 0; i < 4; i++) { const bl = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 1.7), this._eraMat(0x241c12)); bl.material.side = THREE.DoubleSide; bl.position.y = 0.75; const piv = new THREE.Group(); piv.rotation.z = i * Math.PI / 2; piv.add(bl); blades.add(piv); }
    blades.position.set(0, 2.55, 0.5); mill.add(blades);
    mill.position.set(9.5, -3.4, -13); g.add(mill);
    movers.push({ mesh: blades, kind: 'spin', sp: 0.45 });
    // chimney smoke from the keep
    for (let k = 0; k < 2; k++) { const sm = this._sunSprite(120, 110, 100, 1.6 + k, [0.9, 3.9 + k * 1.1, -16], 0.12); g.add(sm); movers.push({ mesh: sm, kind: 'rise', y0: 3.9 + k * 1.1, h: 2.6, sp: 0.4, ph: k * 1.3, o: 0.12 }); }
    // cobble road to the gate + market stalls
    const road = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 7), this._eraMat(0x241d15, 0x000000, 0, 1)); road.rotation.x = -Math.PI / 2; road.position.set(0, -3.36, -10.4); g.add(road);
    [[-1.8, -9.4, 0x6a1f2c], [1.9, -9.8, 0x2c4a6a]].forEach(([x, z, c]) => {
      const stall = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.7), this._eraMat(0x2b2117)); stall.position.set(x, -3.4 + 0.28, z); g.add(stall);
      const canopy = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 0.8), this._eraMat(c, c, 0.15)); canopy.material.side = THREE.DoubleSide; canopy.rotation.x = -0.35; canopy.position.set(x, -3.4 + 0.85, z); g.add(canopy);
    });
    // mountains on the horizon
    this._scatterInst(g, new THREE.ConeGeometry(3.4, 5.2, 5), this._eraMat(0x181209), 12, 28, 33, 63, -3.4 + 2.4, 1.0, 2.0);
    // moon
    g.add(this._sunSprite(210, 220, 255, 9, [-12, 7, -28], 0.55));
    // ravens
    for (let i = 0; i < 3; i++) {
      const r = new THREE.Group(); const w = this._eraMat(0x0a0908);
      [-1, 1].forEach((s) => { const wing = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.18), w); wing.position.x = s * 0.28; wing.rotation.z = s * 0.6; r.add(wing); });
      r.position.set((i - 1) * 5, 4 + i, -8); g.add(r);
      movers.push({ mesh: r, kind: 'glide', x0: (i - 1) * 5, y0: 4 + i, sp: 1.6 + i * 0.3, span: 26, ph: i * 1.7 });
    }
    g.userData.movers = movers; return g;
  }

  /* ---- ☄️ burning world: charred ground, ruins, embers, smoke columns ---- */
  buildApocalypseEra() {
    const THREE = window.THREE; const g = new THREE.Group(); const movers = [];
    g.userData.follow = true;
    g.add(this._ground(0x171008, 34));
    // shattered building shells, tilted
    this._scatterInst(g, new THREE.BoxGeometry(1.6, 4.2, 1.6), this._eraMat(0x1c130c, 0x38120a, 0.25), this.tier === 'low' ? 10 : 18, 8, 24, 51, -3.4 + 1.6, 0.7, 1.6);
    // burning rubble field (shared-material flicker)
    const rubbleM = this._eraMat(0x241108, 0xff4a1a, 0.7);
    this._scatterInst(g, new THREE.TetrahedronGeometry(0.5, 0), rubbleM, this.tier === 'low' ? 20 : 40, 5, 22, 61, -3.4 + 0.3, 0.6, 1.5);
    movers.push({ mesh: { material: rubbleM }, kind: 'flicker', base: 0.55, ph: 0 });
    // foreground smouldering boulders
    for (let i = 0; i < 4; i++) {
      const r = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7 + (i % 2) * 0.3, 0), this._eraMat(0x1a0e09, 0xff4a1a, 0.6));
      r.position.set((i - 1.5) * 4.4, -3.4 + 0.5, -7 - (i % 2) * 2); g.add(r);
      movers.push({ mesh: r, kind: 'flicker', base: 0.45, ph: i });
    }
    // rising smoke columns
    [[-8, -14], [5, -18], [11, -10]].forEach(([x, z], i) => {
      for (let k = 0; k < 3; k++) {
        const sm = this._sunSprite(70, 60, 58, 3 + k * 1.2, [x, -1 + k * 1.6, z], 0.14);
        g.add(sm); movers.push({ mesh: sm, kind: 'rise', y0: -1 + k * 1.6, h: 4, sp: 0.6, ph: i * 2 + k, o: 0.14 });
      }
    });
    // glowing ground fissures radiating heat
    const fisM = this._eraMat(0x1a0a04, 0xff3a10, 1.1);
    for (let i = 0; i < 6; i++) {
      const a = i * 1.05 + 0.4, r = 4.5 + (i % 3) * 1.6;
      const fis = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.04, 0.14), fisM);
      fis.position.set(Math.cos(a) * r, -3.36, Math.sin(a) * r); fis.rotation.y = a + 0.6; g.add(fis);
    }
    movers.push({ mesh: { material: fisM }, kind: 'flicker', base: 0.85, ph: 2.5 });
    // leaning power poles with a sagging line
    const poleM = this._eraMat(0x140d08);
    const poles = [[-6, -9, 0.22], [-1.5, -11, -0.16], [3.5, -9.5, 0.3]];
    poles.forEach(([x, z, lean]) => { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.4, 6), poleM); p.position.set(x, -3.4 + 1.6, z); p.rotation.z = lean; g.add(p); const cross = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.06), poleM); cross.position.set(x + lean * 2.6, -3.4 + 3.0, z); cross.rotation.z = lean; g.add(cross); });
    g.add(this._tube([[-5.5, -0.45, -9], [-3.6, -0.9, -10], [-1.2, -0.5, -11]], 0.015, poleM, 10));
    g.add(this._tube([[-1.2, -0.5, -11], [1.2, -1.0, -10.2], [3.9, -0.35, -9.5]], 0.015, poleM, 10));
    // burning city skyline + fire glows that pulse
    this._scatterInst(g, new THREE.BoxGeometry(1.8, 5.5, 1.8), this._eraMat(0x120a06, 0x2a0d04, 0.35), 16, 26, 32, 73, -3.4 + 2.4, 0.8, 1.9);
    [[-18, -26], [8, -28], [22, -24]].forEach(([x, z], i) => {
      const fire = this._sunSprite(255, 110, 40, 5.5, [x, -1.4, z], 0.3); g.add(fire);
      movers.push({ mesh: fire, kind: 'pulse', base: 0.28, amp: 0.14, sp: 2.2, ph: i * 1.9 });
    });
    // blood-red sun
    g.add(this._sunSprite(255, 80, 40, 14, [8, 4, -30], 0.6));
    g.userData.movers = movers; return g;
  }

  /* ---- 🌿 reclaimed dawn: overgrown ruins, rubble, a sprout, a lone bird ---- */
  buildPostEra() {
    const THREE = window.THREE; const g = new THREE.Group(); const movers = [];
    g.userData.follow = true;
    g.add(this._ground(0x181a12, 34));
    const concrete = this._eraMat(0x2b2d24, 0x000000, 0, 0.98), vineM = this._eraMat(0x1e3a1c, 0x2f6a2c, 0.3);
    // ruined towers: broken stacked storeys + exposed rebar + climbing vines
    [[-7.5, 7, -14], [-2.5, 10, -17], [4, 8.5, -13], [9, 12, -18]].forEach(([x, h, z], i) => {
      let y = -3.4;
      const storeys = Math.round(h / 2.4);
      for (let k = 0; k < storeys; k++) {
        const sw = 2.6 - k * 0.12;
        const b = new THREE.Mesh(new THREE.BoxGeometry(sw, 2.1, sw), concrete);
        b.position.set(x + (k % 2 ? 0.14 : -0.1), y + 1.05, z + (k % 2 ? -0.1 : 0.12));
        b.rotation.y = (k % 2 ? 0.06 : -0.05); g.add(b); y += 2.15;
      }
      for (let k = 0; k < 3; k++) { const rb = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.1, 5), this._eraMat(0x4a3226)); rb.position.set(x - 0.6 + k * 0.55, y + 0.4, z); rb.rotation.z = (k - 1) * 0.5; g.add(rb); }
      const vine = this._tube([[x - 1.2, -3.4, z + 1.3], [x - 1.35, -3.4 + h * 0.4, z + 1.32], [x - 1.1, -3.4 + h * 0.75, z + 1.2]], 0.08, vineM, 10); g.add(vine);
    });
    // rubble field + young returning trees
    this._scatterInst(g, new THREE.DodecahedronGeometry(0.35, 0), concrete, this.tier === 'low' ? 18 : 36, 5, 20, 71, -3.4 + 0.2, 0.6, 1.6);
    this._scatterInst(g, new THREE.ConeGeometry(0.4, 1.5, 6), this._eraMat(0x24422a, 0x102410, 0.18), this.tier === 'low' ? 12 : 26, 7, 24, 81, -3.4 + 0.75, 0.7, 1.5);
    // the sprout of hope — small, glowing, front and centre-right
    const sprout = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.5, 6), this._eraMat(0x1c4a22, 0x4fd06a, 1.2)); sprout.position.set(2.2, -3.4 + 0.25, -4.5); g.add(sprout);
    movers.push({ mesh: sprout, kind: 'flicker', base: 0.9, ph: 0.5 });
    g.add(this._sunSprite(120, 230, 140, 2.2, [2.2, -3.0, -4.5], 0.4));
    // collapsed overpass: two piers, one deck slab down
    const pierM = this._eraMat(0x272921, 0x000000, 0, 0.98);
    [[-6.5, -9.5], [-3.6, -9.5]].forEach(([x, z]) => { const pier = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2.3, 0.6), pierM); pier.position.set(x, -3.4 + 1.15, z); g.add(pier); });
    const deckUp = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.22, 1.3), pierM); deckUp.position.set(-5.05, -3.4 + 2.35, -9.5); g.add(deckUp);
    const deckDown = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.22, 1.3), pierM); deckDown.position.set(-1.4, -3.4 + 1.15, -9.5); deckDown.rotation.z = -0.62; g.add(deckDown);
    // rusted car husks + reclaiming grass
    const carGeo = new THREE.BoxGeometry(0.95, 0.34, 0.45);
    this._scatterInst(g, carGeo, this._eraMat(0x4a3226, 0x1c0f08, 0.12), this.tier === 'low' ? 6 : 12, 5.5, 18, 91, -3.4 + 0.18, 0.8, 1.25);
    this._scatterInst(g, new THREE.ConeGeometry(0.12, 0.34, 5), this._eraMat(0x2e5a2e, 0x142a14, 0.2), this.tier === 'low' ? 24 : 48, 4.5, 20, 101, -3.4 + 0.16, 0.7, 1.5);
    // a second bird + two butterflies drifting low
    const bird2 = new THREE.Group();
    [-1, 1].forEach((s) => { const wing = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.17), this._eraMat(0x101210)); wing.position.x = s * 0.28; wing.rotation.z = s * 0.5; bird2.add(wing); });
    bird2.position.set(3, 6.2, -11); g.add(bird2);
    movers.push({ mesh: bird2, kind: 'glide', x0: 3, y0: 6.2, sp: 0.9, span: 26, ph: 3.4 });
    for (let i = 0; i < 2; i++) {
      const bf = new THREE.Group();
      [-1, 1].forEach((s) => { const w = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.12), this._eraMat(0x8a6a2c, 0x8a6a2c, 0.5)); w.material.side = THREE.DoubleSide; w.position.x = s * 0.05; w.rotation.z = s * 0.5; bf.add(w); });
      bf.position.set(1.5 + i * 1.6, -2.2, -4.5 - i); g.add(bf);
      movers.push({ mesh: bf, kind: 'glide', x0: 1.5 + i * 1.6, y0: -2.2 + i * 0.3, sp: 0.35 + i * 0.2, span: 7, ph: i * 2.4 });
    }
    // pale dawn sun breaking through
    g.add(this._sunSprite(235, 220, 190, 13, [-10, 5, -30], 0.5));
    // a lone returning bird
    const bird = new THREE.Group();
    [-1, 1].forEach((s) => { const wing = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.03, 0.2), this._eraMat(0x101210)); wing.position.x = s * 0.33; wing.rotation.z = s * 0.55; bird.add(wing); });
    bird.position.set(-4, 5, -9); g.add(bird);
    movers.push({ mesh: bird, kind: 'glide', x0: -4, y0: 5, sp: 1.1, span: 24, ph: 0 });
    g.userData.movers = movers; return g;
  }

  buildTimeTravelUI() {
    if (document.getElementById('time-dial') || !this.ERAS) return;
    const wrap = document.createElement('div'); wrap.id = 'time-dial';
    wrap.style.cssText = 'position:fixed;right:14px;top:50%;transform:translateY(-50%);z-index:69;display:flex;flex-direction:column;gap:7px;align-items:flex-end;';
    ['dino', 'kingdom', 'space', 'apocalypse', 'post'].forEach((k) => {
      const e = this.ERAS[k]; const b = document.createElement('button'); b.dataset.era = k; b.setAttribute('aria-label', e.name);
      b.innerHTML = '<span style="font-size:15px;line-height:1;">' + e.emoji + '</span><span class="td-label">' + e.name + '</span>';
      b.style.cssText = 'display:inline-flex;align-items:center;gap:8px;padding:8px 13px;border-radius:999px;border:1px solid var(--line);background:rgba(12,12,18,0.72);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);color:#c9ccd8;font:600 12px Space Grotesk,sans-serif;letter-spacing:0.02em;cursor:pointer;white-space:nowrap;transition:border-color .3s,background .3s,color .3s;';
      b.addEventListener('click', () => this.switchEra(k));
      wrap.appendChild(b);
    });
    document.body.appendChild(wrap); this._timeDial = wrap; this.markEraUI();
  }

  markEraUI() {
    if (!this._timeDial) return;
    this._timeDial.querySelectorAll('button').forEach((b) => {
      const on = b.dataset.era === this.era;
      b.style.borderColor = on ? 'var(--accent)' : 'var(--line)';
      b.style.background = on ? 'rgba(139,92,246,0.22)' : 'rgba(12,12,18,0.72)';
      b.style.color = on ? '#fff' : '#c9ccd8';
    });
  }

  /* =====================================================================
     APOCALYPSE — reversible asteroid-bombardment set-piece.
     Warning -> staggered impacts (bounded shake, soft spaced flashes,
     shockwaves) -> name letters scatter into debris + cracks spread ->
     IMPACT card -> REBUILD plays the one master timeline in reverse.
     Safety: no strobe (impacts >=0.46s apart, luminance-limited), reduced
     motion = calm crossfade, mobile/low = fewer asteroids.
     ===================================================================== */
  buildCracksDataURI() {
    const W = 1200, H = 800, fx = 600, fy = 320; let paths = '';
    const sd = (n) => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };
    for (let i = 0; i < 16; i++) {
      let x = fx, y = fy, a = (i / 16) * Math.PI * 2 + sd(i) * 0.3, d = 'M' + x.toFixed(0) + ',' + y.toFixed(0);
      const segs = 5 + Math.floor(sd(i + 9) * 4);
      for (let j = 0; j < segs; j++) { const len = 38 + sd(i * 7 + j) * 95; a += (sd(i * 3 + j) - 0.5) * 0.7; x += Math.cos(a) * len; y += Math.sin(a) * len; d += ' L' + x.toFixed(0) + ',' + y.toFixed(0); }
      paths += '<path d="' + d + '" stroke="rgba(232,236,246,0.55)" stroke-width="' + (2.2 - (i % 3) * 0.5).toFixed(1) + '" fill="none"/>';
    }
    return 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">' + paths + '</svg>');
  }

  // foreground DOM asteroids: they fly OVER the page content and visibly slam into it
  spawnApocalypseAsteroids(count) {
    const layer = document.getElementById('apoc-front'); if (!layer) return;
    layer.innerHTML = ''; this._asteroids = []; this._apocDecals = [];
    const g = this.gsap; const W = window.innerWidth, H = window.innerHeight;
    const pts = [[0.5, 0.36], [0.28, 0.5], [0.72, 0.44], [0.4, 0.6], [0.6, 0.54], [0.5, 0.46]];
    for (let i = 0; i < count; i++) {
      const tx = pts[i % pts.length][0] * W, ty = pts[i % pts.length][1] * H;
      const side = i % 2 ? 1 : -1;
      const fx = tx + side * (W * 0.28), fy = -90 - i * 30; // just above the top edge so the descent is ON-screen almost immediately
      const ang = Math.atan2(ty - fy, tx - fx) * 180 / Math.PI;
      const size = 70 + (i % 3) * 22; // bigger, clearly visible
      const el = document.createElement('div');
      el.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;will-change:transform;pointer-events:none;';
      el.innerHTML =
        '<div style="position:absolute;left:0;top:0;width:340px;height:' + Math.max(16, size * 0.55) + 'px;transform:translate(-100%,-50%);background:linear-gradient(to left, rgba(255,236,170,0.98), rgba(255,140,50,0.6) 38%, transparent);filter:blur(5px);border-radius:50%;"></div>'
        + '<div style="position:absolute;left:0;top:0;width:' + Math.round(size * 2.3) + 'px;height:' + Math.round(size * 2.3) + 'px;transform:translate(-50%,-50%);border-radius:50%;background:radial-gradient(circle, rgba(255,170,80,0.55), rgba(255,120,40,0.2) 45%, transparent 68%);mix-blend-mode:screen;"></div>'
        + '<div data-rock style="position:absolute;left:0;top:0;width:' + size + 'px;height:' + size + 'px;transform:translate(-50%,-50%);border-radius:46% 54% 52% 48%;background:radial-gradient(circle at 34% 30%, #8a7565, #45362c 55%, #1c150f);box-shadow:0 0 36px 11px rgba(255,120,40,0.7), inset -6px -6px 12px rgba(0,0,0,0.7);"></div>';
      layer.appendChild(el);
      const rock = el.querySelector('[data-rock]');
      if (g) { g.set(el, { x: fx, y: fy, rotation: ang, scale: 0.8 }); el._spin = g.to(rock, { rotation: 360, duration: 1.0, repeat: -1, ease: 'none' }); }
      this._asteroids.push({ el, rock, fx, fy, tx, ty, ang });
    }
  }

  disposeAsteroids() {
    (this._apocTweens || []).forEach((tw) => { try { tw.kill(); } catch (e) {} }); // stop any transient impact tweens still running
    (this._asteroids || []).forEach((a) => { try { if (a.el._spin) a.el._spin.kill(); a.el.remove(); } catch (e) {} });
    (this._apocDecals || []).forEach((d) => { try { d.remove(); } catch (e) {} });
    this._asteroids = []; this._apocDecals = []; this._apocTweens = [];
    const layer = document.getElementById('apoc-front'); if (layer) layer.innerHTML = '';
  }

  buildCrackBurstURI() {
    if (this._crackBurstURI) return this._crackBurstURI;
    const C = 150; let p = ''; const sd = (n) => { const x = Math.sin(n * 91.7) * 43758.5; return x - Math.floor(x); };
    for (let i = 0; i < 11; i++) {
      let x = C, y = C, a = (i / 11) * 6.283 + sd(i) * 0.4, d = 'M' + C + ',' + C; const segs = 3 + Math.floor(sd(i + 5) * 3);
      for (let j = 0; j < segs; j++) { const len = 18 + sd(i * 5 + j) * 42; a += (sd(i * 2 + j) - 0.5) * 0.8; x += Math.cos(a) * len; y += Math.sin(a) * len; d += ' L' + x.toFixed(0) + ',' + y.toFixed(0); }
      p += '<path d="' + d + '" stroke="rgba(235,240,250,0.7)" stroke-width="1.6" fill="none"/>';
    }
    this._crackBurstURI = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">' + p + '</svg>');
    return this._crackBurstURI;
  }

  handleApocalypse() {
    if (this.worldPhase !== 'idle') return;
    this.worldPhase = 'apocalypse'; this._savedScroll = window.scrollY || window.pageYOffset || 0;
    this._eraBeforeApoc = this.era; // arc: bombardment resolves into Post-Apocalypse; REBUILD restores this era
    try { history.pushState({ universe: 'apoc' }, ''); this._pushedHistory = true; } catch (e) {}
    this.lockLawBar(true); this.toast('INCOMING — brace for impact');
    const g = this.gsap;
    const count = this.tier === 'ultra' ? 6 : this.tier === 'low' ? 3 : 5;
    if (!this.prefersReduced) this.spawnApocalypseAsteroids(count);
    if (!g) { this.showImpactCard(); return; }
    if (this._apocTl) { try { this._apocTl.kill(); } catch (e) {} } // release any prior timeline deterministically
    this._apocTl = this.buildApocalypseTimeline(); this._apocTl.play();
  }

  buildApocalypseTimeline() {
    const g = this.gsap; const D = 4.5;
    const fx = document.getElementById('apoc-fx'); const cracks = document.getElementById('apoc-cracks');
    if (cracks && !cracks.style.backgroundImage) cracks.style.backgroundImage = 'url("' + this.buildCracksDataURI() + '")';
    g.set(fx, { opacity: 0 }); if (cracks) g.set(cracks, { opacity: 0, scale: 0.96, transformOrigin: '50% 42%' });
    this._apocShake.amp = 0;
    const tl = g.timeline({ paused: true, onComplete: () => this.showImpactCard(), onReverseComplete: () => this.onRebuildComplete() });
    if (this.prefersReduced) {
      tl.to(fx, { opacity: 1, duration: 1.0, ease: 'power1.inOut' }, 0);
      if (cracks) tl.to(cracks, { opacity: 0.7, scale: 1, duration: 1.0, ease: 'power1.inOut' }, 0);
      return tl;
    }
    tl.to(fx, { opacity: 1, duration: 1.0, ease: 'power2.in' }, 0); // crimson warning sky
    (this._asteroids || []).forEach((a, i) => {
      const at = 1.2 + i * 0.6; // clearly spaced, distinct strikes (>=0.6s apart -> no strobe)
      // slow, fully on-screen descent so each asteroid is unmistakable
      tl.fromTo(a.el, { x: a.fx, y: a.fy, rotation: a.ang, scale: 0.85, opacity: 1 }, { x: a.tx, y: a.ty, scale: 1.5, duration: 1.15, ease: 'power1.in' }, at - 1.15);
      tl.call(() => this.impactEffect(i, a), null, at);          // SLAM into the page
      tl.to(a.el, { scale: 0.72, duration: 0.3, ease: 'power2.out' }, at); // EMBEDS and stays visible through the aftermath (not vanished)
    });
    if (cracks) tl.to(cracks, { opacity: 0.92, scale: 1, duration: 2.2, ease: 'power2.out' }, 1.3); // cracks spread
    tl.to({}, { duration: 0.2 }, D - 0.2); // resolve exactly at 4.5s
    return tl;
  }

  impactEffect(i, a) {
    if (!this._apocTl || this._apocTl.reversed()) return; // forward-only transients
    const g = this.gsap; const layer = document.getElementById('apoc-front'); if (!g || !layer) return;
    const x = a.tx, y = a.ty;
    const add = (html, css) => { const d = document.createElement('div'); d.style.cssText = 'position:absolute;left:' + x + 'px;top:' + y + 'px;pointer-events:none;' + css; if (html) d.innerHTML = html; layer.appendChild(d); (this._apocDecals = this._apocDecals || []).push(d); return d; };
    const tween = (tw) => { (this._apocTweens = this._apocTweens || []).push(tw); return tw; }; // track so REBUILD mid-bombardment can kill them
    // soft, luminance-limited impact flash at the hit point
    const fl = add('', 'width:10px;height:10px;margin:-5px 0 0 -5px;border-radius:50%;background:radial-gradient(circle, rgba(255,240,200,0.95), rgba(255,150,60,0.5) 40%, transparent 70%);mix-blend-mode:screen;');
    tween(g.fromTo(fl, { scale: 0, opacity: 0.9 }, { scale: 42, opacity: 0, duration: 0.5, ease: 'power2.out', onComplete: () => fl.remove() }));
    // expanding shockwave ring
    const sw = add('', 'width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;border:3px solid rgba(255,200,140,0.9);');
    tween(g.fromTo(sw, { scale: 0, opacity: 0.95 }, { scale: 34, opacity: 0, duration: 0.8, ease: 'power2.out', onComplete: () => sw.remove() }));
    // crack burst that persists (cleared on REBUILD)
    const ck = add('<img alt="" src="' + this.buildCrackBurstURI() + '" style="position:absolute;left:-150px;top:-150px;width:300px;height:300px;">', 'width:0;height:0;');
    tween(g.fromTo(ck.firstChild, { opacity: 0, scale: 0.5 }, { opacity: 0.85, scale: 1, duration: 0.3, ease: 'power2.out' }));
    // bounded shake of the page content + the 3D camera
    if (!this.prefersReduced) {
      const root = document.getElementById('universe-root');
      if (root) g.fromTo(root, { x: 0, y: 0 }, { x: 7, y: -5, duration: 0.05, repeat: 5, yoyo: true, ease: 'power1.inOut', onComplete: () => g.set(root, { x: 0, y: 0 }) });
      g.to(this._apocShake, { amp: 0.5, duration: 0.07, ease: 'power2.out' }); g.to(this._apocShake, { amp: 0, duration: 0.7, delay: 0.07, ease: 'power2.out' });
    }
    this.burst(x, y); if (this.laws && this.laws.sound) this.blip(0.8); this.scatterDebris();
  }

  scatterDebris() {
    if (!this.engine) return; const M = window.Matter; const cx = window.innerWidth / 2, cy = window.innerHeight * 0.42;
    this.bodies.forEach((b, k) => {
      if (b.consumed) return; M.Sleeping.set(b.body, false);
      const dx = b.body.position.x - cx, dy = b.body.position.y - cy; const d = Math.max(40, Math.hypot(dx, dy)); const f = 0.05 * b.body.mass;
      M.Body.applyForce(b.body, b.body.position, { x: dx / d * f, y: dy / d * f + 0.022 * b.body.mass });
      M.Body.setAngularVelocity(b.body, ((k % 5) - 2) * 0.12); // deterministic tumble
    });
  }

  showImpactCard() {
    this.worldPhase = 'impacted';
    // arm the recovery safety FIRST, before any early-return, so the site is never left broken
    this._apocAuto = setTimeout(() => { if (this.worldPhase === 'impacted') this.rebuild(); }, 14000);
    const g = this.gsap; const card = document.getElementById('impact-card'); const title = document.getElementById('impact-title'); const btn = document.getElementById('rebuild-btn');
    if (!card) return; card.style.display = 'flex';
    if (g && title && btn) {
      g.fromTo(title, { opacity: 0, scale: 1.1, letterSpacing: '0.2em' }, { opacity: 1, scale: 1, letterSpacing: '0.06em', duration: 0.9, ease: 'power2.out' });
      g.set(btn, { display: 'inline-flex', opacity: 0, y: 12 });
      g.to(btn, { opacity: 1, y: 0, duration: 0.6, delay: 1.0, ease: 'power3.out', onComplete: () => { btn.style.animation = 'revivePulse 2.4s ease-in-out infinite'; try { btn.focus(); } catch (e) {} } });
    } else { if (title) title.style.opacity = '1'; if (btn) btn.style.display = 'inline-flex'; }
    // the world has resolved into Post-Apocalypse (revealed as the overlay clears / under it)
    try { if (this.ERAS && this.era !== 'post') this.applyEraInstant('post'); } catch (e) {}
  }

  rebuild() {
    if (this.worldPhase !== 'impacted' && this.worldPhase !== 'apocalypse') return;
    if (this._apocAuto) { clearTimeout(this._apocAuto); this._apocAuto = null; }
    this.worldPhase = 'rebuilding';
    const g = this.gsap; const card = document.getElementById('impact-card'); const title = document.getElementById('impact-title'); const btn = document.getElementById('rebuild-btn');
    if (btn) btn.style.animation = 'none';
    this.toast('REBUILDING — restoring the universe');
    try { this.resetUniverse(); } catch (e) {} // letters fly home elastically
    const reverseNow = () => { if (this._apocTl) this._apocTl.reverse(); else this.onRebuildComplete(); };
    if (g && card) { g.to([title, btn], { opacity: 0, duration: 0.35, ease: 'power2.in' }); g.to(card, { opacity: 0, duration: 0.45, ease: 'power2.in', onComplete: () => { card.style.display = 'none'; card.style.opacity = '1'; reverseNow(); } }); }
    else { if (card) card.style.display = 'none'; reverseNow(); }
  }

  onRebuildComplete() {
    const g = this.gsap; const fx = document.getElementById('apoc-fx');
    if (g) g.set(fx, { opacity: 0 });
    this.disposeAsteroids();
    if (g) g.set(document.getElementById('universe-root'), { x: 0, y: 0, clearProps: 'transform' });
    this._apocShake.amp = 0;
    this.lockLawBar(false);
    const y = this._savedScroll || 0;
    if (this.lenis) { try { this.lenis.scrollTo(y, { immediate: true }); } catch (e) { window.scrollTo(0, y); } } else window.scrollTo(0, y);
    try { if (this._apocTl) this._apocTl.kill(); } catch (e) {} this._apocTl = null;
    try { if (this.ERAS) this.applyEraInstant(this._eraBeforeApoc || 'space'); } catch (e) {} // REBUILD restores the prior era
    this.worldPhase = 'idle';
    this._reconcileHistory();
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
    if (this.sectionFX) for (let q = 0; q < this.sectionFX.length; q++) {
      const o = this.sectionFX[q]; o.grp.rotation.y = t * o.spin;
      if (o.crystal) { o.crystal.rotation.x = t * 0.3; o.crystal.rotation.y = t * 0.45; }
      if (o.cards) o.grp.children.forEach((c, ci) => { c.position.y = (c.userData.by || 0) + Math.sin(t * 0.6 + ci) * 0.12; });
    }
    this.animateRoamers(t);
    this.animateEra(t);

    const vh = window.innerHeight;
    const probe = (window.scrollY || window.pageYOffset || 0) + vh * 0.5;
    // section tops are CACHED (refreshed every ~2s + on resize) — the old per-frame
    // getBoundingClientRect calls forced synchronous layout 60×/sec and caused
    // visible scroll jank fighting Lenis
    this._frameN = (this._frameN || 0) + 1;
    if (!this._secTops || this._frameN % 120 === 0) this.updateSectionTops();
    const tops = this._secTops || [];
    let i = 0;
    for (let k = 0; k < tops.length; k++) { if (probe >= tops[k]) i = k; }
    if (i > this.stations.length - 2) i = this.stations.length - 2;
    const curTop = (tops[i] != null) ? tops[i] : 0;
    const nxtTop = (tops[i + 1] != null) ? tops[i + 1] : curTop + vh;
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
    // bounded, deterministic camera shake during the Apocalypse impacts
    if (this._apocShake && this._apocShake.amp > 0.0001) { const a = Math.min(this._apocShake.amp, 0.6); camera.position.x += Math.sin(t * 53.0) * a * 0.12; camera.position.y += Math.cos(t * 61.0) * a * 0.12; }
    camera.lookAt(this.camState.tx, this.camState.ty, this.camState.tz);

    // atmosphere particles drift + subtle cursor parallax; animate film grain
    if (this._dust) { this._dust.material.uniforms.uTime.value = t; this._dust.rotation.y = this.mouse.x * 0.05; this._dust.position.x = this.mouse.x * 0.3; }

    const dt = Math.min(0.05, Math.max(0.001, t - (this._lastT || t))); this._lastT = t;

    // 3D black hole: swirl the accretion disk + drive the lensing uniform (world pos, since it's camera-parented)
    if (this.bh3d) {
      if (this._bhDisk) { this._bhDisk.material.uniforms.uTime.value = t; this._bhDisk.rotation.z = t * 0.25; }
    }
    if (this.gradePass) {
      this.gradePass.uniforms.uTime.value = t;
      const u = this.gradePass.uniforms.uBh.value;
      if (this.bh3d) { const v = this.bh3d.getWorldPosition(this._bhScreen).project(camera); u.set(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5, this._bhLens.strength); }
      else u.z = 0;
    }

    this.updateRocket(t, dt);

    if (this.composer) this.composer.render(); else renderer.render(scene, camera);
    this.sampleFps();
  }

  /* watch frame time; auto-step the tier down if we can't hold ~45fps
     (skipped once the user has manually chosen a tier) */
  sampleFps() {
    if (this.tierManual || !this._fps) return;
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const f = this._fps;
    if (!f.last) { f.last = now; return; }
    const dt = now - f.last; f.last = now;
    if (dt <= 0 || dt > 200) return; // ignore background-tab throttling / hiccups
    f.acc += dt; f.frames++;
    if (f.frames >= 60) {
      const fps = 1000 / (f.acc / f.frames); f.acc = 0; f.frames = 0;
      if (fps < 45) {
        if (++f.low >= 2) { f.low = 0; if (this.tier === 'ultra') this.applyTier('high', false); else if (this.tier === 'high') this.applyTier('low', false); }
      } else f.low = 0;
    }
  }

  // one batched layout read instead of per-frame getBoundingClientRect in loop()
  updateSectionTops() {
    const sy = window.scrollY || window.pageYOffset || 0;
    this._secTops = (this._sectionEls || []).map((el) => el.getBoundingClientRect().top + sy);
  }

  onResize() {
    this.updateSectionTops();
    if (this.three) {
      const w = window.innerWidth, h = window.innerHeight;
      this.three.camera.aspect = w / h; this.three.camera.updateProjectionMatrix();
      this.three.renderer.setSize(w, h);
      if (this.composer) this.composer.setSize(w, h);
      if (this.bloomPass) this.bloomPass.setSize(w, h);
      if (this.ssaoPass) this.ssaoPass.setSize(w, h);
      if (this.bokehPass && this.bokehPass.setSize) this.bokehPass.setSize(w, h);
      if (this.gradePass) this.gradePass.uniforms.uRes.value.set(w, h);
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
