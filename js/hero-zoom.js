/* ============================================================
   Hero stage — scroll-scrub «наезд на дом»
   Desktop: видео 5.17s, currentTime = прогресс скролла.
   Touch (iOS/Android): канвас + 90 кадров (img/hero-frames) —
   без декода видео: подмена кадра мгновенная, без чёрных
   кадров и рывков iOS-сиков.
   Reduced motion → статичный постер + название.
   ============================================================ */

(() => {
  "use strict";

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const smooth = (a, b, v) => {
    const t = clamp((v - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };

  const stage = document.getElementById("hero-stage");
  if (!stage) return;

  const pin = stage.querySelector(".hero-stage__pin");
  const video = stage.querySelector(".hero-stage__video");
  const hint = stage.querySelector(".hero-stage__hint");
  const brand = stage.querySelector(".hero-brand");
  const bar = stage.querySelector(".hero-stage__progress span");
  const header = document.querySelector(".site-header");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const touchDevice =
    (navigator.maxTouchPoints || 0) > 0 &&
    window.matchMedia("(pointer: coarse)").matches;

  /* ---------- общее состояние ---------- */

  const state = {
    p: 0,
    pTarget: 0,
    visible: true,
    raf: 0,
    navShown: false,
  };

  function computeTarget() {
    const rect = stage.getBoundingClientRect();
    const total = Math.max(rect.height - window.innerHeight, 1);
    state.pTarget = clamp(-rect.top / total, 0, 1);
  }

  function wake() {
    if (!state.raf) state.raf = requestAnimationFrame(apply);
  }

  function apply() {
    state.raf = 0;
    /* прогресс и UI-классы — всегда; «дорогая» отрисовка — только
       когда сцена в вьюпорте (иначе прыжок мимо hero оставлял
       навбар скрытым навсегда) */
    state.p += (state.pTarget - state.p) * 0.22;
    if (Math.abs(state.pTarget - state.p) < 0.0006) state.p = state.pTarget;

    if (hint) {
      const ho = 1 - smooth(0.015, 0.075, state.p);
      hint.style.opacity = ho.toFixed(3);
      hint.style.visibility = ho > 0.01 ? "visible" : "hidden";
    }

    if (brand) {
      const bo = smooth(0.6, 0.78, state.p);
      brand.style.opacity = bo.toFixed(3);
      brand.style.visibility = bo > 0.01 ? "visible" : "hidden";
      brand.style.transform = `translate(-50%, calc(-50% + ${((1 - bo) * 30).toFixed(1)}px))`;
    }

    if (bar) bar.style.transform = `scaleY(${state.p.toFixed(4)})`;

    /* навбаром владеет scroll-обработчик (тогл по pTarget) —
       здесь не трогаем, иначе сглаженный p перетирает класс */

    if (state.visible && window.engineDraw) window.engineDraw(state.p);

    /* живём в rAF, пока не догнали палец; на месте — 0 rAF */
    if (state.p !== state.pTarget) state.raf = requestAnimationFrame(apply);
  }

  window.addEventListener("scroll", () => {
    computeTarget();
    /* появление навбара — по целевому прогрессу, напрямую:
       не зависит от rAF-троттлинга и не ждёт догоняющего easing */
    if (header) {
      const show = state.pTarget > 0.985;
      if (show !== state.navShown) {
        state.navShown = show;
        header.classList.toggle("is-visible", show);
      }
    }
    wake();
  }, { passive: true });
  window.addEventListener("resize", () => {
    computeTarget();
    if (header) {
      const show = state.pTarget > 0.985;
      if (show !== state.navShown) {
        state.navShown = show;
        header.classList.toggle("is-visible", show);
      }
    }
    wake();
  });

  /* ============================================================
     TOUCH ENGINE — канвас + кадровые картинки
     ============================================================ */

  function initCanvasEngine() {
    video.style.display = "none";

    const canvas = document.createElement("canvas");
    canvas.className = "hero-stage__canvas";
    canvas.setAttribute("aria-hidden", "true");
    pin.insertBefore(canvas, pin.firstChild);

    const ctx = canvas.getContext("2d");
    const FRAMES = 90;
    const frameUrl = (i) => `img/hero-frames/f${String(i + 1).padStart(3, "0")}.jpg`;
    const imgs = new Array(FRAMES).fill(null);

    const nearestIndex = (idx) => {
      if (imgs[idx]) return idx;
      for (let d = 1; d < FRAMES; d++) {
        if (imgs[idx - d]) return idx - d;
        if (imgs[idx + d]) return idx + d;
      }
      return -1;
    };

    function sizeCanvas() {
      const r = pin.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(r.width * dpr));
      canvas.height = Math.max(1, Math.round(r.height * dpr));
    }

    function draw(p) {
      if (!canvas.width) sizeCanvas();
      const idx = nearestIndex(clamp(Math.round(p * (FRAMES - 1)), 0, FRAMES - 1));
      if (idx < 0) return; /* пока кадры не приехали — виден CSS-постер */
      const img = imgs[idx];
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      const scale = Math.max(canvas.width / iw, canvas.height / ih);
      const dw = iw * scale;
      const dh = ih * scale;
      ctx.fillStyle = "#050505";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
    }

    window.engineDraw = (p) => draw(p);

    window.addEventListener("resize", () => {
      sizeCanvas();
      draw(state.p);
    });

    /* прогрессивная загрузка: сначала каждые 8-й кадр (весь сюжет
       виден сразу), затем остальные подряд */
    const order = [];
    for (let i = 0; i < FRAMES; i += 8) order.push(i);
    for (let i = 0; i < FRAMES; i++) if (i % 8 !== 0) order.push(i);

    let next = 0;
    function loadNext() {
      if (next >= order.length) return;
      const i = order[next];
      next += 1;
      const im = new Image();
      im.decoding = "async";
      im.onload = () => {
        imgs[i] = im;
        draw(state.p);
        loadNext();
      };
      im.src = frameUrl(i);
    }
    loadNext();
    loadNext();
    loadNext();
    loadNext();
  }

  /* ============================================================
     DESKTOP ENGINE — видео-скраб
     ============================================================ */

  let duration = 0;

  function videoDraw(p) {
    const dur = duration || (Number.isFinite(video.duration) ? video.duration : 0);
    if (!state.visible || !(dur > 0)) {
      if (!video.paused) video.pause();
      return;
    }
    const settled = state.p === state.pTarget;
    const t = clamp(p, 0, 1) * (dur - 0.04);
    if (Math.abs(video.currentTime - t) > 0.012) {
      try {
        video.currentTime = t;
      } catch (error) {
        /* seek может падать, пока видео ещё грузится */
      }
    }
    /* играем, пока гость скроллит; пауза на остановке — меньше декода */
    if (settled && !video.paused) video.pause();
    if (!settled && video.paused) {
      const pr = video.play();
      if (pr && typeof pr.catch === "function") pr.catch(() => {});
    }
  }

  video.addEventListener("loadedmetadata", () => {
    duration = video.duration || 0;
    wake();
  });

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(
      (entries) => {
        state.visible = entries.some((entry) => entry.isIntersecting);
        if (!state.visible && !touchDevice && !video.paused) video.pause();
        wake();
      },
      { rootMargin: "140px 0px" }
    ).observe(pin);
  }

  /* ============================================================
     BOOT
     ============================================================ */

  computeTarget();
  state.p = state.pTarget;
  state.navShown = state.pTarget > 0.985;
  if (header && (state.navShown || reduceMotion)) header.classList.add("is-visible");

  if (reduceMotion) {
    stage.classList.add("is-static");
    video.style.display = "none";
    if (hint) hint.style.opacity = "0";
    return;
  }

  if (touchDevice) {
    initCanvasEngine();
  } else {
    video.src = video.dataset.src;
    video.muted = true;
    video.playsInline = true;
    try {
      video.load();
    } catch (error) {
      /* ignore */
    }
    window.engineDraw = (p) => videoDraw(p);
  }
  wake();
})();
