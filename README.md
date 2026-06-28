# Universe Portfolio — Syed Abdul Kareem

A single-page, heavily-animated 3D personal portfolio with an interactive
**"Laws of the Universe"** physics playground. Built as a luxury, Awwwards-grade
experience that stays perfectly readable for anyone who never touches the physics.

**Live:** _deploy to Vercel (see below)_ · **Author:** Syed Abdul Kareem — Full Stack Software Engineer

---

## ✨ What's inside

- **Cinematic preloader** — 0→100% counter that dissolves into the hero via a curtain reveal.
- **GLSL 3D hero** — a mouse-reactive, noise-distorted fresnel sphere with orbiters, rings, shards and a 900-point starfield.
- **Scroll-driven camera** — the camera flies through six "stations" as you scroll, with Lenis smooth scroll.
- **Magnetic custom cursor**, reveal-on-scroll, dual marquees, grain + vignette post-processing.
- **Laws of the Universe** — a frosted, draggable HUD that bends physics on the actual letters of the name and the skill chips:
  | Button | Effect |
  |---|---|
  | 🌍 Earth | Normal 1g — everything settles, layout readable |
  | 🌌 Zero-G | Gravity off, free drift; cursor nudges nearby bodies |
  | 🔴 Mars / 🌕 Moon / 🪐 Jupiter | 0.38g / 0.16g / 2.5g gravity presets |
  | ⏳ Slow-Mo | Bullet-time (0.2×) with a chroma pulse |
  | ⚫ Black Hole | Forms a singularity that spaghettifies & swallows bodies — **tap again to collapse the entire site** |
  | 🕰️ Time | Cycles Freeze → Rewind → Fast-Forward → Resume (rolling transform buffer) |
  | 💥 Big Bang | Impulse-explodes everything from the centre |
  | ♻️ Reset | Elastic re-assembly back to a legible site |
- **Black Hole → "THE END" → REVIVE** — a second tap on the Black Hole escalates into a full-page
  gravitational collapse: the whole site spirals, blurs and shrinks into the singularity behind a
  closing iris, an Einstein-ring flash, then a film-style **THE END** card. A single **REVIVE** button
  (also `Esc` / browser-back) plays the one master timeline in reverse for a pixel-perfect restore.

All law changes are **eased (0.6–1.2s)** and driven by **forces, never teleports** — no snapping.
`prefers-reduced-motion` is respected everywhere (the collapse becomes a gentle fade).

---

## 🧱 Tech

No build step. Everything is static HTML/CSS/JS using CDN libraries — exactly the engine the design
was tuned against, so there is **zero animation loss**:

- [three.js](https://threejs.org) `0.149` — WebGL hero + custom GLSL shader
- [GSAP](https://gsap.com) `3.12` + ScrollTrigger — choreography & the reversible swallow timeline
- [Lenis](https://lenis.darkroom.engineering) `1.1` — smooth scroll
- [Matter.js](https://brm.io/matter-js/) `0.19` — 2D rigid-body physics on the DOM letters/chips
- Fonts: **Clash Display** (display) + **Space Grotesk** (body)

```
Universe-Portfolio/
├── index.html              # markup for every section + HUD + overlays
├── assets/
│   ├── css/styles.css       # tokens, keyframes, section + form styling
│   └── js/
│       ├── data.js          # ALL content (profile, skills, experience, projects, achievements)
│       └── app.js           # the engine: preloader, cursor, 3D scene, physics laws, swallow/REVIVE
├── vercel.json
└── README.md
```

Edit content in **`assets/js/data.js`** — never hardcode copy in markup.

---

## ▶️ Run locally

It's a static site, so any static server works (opening `index.html` via `file://` also works, but a
server is recommended so the CDN scripts and fonts load cleanly):

```bash
# Python (any version)
python -m http.server 5173
# or Node
npx serve .
```

Then open <http://localhost:5173>.

---

## 🚀 Deploy to Vercel

1. Push this repo to GitHub (`Universe-Portfolio`).
2. In Vercel → **Add New Project** → import the repo.
3. Framework preset: **Other** · Build command: _none_ · Output directory: `.` (root).
4. Deploy. That's it — no environment variables, no build.

---

## 📌 Notes for the owner

- **Projects** link to your real GitHub repos and live demos; the **KEBS** card is enterprise/proprietary
  work, so it links to LinkedIn instead of a repo. Update any of this in `data.js`.
- The **contact form** is static — it opens a pre-filled email draft to `syedazeeem.13@gmail.com`.
  To capture submissions server-side, wire it to Formspree / a Vercel serverless function later.
- LinkedIn (`syed-abdul-kareem-b33519200`) and GitHub (`SyedAbdulKareem13`) links are confirmed live.

© 2025 Syed Abdul Kareem.
