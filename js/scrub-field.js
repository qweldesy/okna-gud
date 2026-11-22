/* ============================================================
   ScrubField — vanilla JS port of the React Bits component
   (reactbits.dev, MIT-style license).

   Numeric chip: drag anywhere on it to scrub the value, click
   without moving to type, arrows / PageUp / PageDown / Home /
   End to step, Shift = coarse, Alt = fine, Esc cancels.

   Adapter notes for this site:
   - Config comes from data-attributes on the mount element.
   - The internal <input> keeps the id from data-input-id, so
     existing code can still find it by id.
   - Every committed change dispatches a real `input` event on
     the input, and every commit a `change` event — drop-in
     replacement for a native numeric control.
   - The rubber-band snap back uses a critically damped spring
     on rAF (same feel as the React spring with bounce: 0).
   ============================================================ */

(() => {
  "use strict";

  const LEAN = 4;
  const SIZES = {
    sm: { height: 28, font: 12, radius: 6, width: 104 },
    md: { height: 34, font: 13, radius: 8, width: 128 },
    lg: { height: 44, font: 16, radius: 10, width: 160 },
  };

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const decimalsOf = (n) => {
    const s = String(n);
    const i = s.indexOf(".");
    return i < 0 ? 0 : s.length - i - 1;
  };

  const onColor = (hex) => {
    const raw = String(hex || "").replace("#", "");
    const full = raw.length === 3 ? [...raw].map((ch) => ch + ch).join("") : raw.slice(0, 6);
    const n = parseInt(full, 16);
    if (Number.isNaN(n)) return "#ffffff";
    const yiq = (((n >> 16) & 255) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000;
    return yiq >= 128 ? "#111111" : "#ffffff";
  };

  const intFormatter = new Intl.NumberFormat("ru-RU");
  let uid = 0;

  function createScrubField(root) {
    if (!root || root.scrubField) return root.scrubField || null;

    const d = root.dataset;
    const cfg = {
      label: d.label || "Radius",
      suffix: d.suffix || "",
      min: Number(d.min ?? 0),
      max: Number(d.max ?? 100),
      step: Number(d.step ?? 1),
      size: d.size || "md",
      width: d.width ? Number(d.width) : null,
      sensitivity: Number(d.sensitivity ?? 2),
      rubberReach: Number(d.rubberReach ?? 8),
      returnDuration: Number(d.returnDuration ?? 300),
      coarseMultiplier: Number(d.coarse ?? 10),
      fineMultiplier: Number(d.fine ?? 0.1),
      showDelta: d.showDelta !== "false",
      showDirty: d.showDirty === "true",
      showFill: d.showFill !== "false",
      accent: d.accent || "#f5f5f5",
      chipColor: d.chipColor || "#27272a",
      disabled: d.disabled === "true",
      inputId: d.inputId || "",
      defaultValue: Number(d.default ?? 24),
      initialValue: d.value !== undefined && d.value !== "" ? Number(d.value) : undefined,
    };

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const preset = SIZES[cfg.size] || SIZES.md;

    const baseDecimals = decimalsOf(cfg.step);
    const fineDecimals = Math.min(6, baseDecimals + decimalsOf(cfg.fineMultiplier));

    const fmt = (v) => {
      const scaled = v * 10 ** baseDecimals;
      const decimals = Math.abs(scaled - Math.round(scaled)) < 1e-6 ? baseDecimals : fineDecimals;
      if (decimals === 0) return intFormatter.format(Math.round(v));
      return v.toFixed(decimals);
    };
    const signed = (delta) => (delta < 0 ? "−" : "+") + fmt(Math.abs(delta));

    /* ---- DOM ---- */

    const el = (tag, className) => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      return node;
    };

    root.classList.add("scrub-field");
    root.style.setProperty("--sf-accent", cfg.accent);
    root.style.setProperty("--sf-chip", cfg.chipColor);
    root.style.setProperty("--sf-ghost-ink", onColor(cfg.accent));
    root.style.setProperty("--sf-h", `${preset.height}px`);
    root.style.setProperty("--sf-fs", `${preset.font}px`);
    root.style.setProperty("--sf-r", `${preset.radius}px`);
    root.style.setProperty("--sf-w", `${cfg.width || preset.width}px`);
    if (cfg.disabled) root.dataset.disabled = "true";

    let fillEl = null;
    if (cfg.showFill) {
      const track = el("span", "scrub-field__track");
      fillEl = el("span", "scrub-field__fill");
      track.setAttribute("aria-hidden", "true");
      track.appendChild(fillEl);
      root.appendChild(track);
    }

    const handle = el("label", "scrub-field__handle");
    handle.textContent = cfg.label;

    const input = el("input", "scrub-field__input");
    input.type = "text";
    input.inputMode = "decimal";
    input.autocomplete = "off";
    input.setAttribute("role", "spinbutton");
    if (cfg.inputId) input.id = cfg.inputId;
    else input.id = `scrub-field-${(uid += 1)}`;
    handle.htmlFor = input.id;
    input.disabled = cfg.disabled;

    root.appendChild(handle);
    root.appendChild(input);

    if (cfg.suffix) {
      const suffixEl = el("span", "scrub-field__suffix");
      suffixEl.textContent = cfg.suffix;
      suffixEl.setAttribute("aria-hidden", "true");
      root.appendChild(suffixEl);
    }

    let ghostEl = null;
    if (cfg.showDelta) {
      ghostEl = el("span", "scrub-field__ghost");
      ghostEl.setAttribute("aria-hidden", "true");
      root.appendChild(ghostEl);
    }

    /* ---- State ---- */

    let value = cfg.initialValue !== undefined ? cfg.initialValue : cfg.defaultValue;
    value = clamp(value, cfg.min, cfg.max);
    let shown = value; /* displayed value, may sit outside bounds on the rubber band */
    let dragging = false;
    let typing = false;
    let draft = null;
    let moved = false;
    let springRaf = 0;

    const drag = { active: false, id: 0, x: 0, raw: 0, mult: 1, before: 0, slack: 3, left: 0 };
    let onEscDrag = null;

    const reach = (cfg.rubberReach / 100) * Math.max(cfg.max - cfg.min, Number.EPSILON);
    const bend = (raw) => (reach ? Math.sign(raw) * reach * Math.log1p(Math.abs(raw) / reach) : 0);
    const unbend = (over) => (reach ? Math.sign(over) * reach * Math.expm1(Math.abs(over) / reach) : 0);
    const toShown = (raw) => {
      const c = clamp(raw, cfg.min, cfg.max);
      return c + bend(raw - c);
    };
    const toRaw = (displayed) => {
      const c = clamp(displayed, cfg.min, cfg.max);
      return c + unbend(displayed - c);
    };
    const multiplierOf = (e) =>
      e.shiftKey ? cfg.coarseMultiplier : e.altKey ? cfg.fineMultiplier : 1;

    function render() {
      if (!typing) input.value = fmt(shown);
      root.dataset.over = shown < cfg.min || shown > cfg.max ? "true" : "false";
      const lean = reduceMotion || !reach ? 0 : clamp((shown - clamp(shown, cfg.min, cfg.max)) / reach, -1, 1) * LEAN;
      root.style.transform = `translateX(${lean.toFixed(2)}px)`;
      if (fillEl) {
        const f = (clamp(shown, cfg.min, cfg.max) - cfg.min) / Math.max(cfg.max - cfg.min, Number.EPSILON);
        fillEl.style.transform = `scaleX(${f.toFixed(4)})`;
      }
    }

    function syncAria() {
      input.setAttribute("aria-valuenow", String(value));
      input.setAttribute("aria-valuemin", String(cfg.min));
      input.setAttribute("aria-valuemax", String(cfg.max));
      input.setAttribute("aria-valuetext", `${fmt(value)}${cfg.suffix ? ` ${cfg.suffix}` : ""}`);
      root.dataset.dirty = cfg.showDirty && value !== cfg.defaultValue ? "true" : "false";
    }

    function commit(next) {
      const rounded = clamp(Number(next.toFixed(fineDecimals)), cfg.min, cfg.max);
      if (rounded === value) return false;
      value = rounded;
      syncAria();
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    }

    function cancelSpring() {
      if (springRaf) {
        cancelAnimationFrame(springRaf);
        springRaf = 0;
      }
    }

    function jumpTo(target) {
      cancelSpring();
      shown = target;
      render();
    }

    /* Critically damped spring (bounce: 0 in the React original). */
    function springTo(target) {
      cancelSpring();
      if (reduceMotion || Math.abs(shown - target) < 1e-9) {
        shown = target;
        render();
        return;
      }
      const from = shown;
      const duration = Math.max(cfg.returnDuration, 60) / 1000;
      const omega = 6 / duration;
      const t0 = performance.now();
      const frame = (now) => {
        const t = Math.min((now - t0) / 1000, duration * 1.35);
        const decay = Math.exp(-omega * t) * (1 + omega * t);
        shown = target + (from - target) * decay;
        render();
        if (t < duration * 1.35 && Math.abs(shown - target) > 0.001) {
          springRaf = requestAnimationFrame(frame);
        } else {
          shown = target;
          render();
          springRaf = 0;
        }
      };
      springRaf = requestAnimationFrame(frame);
    }

    function dispatchCommitted() {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }

    /* ---- Drag ---- */

    function onPointerDown(e) {
      if (cfg.disabled || drag.active || e.button !== 0 || typing) return;
      if (e.pointerType !== "touch") e.preventDefault();
      cancelSpring();
      moved = false;
      drag.active = true;
      drag.id = e.pointerId;
      drag.x = e.clientX;
      drag.raw = toRaw(shown);
      drag.mult = multiplierOf(e);
      drag.before = value;
      drag.slack = e.pointerType === "touch" ? 8 : 3;
      drag.left = root.getBoundingClientRect().left;
      try {
        root.setPointerCapture(e.pointerId);
      } catch (error) {
        /* capture may fail on exotic pointers — drag still works */
      }
      onEscDrag = (ev) => {
        if (ev.key === "Escape") endDrag(true);
      };
      window.addEventListener("keydown", onEscDrag);
    }

    function onPointerMove(e) {
      if (!drag.active || e.pointerId !== drag.id) return;
      if (!moved) {
        if (Math.abs(e.clientX - drag.x) < drag.slack) return;
        moved = true;
        drag.x = e.clientX;
        dragging = true;
        root.dataset.dragging = "true";
        document.documentElement.style.cursor = "ew-resize";
      }
      const mult = multiplierOf(e);
      if (mult !== drag.mult) {
        drag.mult = mult;
        drag.raw = toRaw(shown);
        drag.x = e.clientX;
      }
      const raw = drag.raw + Math.round((e.clientX - drag.x) / cfg.sensitivity) * cfg.step * mult;
      shown = toShown(raw);
      render();
      commit(clamp(raw, cfg.min, cfg.max));
      if (ghostEl) {
        ghostEl.style.translate = `calc(${e.clientX - drag.left}px - 50%) -100%`;
        ghostEl.textContent = signed(shown - drag.before);
      }
    }

    function endDrag(cancel = false) {
      if (!drag.active) return;
      drag.active = false;
      dragging = false;
      delete root.dataset.dragging;
      document.documentElement.style.cursor = "";
      if (onEscDrag) {
        window.removeEventListener("keydown", onEscDrag);
        onEscDrag = null;
      }
      if (cancel) {
        commit(drag.before);
        jumpTo(drag.before);
        return;
      }
      if (!moved) {
        input.focus();
        return;
      }
      const bound = clamp(shown, cfg.min, cfg.max);
      if (shown !== bound) springTo(bound);
      if (value !== drag.before) {
        dispatchCommitted();
      }
    }

    root.addEventListener("pointerdown", onPointerDown);
    root.addEventListener("pointermove", onPointerMove);
    root.addEventListener("pointerup", () => endDrag());
    root.addEventListener("pointercancel", () => endDrag(true));
    root.addEventListener("lostpointercapture", () => endDrag());

    handle.addEventListener("click", (e) => {
      if (moved) e.preventDefault();
    });

    /* ---- Typing ---- */

    function leaveTyping() {
      typing = false;
      draft = null;
      delete root.dataset.typing;
      input.value = fmt(shown);
      render();
    }

    input.addEventListener("focus", () => {
      typing = true;
      draft = input.value;
      root.dataset.typing = "true";
      input.select();
    });

    input.addEventListener("input", () => {
      draft = input.value;
    });

    input.addEventListener("keydown", (e) => {
      const typedNumber = draft !== null && draft.trim() !== "" ? Number(draft) : NaN;
      const from = Number.isNaN(typedNumber) ? value : typedNumber;
      const deltas = {
        ArrowUp: cfg.step * multiplierOf(e),
        ArrowDown: -cfg.step * multiplierOf(e),
        PageUp: cfg.step * cfg.coarseMultiplier,
        PageDown: -cfg.step * cfg.coarseMultiplier,
      };
      const delta = deltas[e.key];
      if (delta !== undefined || e.key === "Home" || e.key === "End") {
        e.preventDefault();
        leaveTyping();
        commit(delta !== undefined ? from + delta : e.key === "Home" ? cfg.min : cfg.max);
        jumpTo(value);
        dispatchCommitted();
      } else if (e.key === "Enter") {
        e.preventDefault();
        input.blur();
      } else if (e.key === "Escape") {
        e.preventDefault();
        leaveTyping();
        input.blur();
      }
    });

    input.addEventListener("blur", () => {
      const n = draft === null ? NaN : parseFloat(draft.replace(/[^\d.,-]/g, "").replace(",", "."));
      if (!Number.isNaN(n)) {
        commit(n);
        dispatchCommitted();
      }
      leaveTyping();
      jumpTo(shown);
    });

    /* ---- Init + public API ---- */

    input.value = fmt(shown);
    syncAria();
    render();

    const api = {
      getValue: () => value,
      getShown: () => shown,
      set(next) {
        const v = clamp(Number(next), cfg.min, cfg.max);
        if (!Number.isFinite(v)) return;
        const changed = v !== value;
        cancelSpring();
        value = v;
        shown = v;
        syncAria();
        input.value = fmt(shown);
        render();
        if (changed) input.dispatchEvent(new Event("input", { bubbles: true }));
      },
      focus: () => input.focus(),
    };

    root.scrubField = api;
    return api;
  }

  function init() {
    document.querySelectorAll("[data-scrub-field]").forEach((node) => createScrubField(node));
  }

  init();

  /* Public hook for manual mounts */
  window.ScrubField = { create: createScrubField };
})();
