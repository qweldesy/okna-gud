/* ============================================================
   GlassSurface (React Bits, vanilla port) — liquid glass
   Edge refraction via SVG displacement filter in Chromium,
   frosted-glass fallback in Safari/Firefox.

   Usage: add [data-glass] to an element. Config via data-*:
   data-radius, data-border-width, data-distortion, data-red,
   data-green, data-blue, data-displace, data-bg-opacity,
   data-saturation, data-brightness, data-opacity, data-blur,
   data-mix (mix-blend-mode of the two edge gradients).
   The map auto-follows the live size and border-radius.
   ============================================================ */

(() => {
  "use strict";

  const registry = [];

  function supportsSVGFilters(id) {
    if (typeof document === "undefined") return false;
    if (/Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent)) return false;
    if (/Firefox/.test(navigator.userAgent)) return false;
    const div = document.createElement("div");
    div.style.backdropFilter = `url(#${id})`;
    return div.style.backdropFilter !== "";
  }

  function generateMap(w, h, cfg) {
    const edge = Math.min(w, h) * (cfg.borderWidth * 0.5);
    const svg =
      `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">` +
      `<defs>` +
      `<linearGradient id="gr" x1="100%" y1="0%" x2="0%" y2="0%"><stop offset="0%" stop-color="#0000"/><stop offset="100%" stop-color="red"/></linearGradient>` +
      `<linearGradient id="gb" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#0000"/><stop offset="100%" stop-color="blue"/></linearGradient>` +
      `<filter id="soft" filterUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${cfg.blur}"/></filter>` +
      `</defs>` +
      `<rect x="0" y="0" width="${w}" height="${h}" fill="black"/>` +
      `<rect x="0" y="0" width="${w}" height="${h}" rx="${cfg.radius}" fill="url(#gr)"/>` +
      `<rect x="0" y="0" width="${w}" height="${h}" rx="${cfg.radius}" fill="url(#gb)" style="mix-blend-mode:${cfg.mix}"/>` +
      `<rect x="${edge}" y="${edge}" width="${w - edge * 2}" height="${h - edge * 2}" rx="${cfg.radius}" fill="hsl(0 0% ${cfg.brightness}% / ${cfg.opacity})" filter="url(#soft)"/>` +
      `</svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }

  function createGlass(el) {
    if (el.__glass) return el.__glass;

    const d = el.dataset;
    const cfg = {
      borderRadius: d.radius ? Number(d.radius) : 20,
      borderWidth: d.borderWidth ? Number(d.borderWidth) : 0.08,
      distortionScale: d.distortion ? Number(d.distortion) : -180,
      redOffset: d.red ? Number(d.red) : 0,
      greenOffset: d.green ? Number(d.green) : 10,
      blueOffset: d.blue ? Number(d.blue) : 20,
      displace: d.displace ? Number(d.displace) : 0,
      backgroundOpacity: d.bgOpacity ? Number(d.bgOpacity) : 0,
      saturation: d.saturation ? Number(d.saturation) : 1,
      brightness: d.brightness ? Number(d.brightness) : 50,
      opacity: d.opacity ? Number(d.opacity) : 0.93,
      blur: d.blur ? Number(d.blur) : 11,
      mix: d.mix || "difference",
    };

    const id = `glass-filter-${Math.random().toString(36).slice(2, 8)}`;
    const supported = supportsSVGFilters(id);

    el.classList.add("glass-surface");
    el.classList.add(supported ? "glass-surface--svg" : "glass-surface--fallback");
    el.style.setProperty("--glass-frost", cfg.backgroundOpacity.toFixed(3));
    el.style.setProperty("--glass-saturation", cfg.saturation.toFixed(3));
    el.style.setProperty("--filter-id", `url(#${id})`);

    let feImage = null;
    let blurNode = null;
    const channels = [];

    if (supported) {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "glass-surface__filter");
      svg.setAttribute("aria-hidden", "true");
      const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
      const filter = document.createElementNS("http://www.w3.org/2000/svg", "filter");
      filter.setAttribute("id", id);
      filter.setAttribute("color-interpolation-filters", "sRGB");
      filter.setAttribute("x", "0%");
      filter.setAttribute("y", "0%");
      filter.setAttribute("width", "100%");
      filter.setAttribute("height", "100%");

      feImage = document.createElementNS("http://www.w3.org/2000/svg", "feImage");
      feImage.setAttribute("x", "0");
      feImage.setAttribute("y", "0");
      feImage.setAttribute("width", "100%");
      feImage.setAttribute("height", "100%");
      feImage.setAttribute("preserveAspectRatio", "none");
      feImage.setAttribute("result", "map");
      filter.appendChild(feImage);

      [["red", cfg.redOffset, "red"], ["green", cfg.greenOffset, "green"], ["blue", cfg.blueOffset, "blue"]].forEach(
        ([name, offset, result]) => {
          const disp = document.createElementNS("http://www.w3.org/2000/svg", "feDisplacementMap");
          disp.setAttribute("in", "SourceGraphic");
          disp.setAttribute("in2", "map");
          disp.setAttribute("scale", String(cfg.distortionScale + offset));
          disp.setAttribute("xChannelSelector", "R");
          disp.setAttribute("yChannelSelector", "G");
          disp.setAttribute("result", `disp${name}`);
          const matrix = document.createElementNS("http://www.w3.org/2000/svg", "feColorMatrix");
          matrix.setAttribute("in", `disp${name}`);
          const zero = "0 0 0 0 0";
          matrix.setAttribute(
            "values",
            name === "red"
              ? `1 0 0 0 0 ${zero} ${zero} 0 0 0 1 0`
              : name === "green"
                ? `${zero} 0 1 0 0 ${zero} 0 0 0 1 0`
                : `${zero} ${zero} 0 0 1 0 0 0 1 0`
          );
          matrix.setAttribute("result", result);
          filter.appendChild(disp);
          filter.appendChild(matrix);
          channels.push({ disp, offset });
        }
      );

      const blend1 = document.createElementNS("http://www.w3.org/2000/svg", "feBlend");
      blend1.setAttribute("in", "red");
      blend1.setAttribute("in2", "green");
      blend1.setAttribute("mode", "screen");
      blend1.setAttribute("result", "rg");
      const blend2 = document.createElementNS("http://www.w3.org/2000/svg", "feBlend");
      blend2.setAttribute("in", "rg");
      blend2.setAttribute("in2", "blue");
      blend2.setAttribute("mode", "screen");
      blend2.setAttribute("result", "out");
      blurNode = document.createElementNS("http://www.w3.org/2000/svg", "feGaussianBlur");
      blurNode.setAttribute("in", "out");
      blurNode.setAttribute("stdDeviation", String(cfg.displace));
      filter.appendChild(blend1);
      filter.appendChild(blend2);
      filter.appendChild(blurNode);
      defs.appendChild(filter);
      svg.appendChild(defs);
      el.prepend(svg);
    }

    let lastW = 0;
    let lastH = 0;
    let lastR = -1;
    let regenTimer = 0;

    function regenerate(force = false) {
      if (!supported || !feImage) return;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
      if (!w || !h) return;
      if (!force && w === lastW && h === lastH && Math.abs(radius - lastR) < 0.5) return;
      lastW = w;
      lastH = h;
      lastR = radius;
      cfg.radius = radius;
      const url = generateMap(w, h, cfg);
      feImage.setAttribute("href", url);
    }

    function scheduleRegen() {
      if (regenTimer) return;
      regenTimer = window.setTimeout(() => {
        regenTimer = 0;
        regenerate(true);
      }, 110);
    }

    if ("ResizeObserver" in window) {
      const ro = new ResizeObserver(() => {
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        if (w !== lastW || h !== lastH) scheduleRegen();
      });
      ro.observe(el);
    }

    regenerate(true);

    el.__glass = {
      refresh: () => regenerate(true),
      supported,
    };
    registry.push(el);
    return el.__glass;
  }

  function initAll() {
    document.querySelectorAll("[data-glass]").forEach((el) => createGlass(el));
  }

  initAll();
  window.GlassSurface = { create: createGlass };
})();
