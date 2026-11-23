/* ============================================================
   Окна-Гуд — live 3D window configurator
   Three.js, no external assets
   ============================================================ */

import * as THREE from "three";
import { RoundedBoxGeometry } from "./vendor/RoundedBoxGeometry.js";
import { RoomEnvironment } from "./vendor/RoomEnvironment.js";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const rad = (deg) => (deg * Math.PI) / 180;

const FRAME_COLORS = {
  white: 0xe9e6dd,
  anthracite: 0x2e3132,
  oak: 0xffffff,
};

const GLASS_TINTS = {
  standard: 0xa9c5c9,
  triple: 0xa2c0c4,
  energy: 0x9fc0b9,
  multi: 0x9bbcc3,
};

const GLASS_OPACITY = {
  standard: 0.09,
  triple: 0.105,
  energy: 0.115,
  multi: 0.13,
};

function roundedBox(width, height, depth, radius = 0.008) {
  const safeRadius = Math.max(
    0.001,
    Math.min(radius, Math.min(width, height, depth) / 2 - 0.0005)
  );
  return new RoundedBoxGeometry(width, height, depth, 2, safeRadius);
}

function makeWoodTexture(renderer) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");

  const base = ctx.createLinearGradient(0, 0, 512, 0);
  base.addColorStop(0, "#6f4c34");
  base.addColorStop(0.25, "#805a3d");
  base.addColorStop(0.5, "#5d3f2b");
  base.addColorStop(0.74, "#7a5539");
  base.addColorStop(1, "#68462f");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 512, 512);

  let seed = 37;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };

  for (let i = 0; i < 210; i += 1) {
    const x = random() * 512;
    const alpha = 0.018 + random() * 0.06;
    ctx.strokeStyle = random() > 0.55 ? `rgba(30,18,10,${alpha})` : `rgba(235,205,170,${alpha * 0.8})`;
    ctx.lineWidth = 0.5 + random() * 2.4;
    ctx.beginPath();
    ctx.moveTo(x, -10);
    ctx.bezierCurveTo(x + random() * 26 - 13, 140, x + random() * 32 - 16, 340, x + random() * 22 - 11, 522);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2.4, 2.4);
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return texture;
}

function makeSkyTexture(renderer) {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 960;
  const ctx = canvas.getContext("2d");

  const sky = ctx.createLinearGradient(0, 0, 0, 960);
  sky.addColorStop(0, "#5c7a84");
  sky.addColorStop(0.28, "#7e9ba2");
  sky.addColorStop(0.52, "#a9c0c0");
  sky.addColorStop(0.68, "#d4ddd4");
  sky.addColorStop(0.76, "#b9c7bc");
  sky.addColorStop(1, "#465b50");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 768, 960);

  const sun = ctx.createRadialGradient(500, 250, 6, 500, 250, 240);
  sun.addColorStop(0, "rgba(255,255,250,0.85)");
  sun.addColorStop(0.4, "rgba(255,250,232,0.28)");
  sun.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, 768, 960);

  /* distant horizon */
  ctx.save();
  ctx.filter = "blur(3px)";
  ctx.fillStyle = "rgba(73,91,83,0.46)";
  ctx.beginPath();
  ctx.moveTo(0, 690);
  ctx.bezierCurveTo(160, 666, 320, 702, 480, 678);
  ctx.bezierCurveTo(610, 660, 700, 684, 768, 670);
  ctx.lineTo(768, 960);
  ctx.lineTo(0, 960);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  /* soft tree canopies */
  ctx.save();
  ctx.filter = "blur(9px)";
  const canopies = [
    [42, 748, 120, 92, -0.08],
    [158, 716, 110, 76, 0.04],
    [282, 742, 138, 88, -0.04],
    [420, 704, 106, 72, 0.06],
    [548, 734, 148, 92, -0.03],
    [680, 700, 112, 82, 0.05],
    [760, 748, 96, 78, 0],
  ];
  canopies.forEach(([cx, cy, rx, ry, rotation], index) => {
    ctx.fillStyle = index % 2 === 0 ? "rgba(31,49,38,0.72)" : "rgba(37,56,44,0.62)";
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, rotation, 0, Math.PI * 2);
    ctx.fill();
  });
  const bank = ctx.createLinearGradient(0, 760, 0, 960);
  bank.addColorStop(0, "rgba(31,48,38,0.78)");
  bank.addColorStop(1, "rgba(16,29,22,0.98)");
  ctx.fillStyle = bank;
  ctx.fillRect(0, 780, 768, 180);
  ctx.restore();

  /* light haze near the horizon */
  const haze = ctx.createLinearGradient(0, 600, 0, 820);
  haze.addColorStop(0, "rgba(240,245,235,0)");
  haze.addColorStop(0.55, "rgba(240,245,235,0.25)");
  haze.addColorStop(1, "rgba(240,245,235,0)");
  ctx.fillStyle = haze;
  ctx.fillRect(0, 600, 768, 220);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return texture;
}

function makeGlareTexture(renderer) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");

  const band = (x, width, opacity) => {
    const gradient = ctx.createLinearGradient(x, 0, x + width, 512);
    gradient.addColorStop(0, "rgba(255,255,255,0)");
    gradient.addColorStop(0.44, `rgba(255,255,255,${opacity})`);
    gradient.addColorStop(0.52, `rgba(255,255,255,${opacity * 0.7})`);
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(x, 0, width, 512);
  };

  band(48, 150, 0.42);
  band(230, 66, 0.2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  return texture;
}

function makeNetTexture(renderer) {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, 64, 64);
  ctx.strokeStyle = "rgba(205,208,199,0.85)";
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, 64, 64);
  ctx.beginPath();
  ctx.moveTo(32, 0);
  ctx.lineTo(32, 64);
  ctx.moveTo(0, 32);
  ctx.lineTo(64, 32);
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return texture;
}

function makeWallTexture(renderer) {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 768;
  const ctx = canvas.getContext("2d");

  const vertical = ctx.createLinearGradient(0, 0, 0, 768);
  vertical.addColorStop(0, "#1b1c19");
  vertical.addColorStop(0.42, "#141513");
  vertical.addColorStop(1, "#080808");
  ctx.fillStyle = vertical;
  ctx.fillRect(0, 0, 768, 768);

  const glow = ctx.createRadialGradient(384, 330, 30, 384, 330, 470);
  glow.addColorStop(0, "rgba(112,116,108,0.2)");
  glow.addColorStop(0.55, "rgba(74,77,71,0.08)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 768, 768);

  let seed = 19;
  const random = () => {
    seed = (seed * 48271) % 2147483647;
    return seed / 2147483647;
  };

  for (let index = 0; index < 2600; index += 1) {
    const x = random() * 768;
    const y = random() * 768;
    const light = random() > 0.55;
    ctx.fillStyle = light
      ? `rgba(190,193,182,${0.01 + random() * 0.025})`
      : `rgba(0,0,0,${0.02 + random() * 0.035})`;
    ctx.fillRect(x, y, 1 + random() * 2.4, 1 + random() * 2.4);
  }

  const vignette = ctx.createRadialGradient(384, 384, 250, 384, 384, 620);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, 768, 768);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return texture;
}

function makeWallShape(width, height, holeWidth, holeHeight) {
  const radius = Math.min(0.035, width * 0.02, height * 0.02);
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2 + radius, -height / 2);
  shape.lineTo(width / 2 - radius, -height / 2);
  shape.quadraticCurveTo(width / 2, -height / 2, width / 2, -height / 2 + radius);
  shape.lineTo(width / 2, height / 2 - radius);
  shape.quadraticCurveTo(width / 2, height / 2, width / 2 - radius, height / 2);
  shape.lineTo(-width / 2 + radius, height / 2);
  shape.quadraticCurveTo(-width / 2, height / 2, -width / 2, height / 2 - radius);
  shape.lineTo(-width / 2, -height / 2 + radius);
  shape.quadraticCurveTo(-width / 2, -height / 2, -width / 2 + radius, -height / 2);

  const hole = new THREE.Path();
  const hw = holeWidth / 2;
  const hh = holeHeight / 2;
  hole.moveTo(-hw, -hh);
  hole.lineTo(hw, -hh);
  hole.lineTo(hw, hh);
  hole.lineTo(-hw, hh);
  hole.lineTo(-hw, -hh);
  shape.holes.push(hole);
  return shape;
}

function disposeGroup(group) {
  const geometries = new Set();

  group.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
  });

  geometries.forEach((geometry) => geometry.dispose());
  group.clear();
}

export function createWindowScene(container, options = {}) {
  const reducedMotion = Boolean(options.reducedMotion);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.setAttribute("aria-hidden", "true");
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(31, 1, 0.1, 60);
  camera.position.set(0, 0.08, 6);
  camera.lookAt(0, 0.02, 0);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new RoomEnvironment();
  const envTexture = pmrem.fromScene(envScene, 0.04).texture;
  scene.environment = envTexture;
  scene.environmentIntensity = 0.75;
  envScene.dispose();
  pmrem.dispose();

  const ambient = new THREE.AmbientLight(0xffffff, 0.7);
  scene.add(ambient);

  const keyLight = new THREE.DirectionalLight(0xf7f5ef, 2.35);
  keyLight.position.set(-3.2, 4.2, 5.5);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(512, 512);
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 18;
  keyLight.shadow.camera.left = -4;
  keyLight.shadow.camera.right = 4;
  keyLight.shadow.camera.top = 4;
  keyLight.shadow.camera.bottom = -4;
  keyLight.shadow.bias = -0.0004;
  keyLight.shadow.normalBias = 0.018;
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xc8dce0, 0.9);
  fillLight.position.set(4.5, 0.8, 2.5);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0xffffff, 0.75);
  rimLight.position.set(1.5, 2.2, -3);
  scene.add(rimLight);

  const root = new THREE.Group();
  scene.add(root);

  /* Persistent outside light */
  const skyTexture = makeSkyTexture(renderer);
  const sky = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: skyTexture })
  );
  sky.position.z = -0.48;
  root.add(sky);

  const model = new THREE.Group();
  root.add(model);

  const woodTexture = makeWoodTexture(renderer);
  const wallTexture = makeWallTexture(renderer);
  const glareTexture = makeGlareTexture(renderer);
  const netTexture = makeNetTexture(renderer);

  const state = {
    type: "double",
    width: 1400,
    height: 1400,
    profile: "softline",
    color: "white",
    glazing: "standard",
    extras: [],
  };

  let width = 1.4;
  let height = 1.4;
  let wallWidth = 2.1;
  let wallHeight = 2.1;
  let fitDistance = 6;
  let zoomFactor = 1;
  let targetRotationY = 0;
  let spinVelocity = 0;
  let targetRotationX = 0;
  let isOpen = false;
  let pivots = [];
  let dragging = false;
  let pointerId = null;
  let lastPointerX = 0;
  let lastPointerY = 0;
  let running = false;
  let frameId = 0;
  let disposed = false;
  let hasBuiltOnce = false;
  const buildMaterials = new Set();
  const buildTextures = new Set();

  camera.position.z = fitDistance;
  root.rotation.y = reducedMotion ? 0 : -0.34;
  root.rotation.x = 0;

  function updateWallMetrics() {
    wallWidth = Math.max(width + 0.56, 1.82);
    wallHeight = Math.max(height + 0.56, 1.98);
  }

  function computeFitDistance() {
    const aspect = Math.max(0.4, camera.aspect);
    const fov = rad(camera.fov);
    const halfHeight = (wallHeight * 0.5) / Math.tan(fov / 2);
    const halfWidth = (wallWidth * 0.5) / (Math.tan(fov / 2) * aspect);
    return Math.max(halfHeight, halfWidth) * 1.14;
  }

  function updateCameraFit(resetZoom = false) {
    updateWallMetrics();
    fitDistance = computeFitDistance();
    if (resetZoom) zoomFactor = 1;
  }

  function resize() {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    updateCameraFit(false);
    if (!running) camera.position.z = fitDistance * zoomFactor;
  }

  function materialSet() {
    const frameColor = FRAME_COLORS[state.color] || FRAME_COLORS.white;
    const frameParams = {
      color: frameColor,
      roughness: 0.34,
      metalness: 0.05,
      clearcoat: 1,
      clearcoatRoughness: 0.22,
      envMapIntensity: 0.9,
    };

    if (state.color === "anthracite") {
      frameParams.roughness = 0.4;
      frameParams.metalness = 0.22;
      frameParams.clearcoat = 0.8;
      frameParams.envMapIntensity = 1;
    }
    if (state.color === "oak") {
      frameParams.roughness = 0.62;
      frameParams.metalness = 0.02;
      frameParams.clearcoat = 0.28;
      frameParams.clearcoatRoughness = 0.5;
      frameParams.map = woodTexture;
    }

    const frame = new THREE.MeshPhysicalMaterial(frameParams);
    const wall = new THREE.MeshBasicMaterial({
      map: wallTexture,
      toneMapped: false,
    });
    const gasket = new THREE.MeshStandardMaterial({
      color: 0x23241f,
      roughness: 0.8,
      metalness: 0.05,
    });
    const handle = new THREE.MeshStandardMaterial({
      color: 0xc8c6bc,
      roughness: 0.28,
      metalness: 0.88,
      envMapIntensity: 1.4,
    });
    const sill = new THREE.MeshStandardMaterial({
      color: 0xc9c5ba,
      roughness: 0.5,
      metalness: 0.02,
      envMapIntensity: 0.55,
    });
    const glass = new THREE.MeshPhysicalMaterial({
      color: GLASS_TINTS[state.glazing] || GLASS_TINTS.standard,
      transparent: true,
      opacity: GLASS_OPACITY[state.glazing] || GLASS_OPACITY.standard,
      roughness: 0.045,
      metalness: 0,
      ior: 1.45,
      reflectivity: 0.22,
      clearcoat: 0.14,
      clearcoatRoughness: 0.06,
      envMapIntensity: 0.24,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const glare = new THREE.MeshBasicMaterial({
      map: glareTexture,
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const net = new THREE.MeshBasicMaterial({
      map: netTexture,
      transparent: true,
      opacity: 0.85,
      color: 0xcfd0c8,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    return { frame, wall, gasket, handle, sill, glass, glare, net };
  }

  function layoutPanels(innerW, innerH) {
    const gap = 0.005;
    const panels = [];

    if (state.type === "single") {
      panels.push({ x: 0, y: 0, w: innerW, h: innerH, open: true, hinge: "left" });
    } else if (state.type === "double") {
      const panelW = (innerW - gap) / 2;
      panels.push({ x: -innerW / 2 + panelW / 2, y: 0, w: panelW, h: innerH, open: false });
      panels.push({
        x: innerW / 2 - panelW / 2,
        y: 0,
        w: panelW,
        h: innerH,
        open: true,
        hinge: "right",
      });
    } else if (state.type === "triple") {
      const panelW = (innerW - gap * 2) / 3;
      panels.push({ x: -innerW / 2 + panelW / 2, y: 0, w: panelW, h: innerH, open: false });
      panels.push({ x: 0, y: 0, w: panelW, h: innerH, open: true, hinge: "left" });
      panels.push({ x: innerW / 2 - panelW / 2, y: 0, w: panelW, h: innerH, open: false });
    } else if (state.type === "balcony") {
      const doorW = Math.min(Math.max(innerW * 0.4, 0.42), Math.max(0.3, innerW - 0.32));
      const windowW = Math.max(0.2, innerW - doorW - gap);
      panels.push({
        x: -innerW / 2 + windowW / 2,
        y: 0,
        w: windowW,
        h: innerH,
        open: false,
        lower: Math.min(0.62, innerH * 0.3),
      });
      panels.push({
        x: innerW / 2 - doorW / 2,
        y: 0,
        w: doorW,
        h: innerH,
        open: true,
        hinge: "right",
        door: true,
        lower: Math.min(0.4, innerH * 0.2),
      });
    }

    return panels;
  }

  function buildPanel(panel, materials) {
    const { w, h } = panel;
    const isDoor = Boolean(panel.door);
    const barWidth = Math.min(0.054, Math.max(0.032, w * 0.14));
    const barDepth = isDoor ? 0.077 : 0.066;
    const barZ = isDoor ? 0.025 : 0.021;

    const pivot = new THREE.Group();
    let group;

    if (panel.open) {
      const hingeX = panel.x + (panel.hinge === "left" ? -w / 2 : w / 2);
      pivot.position.set(hingeX, panel.y, 0);
      group = new THREE.Group();
      group.position.x = panel.x - hingeX;
      pivot.add(group);
      pivot.userData.openAngle = (panel.hinge === "left" ? -1 : 1) * (isDoor ? 0.62 : 0.52);
      pivot.userData.current = 0;
      if (isOpen) pivot.rotation.y = pivot.userData.openAngle;
      pivots.push(pivot);
    } else {
      pivot.position.set(panel.x, panel.y, 0);
      group = new THREE.Group();
      pivot.add(group);
    }

    model.add(pivot);

    const addBar = (barW, barH, x, y, z, material) => {
      const mesh = new THREE.Mesh(roundedBox(barW, barH, barDepth, 0.008), material);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      return mesh;
    };

    addBar(w, barWidth, 0, h / 2 - barWidth / 2, barZ, materials.frame);
    addBar(w, barWidth, 0, -h / 2 + barWidth / 2, barZ, materials.frame);
    addBar(barWidth, h - barWidth * 2, -w / 2 + barWidth / 2, 0, barZ, materials.frame);
    addBar(barWidth, h - barWidth * 2, w / 2 - barWidth / 2, 0, barZ, materials.frame);

    const lower = clamp(panel.lower || 0, 0, h * 0.55);
    const glassW = Math.max(0.06, w - barWidth * 2 - 0.012);
    const glassTop = h / 2 - barWidth;
    const glassBottom = -h / 2 + barWidth + lower;
    const glassH = Math.max(0.06, glassTop - glassBottom);
    const glassY = glassTop - glassH / 2;

    if (lower > 0) {
      const panelMesh = new THREE.Mesh(
        roundedBox(glassW + 0.005, lower - 0.004, 0.038, 0.006),
        materials.frame
      );
      panelMesh.position.set(0, -h / 2 + barWidth + lower / 2, barZ - 0.004);
      panelMesh.castShadow = true;
      panelMesh.receiveShadow = true;
      group.add(panelMesh);

      addBar(glassW + 0.012, 0.04, 0, -h / 2 + barWidth + lower, barZ + 0.002, materials.frame);
    }

    const glass = new THREE.Mesh(
      roundedBox(glassW, glassH, 0.006, 0.0025),
      materials.glass
    );
    glass.position.set(0, glassY, barZ - 0.012);
    glass.renderOrder = 4;
    group.add(glass);

    /* slim dark gasket line */
    const gasketThickness = 0.009;
    const gasketDepth = 0.01;
    const gasketZ = barZ - 0.006;
    const gaskets = [
      [glassW + gasketThickness * 2, gasketThickness, 0, glassY + glassH / 2 + gasketThickness / 2],
      [glassW + gasketThickness * 2, gasketThickness, 0, glassY - glassH / 2 - gasketThickness / 2],
      [gasketThickness, glassH, -glassW / 2 - gasketThickness / 2, glassY],
      [gasketThickness, glassH, glassW / 2 + gasketThickness / 2, glassY],
    ];
    gaskets.forEach(([gw, gh, gx, gy]) => {
      const gasket = new THREE.Mesh(roundedBox(gw, gh, gasketDepth, 0.002), materials.gasket);
      gasket.position.set(gx, gy, gasketZ);
      group.add(gasket);
    });

    const glare = new THREE.Mesh(
      new THREE.PlaneGeometry(glassW * 0.96, glassH * 0.96),
      materials.glare
    );
    glare.position.set(0, glassY, barZ + 0.001);
    glare.rotation.z = 0.18;
    glare.renderOrder = 5;
    group.add(glare);

    if (panel.open) {
      const freeSide = panel.hinge === "left" ? 1 : -1;
      const handleX = freeSide * (w / 2 - barWidth - 0.022);
      const handleLength = isDoor ? Math.min(0.34, h * 0.18) : 0.15;
      const handleY = isDoor ? -0.02 : 0.02;

      const plate = new THREE.Mesh(
        roundedBox(0.032, handleLength + 0.045, 0.012, 0.005),
        materials.handle
      );
      plate.position.set(handleX, handleY, barZ + 0.04);
      plate.castShadow = true;
      group.add(plate);

      const handle = new THREE.Mesh(
        roundedBox(0.019, handleLength, 0.03, 0.008),
        materials.handle
      );
      handle.position.set(handleX, handleY, barZ + 0.066);
      handle.castShadow = true;
      group.add(handle);

      /* hinges stay fixed on the frame */
      const hingeWorldX = panel.x + (panel.hinge === "left" ? -w / 2 : w / 2);
      const hingeCount = isDoor ? 3 : 2;
      for (let i = 0; i < hingeCount; i += 1) {
        const hinge = new THREE.Mesh(
          new THREE.CylinderGeometry(0.0065, 0.0065, 0.038, 10),
          materials.handle
        );
        const factor = hingeCount === 2 ? (i === 0 ? -0.3 : 0.3) : -0.32 + i * 0.32;
        hinge.position.set(hingeWorldX, panel.y + factor * h, barZ + 0.024);
        model.add(hinge);
      }
    }

    return { panel, glassW, glassH, glassY };
  }

  function build() {
    disposeGroup(model);
    buildMaterials.forEach((material) => material.dispose());
    buildMaterials.clear();
    buildTextures.forEach((texture) => texture.dispose());
    buildTextures.clear();
    pivots = [];

    width = clamp(state.width / 1000, 0.7, 2.2);
    height = clamp(state.height / 1000, 0.7, 2.2);
    updateWallMetrics();
    sky.scale.set(Math.max(0.9, wallWidth - 0.14), Math.max(0.9, wallHeight - 0.14), 1);

    const materials = materialSet();
    Object.values(materials).forEach((material) => buildMaterials.add(material));

    /* Wall slab with an opening */
    const holeW = width + 0.026;
    const holeH = height + 0.026;
    const shape = makeWallShape(wallWidth, wallHeight, holeW, holeH);
    const wallGeometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.06,
      bevelEnabled: true,
      bevelThickness: 0.009,
      bevelSize: 0.009,
      bevelSegments: 2,
      curveSegments: 6,
    });
    const wall = new THREE.Mesh(wallGeometry, materials.wall);
    wall.position.z = -0.15;
    wall.castShadow = false;
    model.add(wall);

    /* Invisible shadow catcher: adds contact shadows to the wall only, not to the sky. */
    const shadowPlane = new THREE.Mesh(
      new THREE.ShapeGeometry(shape, 8),
      new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.55, transparent: true, depthWrite: false })
    );
    shadowPlane.position.z = -0.086;
    shadowPlane.receiveShadow = true;
    shadowPlane.renderOrder = 1;
    model.add(shadowPlane);

    /* Outer frame — profile depth is visible in 3D */
    const profileWidth = state.profile === "blitz" ? 0.058 : state.profile === "delight" ? 0.075 : 0.07;
    const frameWidth = clamp(profileWidth, 0.05, 0.078);
    const frameDepth = 0.095;
    const frameZ = 0;
    const addFrameBar = (barW, barH, x, y) => {
      const mesh = new THREE.Mesh(
        roundedBox(barW, barH, frameDepth, 0.011),
        materials.frame
      );
      mesh.position.set(x, y, frameZ);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      model.add(mesh);
    };

    addFrameBar(width, frameWidth, 0, height / 2 - frameWidth / 2);
    addFrameBar(width, frameWidth, 0, -height / 2 + frameWidth / 2);
    addFrameBar(frameWidth, height - frameWidth * 2, -width / 2 + frameWidth / 2, 0);
    addFrameBar(frameWidth, height - frameWidth * 2, width / 2 - frameWidth / 2, 0);

    /* Dark reveal between frame and wall slab */
    const revealDepth = 0.055;
    const revealMaterial = materials.gasket;
    const revealZ = -0.085;
    const revealThickness = 0.018;
    const revealTop = new THREE.Mesh(
      roundedBox(width + 0.05, revealThickness, revealDepth, 0.005),
      revealMaterial
    );
    revealTop.position.set(0, height / 2 + 0.012, revealZ);
    model.add(revealTop);
    const revealBottom = revealTop.clone();
    revealBottom.position.y = -height / 2 - 0.012;
    model.add(revealBottom);

    const revealSide = new THREE.Mesh(
      roundedBox(revealThickness, height + 0.06, revealDepth, 0.005),
      revealMaterial
    );
    revealSide.position.set(-width / 2 - 0.012, 0, revealZ);
    model.add(revealSide);
    const revealSideRight = revealSide.clone();
    revealSideRight.position.x = width / 2 + 0.012;
    model.add(revealSideRight);

    /* Dark shadow gap around the sashes */
    const innerW = width - frameWidth * 2 - 0.016;
    const innerH = height - frameWidth * 2 - 0.016;
    const gapThickness = 0.024;
    const gapDepth = 0.024;
    const gapZ = -0.006;
    const gapTop = new THREE.Mesh(
      roundedBox(innerW + 0.04, gapThickness, gapDepth, 0.004),
      materials.gasket
    );
    gapTop.position.set(0, height / 2 - frameWidth + 0.004, gapZ);
    model.add(gapTop);
    const gapBottom = gapTop.clone();
    gapBottom.position.y = -height / 2 + frameWidth - 0.004;
    model.add(gapBottom);
    const gapLeft = new THREE.Mesh(
      roundedBox(gapThickness, innerH + 0.04, gapDepth, 0.004),
      materials.gasket
    );
    gapLeft.position.set(-width / 2 + frameWidth - 0.004, 0, gapZ);
    model.add(gapLeft);
    const gapRight = gapLeft.clone();
    gapRight.position.x = width / 2 - frameWidth + 0.004;
    model.add(gapRight);

    /* Sashes */
    const panels = layoutPanels(innerW, innerH);
    const builtPanels = panels.map((panel) => buildPanel(panel, materials));

    /* Soft seams between neighbouring sashes */
    for (let index = 0; index < panels.length - 1; index += 1) {
      const leftPanel = panels[index];
      const rightPanel = panels[index + 1];
      const seamX = (leftPanel.x + leftPanel.w / 2 + rightPanel.x - rightPanel.w / 2) / 2;
      const seam = new THREE.Mesh(
        roundedBox(0.012, innerH + 0.02, 0.018, 0.003),
        materials.gasket
      );
      seam.position.set(seamX, 0, -0.004);
      model.add(seam);
    }

    /* White interior casing around the opening */
    if (state.extras.includes("slopes")) {
      const trimMaterial = new THREE.MeshStandardMaterial({
        color: 0xd2cfc5,
        roughness: 0.58,
        metalness: 0.02,
      });
      buildMaterials.add(trimMaterial);
      const trimShape = makeWallShape(width + 0.18, height + 0.18, width + 0.028, height + 0.028);
      const trimGeometry = new THREE.ExtrudeGeometry(trimShape, {
        depth: 0.022,
        bevelEnabled: true,
        bevelThickness: 0.004,
        bevelSize: 0.005,
        bevelSegments: 2,
        curveSegments: 6,
      });
      const trim = new THREE.Mesh(trimGeometry, trimMaterial);
      trim.position.z = -0.089;
      trim.castShadow = true;
      trim.receiveShadow = true;
      model.add(trim);
    }

    /* Sill */
    if (state.extras.includes("sill")) {
      const sillMesh = new THREE.Mesh(
        roundedBox(width + 0.18, 0.035, 0.27, 0.011),
        materials.sill
      );
      sillMesh.position.set(0, -height / 2 - 0.026, 0.06);
      sillMesh.castShadow = true;
      sillMesh.receiveShadow = true;
      model.add(sillMesh);

      const sillEdge = new THREE.Mesh(
        roundedBox(width + 0.18, 0.012, 0.012, 0.005),
        materials.sill
      );
      sillEdge.position.set(0, -height / 2 - 0.043, 0.19);
      model.add(sillEdge);
    }

    /* Mosquito net behind the opening leaf */
    if (state.extras.includes("mosquito")) {
      const target = builtPanels.find((item) => item.panel.open) || builtPanels[0];
      if (target) {
        const netMaterial = materials.net.clone();
        netMaterial.map = netTexture.clone();
        netMaterial.map.needsUpdate = true;
        netMaterial.map.wrapS = THREE.RepeatWrapping;
        netMaterial.map.wrapT = THREE.RepeatWrapping;
        netMaterial.map.repeat.set(
          Math.max(1, Math.round(target.glassW * 22)),
          Math.max(1, Math.round(target.glassH * 22))
        );
        buildMaterials.add(netMaterial);
        buildTextures.add(netMaterial.map);
        const net = new THREE.Mesh(
          new THREE.PlaneGeometry(target.glassW + 0.01, target.glassH + 0.01),
          netMaterial
        );
        net.position.set(target.panel.x, target.panel.y + target.glassY, -0.038);
        net.renderOrder = 2;
        model.add(net);
      }
    }

    updateCameraFit(false);
    if (!hasBuiltOnce) {
      camera.position.z = fitDistance * zoomFactor;
      hasBuiltOnce = true;
    }
  }

  function update(nextState) {
    if (disposed) return;
    const previousWidth = state.width;
    const previousHeight = state.height;
    const previousType = state.type;

    state.type = nextState.type || state.type;
    state.width = Number(nextState.width) || state.width;
    state.height = Number(nextState.height) || state.height;
    state.profile = nextState.profile || state.profile;
    state.color = nextState.color || state.color;
    state.glazing = nextState.glazing || state.glazing;
    state.extras = Array.isArray(nextState.extras) ? nextState.extras : state.extras;

    if (
      state.width !== previousWidth ||
      state.height !== previousHeight ||
      state.type !== previousType
    ) {
      /* Keep the user's zoom but refit the new dimensions. */
      zoomFactor = clamp(zoomFactor, 0.72, 1.45);
    }

    build();
  }

  function setOpen(open) {
    isOpen = Boolean(open);
    pivots.forEach((pivot) => {
      if (reducedMotion) pivot.rotation.y = isOpen ? pivot.userData.openAngle : 0;
    });
  }

  function rotate(delta) {
    targetRotationY += delta;
    spinVelocity = 0;
  }

  function reset() {
    targetRotationY = 0;
    targetRotationX = 0;
    zoomFactor = 1;
  }

  function onPointerDown(event) {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    dragging = true;
    spinVelocity = 0;
    pointerId = event.pointerId;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    container.classList.add("is-dragging");
    container.focus({ preventScroll: true });
    if (renderer.domElement.setPointerCapture) {
      renderer.domElement.setPointerCapture(event.pointerId);
    }
  }

  function onPointerMove(event) {
    if (!dragging || event.pointerId !== pointerId) return;
    const dx = event.clientX - lastPointerX;
    const dy = event.clientY - lastPointerY;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;

    targetRotationY += dx * 0.0062;
    targetRotationX = clamp(targetRotationX + dy * 0.0028, -0.22, 0.22);
    spinVelocity = dx * 0.0062;
  }

  function onPointerUp(event) {
    if (pointerId !== null && event.pointerId !== pointerId) return;
    dragging = false;
    container.classList.remove("is-dragging");
    if (renderer.domElement.releasePointerCapture && pointerId !== null) {
      try {
        renderer.domElement.releasePointerCapture(pointerId);
      } catch (error) {
        /* pointer may already be released */
      }
    }
    pointerId = null;
  }

  function onWheel(event) {
    event.preventDefault();
    zoomFactor = clamp(zoomFactor + event.deltaY * 0.00055, 0.78, 1.34);
  }

  function onDoubleClick() {
    reset();
  }

  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  renderer.domElement.addEventListener("pointermove", onPointerMove);
  renderer.domElement.addEventListener("pointerup", onPointerUp);
  renderer.domElement.addEventListener("pointercancel", onPointerUp);
  renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
  renderer.domElement.addEventListener("dblclick", onDoubleClick);

  /* Pause the render loop when the stage is out of view */
  let stageVisible = true;
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(
      (entries) => {
        const inView = entries.some((entry) => entry.isIntersecting);
        if (inView && !stageVisible) {
          stageVisible = true;
          start();
        } else if (!inView && stageVisible) {
          stageVisible = false;
          running = false;
        }
      },
      { rootMargin: "120px 0px" }
    ).observe(container);
  }

  const clock = new THREE.Clock();

  function renderFrame() {
    if (!running || disposed) return;
    const dt = Math.min(0.05, clock.getDelta());
    const smooth = 1 - Math.exp(-dt * 8.5);

    if (!dragging) {
      targetRotationY += spinVelocity;
      spinVelocity *= 0.94;
      if (Math.abs(spinVelocity) < 0.0004) spinVelocity = 0;
    }

    root.rotation.y += (targetRotationY - root.rotation.y) * smooth;
    root.rotation.x += (targetRotationX - root.rotation.x) * smooth;

    const desiredDistance = fitDistance * zoomFactor;
    camera.position.z += (desiredDistance - camera.position.z) * (1 - Math.exp(-dt * 5.5));

    pivots.forEach((pivot) => {
      const target = isOpen ? pivot.userData.openAngle : 0;
      pivot.rotation.y += (target - pivot.rotation.y) * (1 - Math.exp(-dt * 6.4));
    });

    renderer.render(scene, camera);
    frameId = window.requestAnimationFrame(renderFrame);
  }

  function start() {
    if (running || disposed) return;
    running = true;
    clock.start();
    frameId = window.requestAnimationFrame(renderFrame);
  }

  function stop() {
    running = false;
    window.cancelAnimationFrame(frameId);
  }

  const resizeObserver = new ResizeObserver(() => {
    resize();
    if (!running) renderer.render(scene, camera);
  });
  resizeObserver.observe(container);

  const intersectionObserver = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) start();
      else stop();
    },
    { threshold: 0.01 }
  );
  intersectionObserver.observe(container);

  const onVisibilityChange = () => {
    if (document.hidden) stop();
    else if (container.getBoundingClientRect().height > 0) start();
  };
  document.addEventListener("visibilitychange", onVisibilityChange);

  resize();
  /* Initial model before the first update */
  state.width = 1400;
  state.height = 1400;
  state.type = "double";
  state.color = "white";
  state.glazing = "standard";
  state.extras = ["install"];
  build();
  if (!reducedMotion) {
    targetRotationY = 0;
    root.rotation.y = -0.32;
  }
  renderer.render(scene, camera);
  start();

  function dispose() {
    disposed = true;
    stop();
    resizeObserver.disconnect();
    intersectionObserver.disconnect();
    document.removeEventListener("visibilitychange", onVisibilityChange);
    disposeGroup(model);
    buildMaterials.forEach((material) => material.dispose());
    buildMaterials.clear();
    buildTextures.forEach((texture) => texture.dispose());
    buildTextures.clear();
    sky.geometry.dispose();
    sky.material.dispose();
    skyTexture.dispose();
    woodTexture.dispose();
    wallTexture.dispose();
    glareTexture.dispose();
    netTexture.dispose();
    envTexture.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  }

  return { update, setOpen, rotate, reset, dispose };
}
