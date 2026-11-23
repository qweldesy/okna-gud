/* ============================================================
   SpotlightCard (React Bits, vanilla port) — свет следует
   за курсором, кромка карты ловит свечение, flare при нажатии.
   Подключение: добавить data-spotlight на карточку. Конфиг:
   data-spotlight-color, data-intensity, data-spotlight-size,
   data-softness, data-border-glow, data-proximity, data-smoothing,
   data-flare="false", data-ambient="true".
   Слои накладываются поверх фона карточки (mix-blend-mode: screen),
   фон и содержимое карточки не трогаются.
   ============================================================ */

(() => {
  "use strict";

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const falloff = (color, softness) => {
    const soft = clamp(softness, 0, 1);
    const core = (1 - soft) ** 1.5 * 0.85;
    const stop = (alpha, at) =>
      `color-mix(in srgb, ${color} ${(alpha * 100).toFixed(2)}%, transparent) ${(at * 100).toFixed(2)}%`;
    const list = [stop(1, 0)];
    for (let i = 0; i <= 14; i++) {
      const t = core + ((1 - core) * i) / 14;
      const g = (t - core) / (1 - core);
      const smooth = 1 - g * g * (3 - 2 * g);
      const glow = Math.exp(-4.6 * g * g) * (1 - g ** 6);
      list.push(stop(smooth + (glow - smooth) * soft, t));
    }
    return list.join(", ");
  };

  const NOISE =
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function gradient(shape, size, x, y, stops) {
    if (shape === "beam") {
      const reach = Math.max(size * 0.6, y + size * 0.55);
      return `radial-gradient(${(size * 0.55).toFixed(1)}px ${reach.toFixed(1)}px at ${x.toFixed(1)}px 0px, ${stops})`;
    }
    return `radial-gradient(circle ${size.toFixed(1)}px at ${x.toFixed(1)}px ${y.toFixed(1)}px, ${stops})`;
  }

  const cards = [];

  function create(root) {
    if (root.__spotlight) return;

    const d = root.dataset;
    const cfg = {
      color: d.spotlightColor || "#ffffff",
      intensity: d.intensity !== undefined ? clamp(Number(d.intensity), 0, 1) : 0.13,
      size: Math.max(20, d.spotlightSize ? Number(d.spotlightSize) : 260),
      softness: d.softness !== undefined ? clamp(Number(d.softness), 0, 1) : 0.85,
      shape: d.shape === "beam" ? "beam" : "circle",
      borderGlow: d.borderGlow !== undefined ? clamp(Number(d.borderGlow), 0, 1) : 0.55,
      proximity: Math.max(0, d.proximity !== undefined ? Number(d.proximity) : 90),
      smoothing: d.smoothing !== undefined ? clamp(Number(d.smoothing), 0, 1) : 0.35,
      ambient: d.ambient === "true",
      flare: d.flare !== "false",
      grain: d.grain !== undefined ? clamp(Number(d.grain), 0, 1) : 0,
    };
    cfg.fill = falloff(cfg.color, cfg.softness);
    cfg.edge = falloff(cfg.color, 1);

    root.classList.add("spotlight-fx");

    const light = document.createElement("span");
    light.className = "sc-light";
    light.setAttribute("aria-hidden", "true");

    const grain = document.createElement("span");
    grain.className = "sc-grain";
    grain.setAttribute("aria-hidden", "true");
    if (cfg.grain > 0) grain.style.backgroundImage = NOISE;
    else grain.style.display = "none";

    const edge = document.createElement("span");
    edge.className = "sc-edge";
    edge.setAttribute("aria-hidden", "true");

    root.prepend(light, grain, edge);

    const state = {
      x: 0, y: 0, presence: 0, flare: 0,
      time: Math.random() * 60, pressed: false, visible: true,
    };
    const drawn = { light: "", edge: "" };
    let focus = null;
    let raf = 0;
    let last = 0;

    const paint = () => {
      const size = cfg.size * (1 + 0.2 * state.flare);
      const boost = 1 + 0.7 * state.flare;
      const fill = gradient(cfg, size, state.x, state.y, cfg.fill);
      const rim = gradient(cfg, size * 0.6, state.x, cfg.shape === "beam" ? 0 : state.y, cfg.edge);
      if (fill !== drawn.light) {
        drawn.light = fill;
        light.style.background = fill;
      }
      if (rim !== drawn.edge) {
        drawn.edge = rim;
        edge.style.background = rim;
      }
      light.style.opacity = String(Math.min(1, state.presence * cfg.intensity * boost));
      edge.style.opacity = String(Math.min(1, state.presence * cfg.borderGlow * boost));
      if (cfg.grain > 0) {
        const grainy = gradient(cfg, size, state.x, state.y, "#000 0%, transparent 100%");
        grain.style.webkitMaskImage = grainy;
        grain.style.maskImage = grainy;
        grain.style.opacity = String(state.presence * cfg.grain);
      }
    };

    function tick(now) {
      raf = 0;
      if (!state.visible) return;
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      const rect = root.getBoundingClientRect();
      let tx = state.x;
      let ty = state.y;
      let target = 0;

      if (focus && root.contains(focus)) {
        const box = focus.getBoundingClientRect();
        tx = box.left + box.width / 2 - rect.left;
        ty = box.top + box.height / 2 - rect.top;
        target = 1;
      } else if (bus.active) {
        tx = bus.x - rect.left;
        ty = bus.y - rect.top;
        const gap = Math.hypot(
          Math.max(0, -tx, tx - rect.width),
          Math.max(0, -ty, ty - rect.height)
        );
        if (gap === 0) target = 1;
        else if (cfg.proximity > 0) target = Math.max(0, 1 - gap / cfg.proximity) ** 2;
      }

      if (target < 0.6 && cfg.ambient && state.visible) {
        if (!reduceMotion) state.time += dt;
        const drift = 0.6 - target;
        tx += (rect.width * (0.5 + 0.34 * Math.sin(state.time * 0.43)) - tx) * (drift / 0.6);
        ty += (rect.height * (0.5 + 0.3 * Math.sin(state.time * 0.61 + 1.3)) - ty) * (drift / 0.6);
        target = 0.6;
      }

      if (state.presence < 0.02 && target > 0) {
        state.x = tx;
        state.y = ty;
      }

      const follow = reduceMotion || cfg.smoothing === 0 ? 1 : 1 - Math.exp(-dt / (0.015 + cfg.smoothing * 0.22));
      state.x += (tx - state.x) * follow;
      state.y += (ty - state.y) * follow;
      const fade = reduceMotion ? 1 : 1 - Math.exp(-dt / (target > state.presence ? 0.1 : 0.32));
      state.presence += (target - state.presence) * fade;
      if (Math.abs(target - state.presence) < 0.002) state.presence = target;
      const press = state.pressed && cfg.flare && !reduceMotion ? 1 : 0;
      state.flare += (press - state.flare) * (1 - Math.exp(-dt / (press ? 0.05 : 0.28)));
      if (Math.abs(press - state.flare) < 0.002) state.flare = press;

      paint();

      const moving = Math.abs(tx - state.x) > 0.1 || Math.abs(ty - state.y) > 0.1;
      const settled = !moving && state.presence === target && state.flare === press;
      if (!settled) {
        raf = requestAnimationFrame(tick);
      }
    }

    function wake() {
      if (raf) return;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    }

    const io = new IntersectionObserver((entries) => {
      state.visible = entries.some((entry) => entry.isIntersecting);
      if (state.visible) wake();
    });
    io.observe(root);

    root.addEventListener("pointerdown", () => {
      state.pressed = true;
      wake();
    });
    root.addEventListener("focusin", (event) => {
      if (!(event.target instanceof Element) || !event.target.matches(":focus-visible")) return;
      focus = event.target;
      wake();
    });
    root.addEventListener("focusout", (event) => {
      if (root.contains(event.relatedTarget)) return;
      focus = null;
      wake();
    });

    cards.push({ root, wake, releasePointer: () => { state.pressed = false; } });

    wake();
  }

  /* ---------- shared pointer bus ---------- */

  const bus = { x: -10000, y: -10000, active: false };

  function wakeAll() {
    cards.forEach((card) => card.wake());
  }

  window.addEventListener("pointermove", (e) => {
    bus.x = e.clientX;
    bus.y = e.clientY;
    bus.active = true;
    wakeAll();
  }, { passive: true });

  window.addEventListener("pointerup", () => {
    cards.forEach((card) => card.releasePointer());
    wakeAll();
  }, { passive: true });

  window.addEventListener("pointercancel", () => {
    cards.forEach((card) => card.releasePointer());
  }, { passive: true });

  document.addEventListener("pointerout", (event) => {
    if (!event.relatedTarget) {
      bus.active = false;
      wakeAll();
    }
  });

  window.addEventListener("scroll", wakeAll, { capture: true, passive: true });

  function initAll() {
    document
      .querySelectorAll("[data-spotlight]")
      .forEach((el) => create(el));
  }

  initAll();
  window.SpotlightCard = { create };
})();
