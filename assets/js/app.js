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
    this._bhLens = { strength: 0 }; // gravitational-lensing strength for the 3D black hole
  }

  /* ---------------- lifecycle ---------------- */
  init() {
    if (this._init) return; this._init = true;
    const mm = (q) => { try { return window.matchMedia(q).matches; } catch (e) { return false; } };
    this.prefersReduced = mm('(prefers-reduced-motion: reduce)');
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
    if (tier === 'ultra') return { dpr: Math.min(dpr, 2), antialias: true, composer: true, bloom: true, ssao: true, dof: !reduce, shadows: true, particles: P(1500) };
    if (tier === 'low') return { dpr: 1, antialias: false, composer: false, bloom: false, ssao: false, dof: false, shadows: false, particles: P(280) };
    return { dpr: Math.min(dpr, 1.75), antialias: true, composer: true, bloom: true, ssao: false, dof: false, shadows: false, particles: P(800) }; // high
  }

  /* ---------------- three.js ---------------- */
  initThree() {
    const THREE = window.THREE;
    const cfg = this.cfg = this.tierConfig(this.tier);
    const mount = document.getElementById('gl-mount');
    const w = window.innerWidth, h = window.innerHeight;
    const renderer = new THREE.WebGLRenderer({ antialias: cfg.antialias, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: true, stencil: false });
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

    this.buildGlow(); this.buildSphere(); this.buildShell(); this.buildRings(); this.buildOrbiters(); this.buildTorus(); this.buildShards(); this.buildStars(); this.buildParticles(cfg.particles);
    // hero-centred objects to fade out when the black hole takes the stage
    this._heroAmbient = [this.shell, this.glowV, this.glowC].concat(this.rings || []).concat(this.orbiters || []).filter(Boolean);
    if (this.tier !== 'low') this.buildSectionObjects();
    this.buildRocket();
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
      const bloom = new G.UnrealBloomPass(new THREE.Vector2(w, h), 0.7, 0.6, 0.88); // strength, radius, threshold (selective — higher threshold = less wash)
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
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `
        uniform sampler2D tDiffuse; uniform float uTime, uAberration, uVignette, uGrain, uReduce;
        uniform vec2 uRes; uniform vec3 uBh; varying vec2 vUv;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        void main(){
          vec2 uv = vUv;
          // gravitational lensing: bend + swirl the image toward the black hole
          if (uBh.z > 0.001) {
            float asp = uRes.x / max(uRes.y, 1.0);
            vec2 d = uv - uBh.xy; d.x *= asp;
            float dist = length(d);
            float pull = min(uBh.z * 0.05 / (dist * dist + 0.015), 0.6);
            float sw = uBh.z * 0.35 / (dist + 0.05);
            float cs = cos(sw), sn = sin(sw);
            d = mat2(cs, -sn, sn, cs) * d * (1.0 - pull);
            d.x /= asp;
            uv = uBh.xy + d;
          }
          vec2 dir = uv - 0.5; float r2 = dot(dir, dir);
          // chromatic aberration grows toward the edges
          float a = uAberration * (0.5 + r2);
          vec3 col;
          col.r = texture2D(tDiffuse, uv - dir * a).r;
          col.g = texture2D(tDiffuse, uv).g;
          col.b = texture2D(tDiffuse, uv + dir * a).b;
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
      const on = b.dataset.tier === this.tier;
      b.style.borderColor = on ? 'var(--accent)' : 'var(--line)';
      b.style.background = on ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.04)';
      b.style.color = on ? '#fff' : '#c9ccd8';
    });
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
    const geo = new THREE.TorusKnotGeometry(0.85, 0.26, 220, 32, 2, 3);
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
    if (this.worldPhase !== 'idle') { R.grp.visible = false; return; } // hidden during the swallow cinematic
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

  onResize() {
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
