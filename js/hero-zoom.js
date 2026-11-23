/* ============================================================
   Hero stage — video, проигрываемый скроллом
   Наезд на дом → стеклянная стена распахивается → название.
   Видео 5.18s: currentTime = прогресс скролла; для плавности
   целевой прогресс сглаживается в rAF-цикле.
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

  if (reduceMotion || !video) {
    stage.classList.add("is-static");
    if (header) header.classList.add("is-visible");
    return;
  }

  let duration = 0;
  let pTarget = 0;
  let p = 0;
  let visible = true;
  let raf = 0;

  function wake() {
    if (!raf) raf = requestAnimationFrame(apply);
  }

  video.addEventListener("loadedmetadata", () => {
    duration = video.duration || 0;
    wake();
  });
  if (video.readyState >= 1) duration = video.duration || 0;

  function computeTarget() {
    const rect = stage.getBoundingClientRect();
    const total = Math.max(rect.height - window.innerHeight, 1);
    pTarget = clamp(-rect.top / total, 0, 1);
  }

  function apply(now) {
    raf = 0;
    const dur = duration || (Number.isFinite(video.duration) ? video.duration : 0);
    if (visible && dur > 0) {
      p += (pTarget - p) * 0.22;
      if (Math.abs(pTarget - p) < 0.0006) p = pTarget;
      const settled = p === pTarget;

      const t = clamp(p, 0, 1) * (dur - 0.04);
      if (Math.abs(video.currentTime - t) > 0.012) {
        try {
          video.currentTime = t;
        } catch (error) {
          /* seek may fail while the video is still loading */
        }
      }

      /* the scroll hint melts away as soon as the guest starts scrolling */
      if (hint) {
        const ho = 1 - smooth(0.015, 0.075, p);
        hint.style.opacity = ho.toFixed(3);
        hint.style.visibility = ho > 0.01 ? "visible" : "hidden";
      }

      if (brand) {
        const bo = smooth(0.6, 0.78, p);
        brand.style.opacity = bo.toFixed(3);
        brand.style.visibility = bo > 0.01 ? "visible" : "hidden";
        brand.style.transform = `translate(-50%, calc(-50% + ${((1 - bo) * 30).toFixed(1)}px))`;
      }

      if (bar) bar.style.transform = `scaleY(${p.toFixed(4)})`;

      /* Navbar appears when the video story is finished */
      if (header) header.classList.toggle("is-visible", p > 0.985);

      if (!settled) wake();
    }
  }

  computeTarget();
  p = pTarget;

  let io = null;
  if ("IntersectionObserver" in window) {
    io = new IntersectionObserver(
      (entries) => {
        visible = entries.some((entry) => entry.isIntersecting);
        wake();
      },
      { rootMargin: "140px 0px" }
    );
    io.observe(pin);
  }

  window.addEventListener("scroll", () => {
    computeTarget();
    wake();
  }, { passive: true });
  window.addEventListener("resize", () => {
    computeTarget();
    wake();
  });

  wake();
})();
