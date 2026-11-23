/* ============================================================
   AccordionGallery (React Bits, vanilla port) — ряд панелей,
   активная раскрывается (GSAP): flex-grow, tilt, параллакс
   внутри кадра, ч/б у свёрнутых, подпись с акцентной чертой.
   Разметка статична в HTML; конфиг — через data-gag на корне.
   ============================================================ */

(() => {
  "use strict";

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function create(root) {
    if (root.__ag) return;

    const d = root.dataset;
    const cfg = {
      defaultIndex: d.defaultIndex ? Number(d.defaultIndex) : 1,
      duration: d.duration ? Number(d.duration) : 0.6,
      ease: d.ease || "power3.out",
      parallax: d.parallax !== undefined ? Number(d.parallax) : 0.5,
      tilt: d.tilt !== undefined ? Number(d.tilt) : 8,
      stagger: d.stagger ? Number(d.stagger) : 0.06,
      expandRatio: d.expandRatio ? Number(d.expandRatio) : 0.52,
      grayscale: d.grayscale !== "false",
      showLabels: d.showLabels !== "false",
      trigger: d.trigger || "hover",
    };

    const panels = Array.from(root.querySelectorAll(".ag-panel"));
    const count = panels.length;
    if (!count) return;

    let active = clamp(cfg.defaultIndex, 0, count - 1);
    let mediaSize = 320;
    let firstRun = true;
    let tl = null;

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    /* на тач-устройствах тап генерирует mouseenter/focus ДО click —
       если переключать активную панель на них, к моменту клика панель
       уже «активна» и клик уносит в конфигуратор. Только click. */
    const coarse = window.matchMedia("(hover: none), (pointer: coarse)").matches;
    const hoverMode = !coarse && cfg.trigger === "hover";

    function applyLayout(animate) {
      const r = clamp(cfg.expandRatio, 0.2, 0.9);
      const grow = count > 1 ? (r * (count - 1)) / (1 - r) : 1;
      const dur = animate && !prefersReduced ? cfg.duration : 0;

      if (tl) tl.kill();
      const timeline = gsap.timeline();

      panels.forEach((panel, i) => {
        const isActive = i === active;
        const media = panel.querySelector(".ag-panel__media");
        const bar = panel.querySelector(".ag-panel__bar");
        const text = panel.querySelector(".ag-panel__text");

        const rot = isActive ? 0 : i < active ? cfg.tilt : -cfg.tilt;

        timeline.to(
          panel,
          { flexGrow: isActive ? grow : 1, rotateY: rot, duration: dur, ease: cfg.ease },
          0
        );

        if (media) {
          const drift = clamp(active - i, -1.5, 1.5);
          const shift = drift * cfg.parallax * mediaSize * 0.06;
          const gray = cfg.grayscale ? (isActive ? 0 : 1) : 0;
          timeline.to(
            media,
            {
              xPercent: -50,
              yPercent: -50,
              x: isActive ? 0 : shift,
              "--ag-gray": gray,
              "--ag-dim": isActive ? 0 : 0.35,
              duration: dur,
              ease: cfg.ease,
            },
            0
          );
        }

        if (cfg.showLabels && bar && text) {
          if (isActive) {
            timeline.to(
              [bar, text],
              { opacity: 1, x: 0, duration: dur, ease: cfg.ease, stagger: prefersReduced ? 0 : cfg.stagger },
              0
            );
          } else {
            timeline.to([bar, text], { opacity: 0, x: -14, duration: dur * 0.6, ease: cfg.ease }, 0);
          }
        }

        panel.classList.toggle("ag-panel--active", isActive);
        if (isActive) panel.setAttribute("aria-current", "true");
        else panel.removeAttribute("aria-current");
      });

      tl = timeline;
    }

    function measure() {
      const rect = root.getBoundingClientRect();
      const usable = Math.max(rect.width - 10 * (count - 1), 120);
      const size = Math.max(140, usable * clamp(cfg.expandRatio, 0.2, 0.9) * 1.22);
      mediaSize = size;
      root.style.setProperty("--ag-media-size", `${Math.round(size)}px`);
      applyLayout(!firstRun);
    }

    if ("ResizeObserver" in window) {
      const ro = new ResizeObserver(measure);
      ro.observe(root);
    }

    panels.forEach((panel, i) => {
      if (hoverMode) {
        panel.addEventListener("mouseenter", () => {
          if (i !== active) {
            firstRun = false;
            active = i;
            applyLayout(true);
          }
        });
      }
      if (!coarse) {
        panel.addEventListener("focus", () => {
          if (i !== active) {
            firstRun = false;
            active = i;
            applyLayout(true);
          }
        });
      }
      panel.addEventListener("click", (e) => {
        if (i !== active) {
          e.preventDefault();
          firstRun = false;
          active = i;
          applyLayout(true);
        }
      });
      panel.addEventListener("keydown", (e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          e.preventDefault();
          const next = (i + 1) % count;
          active = next;
          applyLayout(true);
          panels[next].focus();
        } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          e.preventDefault();
          const prev = (i - 1 + count) % count;
          active = prev;
          applyLayout(true);
          panels[prev].focus();
        }
      });
    });

    /* initial state without animation */
    measure();
    applyLayout(false);
    firstRun = false;

    root.__ag = { setActive: (i) => { active = clamp(i, 0, count - 1); applyLayout(true); } };
  }

  document.querySelectorAll("[data-gag]").forEach(create);
  window.AccordionGallery = { create };
})();
