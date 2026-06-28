/* =====================================================================
   gfx.js  (ES module)
   Loads three.js + the post-processing / environment addons from CDN and
   exposes them as globals so the classic-script engine in app.js can use a
   SINGLE three.js instance (no second copy, no instanceof mismatches).

   Loaded via an <script type="module"> with an import map in index.html.
   app.js waits for window.__GFX_READY (see waitForDeps) before building the
   scene; if this module fails to load (offline ESM, etc.) the site falls back
   to the elegant animated gradient hero — never a broken canvas.
   ===================================================================== */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

window.THREE = THREE;
window.GFX = {
  EffectComposer, RenderPass, ShaderPass,
  UnrealBloomPass, OutputPass, BokehPass, SSAOPass,
  RoomEnvironment,
};
window.__GFX_READY = true;
window.dispatchEvent(new Event('gfx-ready'));
