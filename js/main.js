/* ============================================================
   Окна-Гуд — interface, pricing, forms, scene loading
   ============================================================ */

(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Set here a form endpoint (Formspree, Getform, own API...). */
  const LEAD_ENDPOINT = "";
  const STORAGE_KEY = "okna-gud-config-v1";
  const WAIT = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

  const numberFormatter = new Intl.NumberFormat("ru-RU");
  const formatInt = (value) => numberFormatter.format(Math.round(value));
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const TYPE_LABELS = {
    single: "Одностворчатое окно",
    double: "Двустворчатое окно",
    triple: "Трёхстворчатое окно",
    balcony: "Балконный блок",
  };

  const PROFILE_LABELS = {
    blitz: "REHAU Blitz 58",
    softline: "VEKA Softline 70",
    delight: "REHAU Delight 70",
  };

  const GLASS_LABELS = {
    standard: "2-камерный стеклопакет",
    triple: "3-камерный стеклопакет",
    energy: "энергосберегающий стеклопакет",
    multi: "мультифункциональный стеклопакет",
  };

  const COLOR_LABELS = {
    white: "белый",
    anthracite: "антрацит",
    oak: "тёмный дуб",
  };

  /* ============================================================
     REVEALS
     ============================================================ */

  function initReveals() {
    const heroItems = $$("[data-hero]").sort(
      (a, b) => Number(a.dataset.hero) - Number(b.dataset.hero)
    );

    const Motion = window.Motion;

    if (!Motion || reduceMotion) {
      [...heroItems, ...$$("[data-reveal]")].forEach((el) => {
        el.style.opacity = "1";
        el.style.transform = "none";
      });
      return;
    }

    const easing = [0.22, 0.61, 0.36, 1];

    if (heroItems.length) {
      Motion.animate(
        heroItems,
        { opacity: [0, 1], y: [18, 0] },
        { duration: 0.9, delay: Motion.stagger(0.075, { startDelay: 0.08 }), ease: easing }
      );
    }

    $$("[data-reveal-group]").forEach((group) => {
      const items = $$("[data-reveal]", group);
      if (!items.length) return;
      Motion.inView(
        group,
        () => {
          Motion.animate(
            items,
            { opacity: [0, 1], y: [20, 0] },
            { duration: 0.8, delay: Motion.stagger(0.065), ease: easing }
          );
        },
        { margin: "0px 0px -10% 0px", once: true }
      );
    });

    $$("[data-reveal]").forEach((el) => {
      if (el.closest("[data-reveal-group]")) return;
      Motion.inView(
        el,
        () => {
          Motion.animate(
            el,
            { opacity: [0, 1], y: [18, 0] },
            { duration: 0.75, ease: easing }
          );
        },
        { margin: "0px 0px -8% 0px", once: true }
      );
    });

    const spark = $(".spark-hero");
    if (spark) {
      Motion.animate(
        spark,
        { y: [0, -12, 0], rotate: [0, 2.5, 0] },
        { duration: 11, repeat: Infinity, ease: "easeInOut" }
      );
    }
  }

  /* ============================================================
     HEADER + MOBILE MENU
     ============================================================ */

  function initHeader() {
    const header = $(".site-header");
    const toggle = $(".nav-toggle");
    const menu = $("#mobile-menu");
    const scrim = $("#menu-scrim");
    const main = $("#main");
    const footer = $(".site-footer");

    if (!header) return;

    const onScroll = () => {
      header.classList.toggle("is-scrolled", window.scrollY > 20);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    if (!toggle || !menu) return;

    const setMenu = (open) => {
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Закрыть меню" : "Открыть меню");
      document.body.classList.toggle("menu-open", open);
      if (scrim) scrim.hidden = !open;
      if (main) main.inert = open;
      if (footer) footer.inert = open;

      if (open) {
        menu.hidden = false;
        if (window.Motion && !reduceMotion) {
          window.Motion.animate(
            menu,
            { opacity: [0, 1], y: [-8, 0] },
            { duration: 0.28, ease: [0.22, 0.61, 0.36, 1] }
          );
        }
        window.setTimeout(() => {
          const firstLink = $("a", menu);
          if (firstLink) firstLink.focus();
        }, 120);
      } else {
        menu.hidden = true;
      }
    };

    toggle.addEventListener("click", () => {
      setMenu(toggle.getAttribute("aria-expanded") !== "true");
    });

    if (scrim) {
      scrim.addEventListener("click", () => {
        setMenu(false);
        toggle.focus();
      });
    }

    $$("a", menu).forEach((link) => {
      link.addEventListener("click", () => setMenu(false));
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
        setMenu(false);
        toggle.focus();
      }
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 1024 && toggle.getAttribute("aria-expanded") === "true") {
        setMenu(false);
      }
    });
  }

  /* ============================================================
     CONFIGURATOR
     ============================================================ */

  const stageEl = $("#stage-canvas");
  const loadingEl = $("#stage-loading");
  const fallbackEl = $("#stage-fallback");
  const openButton = $("#toggle-open");
  const widthInput = $("#width-range");
  const heightInput = $("#height-range");
  let widthScrub = null;
  let heightScrub = null;

  let config = null;
  let sceneControl = null;
  let sceneRequested = false;
  let sceneRaf = 0;
  let saveTimer = 0;
  let displayedPrice = null;
  let priceRaf = 0;
  let isOpen = false;

  function readConfig() {
    const typeEl = $('input[name="window-type"]:checked');
    const profileEl = $('input[name="profile"]:checked');
    const glazingEl = $('input[name="glazing"]:checked');
    const colorEl = $('input[name="color"]:checked');
    const extras = $$('input[name="extra"]:checked').map((input) => ({
      value: input.value,
      price: Number(input.dataset.price) || 0,
    }));

    const sizeValue = (input, scrub, fallback) => {
      const v = scrub ? scrub.getValue() : input ? Number(input.value) : NaN;
      return Number.isFinite(v) ? v : fallback;
    };

    const width = sizeValue(widthInput, widthScrub, 1400);
    const height = sizeValue(heightInput, heightScrub, 1400);

    return {
      type: typeEl ? typeEl.value : "double",
      typeMult: typeEl ? Number(typeEl.dataset.mult) || 1 : 1.06,
      width,
      height,
      profile: profileEl ? profileEl.value : "softline",
      profileRate: profileEl ? Number(profileEl.dataset.rate) || 14900 : 14900,
      glazing: glazingEl ? glazingEl.value : "standard",
      glazingAdd: glazingEl ? Number(glazingEl.dataset.add) || 0 : 0,
      color: colorEl ? colorEl.value : "white",
      colorAdd: colorEl ? Number(colorEl.dataset.add) || 0 : 0,
      extras: extras.map((extra) => extra.value),
      extraItems: extras,
    };
  }

  function computePrice(current) {
    const area = (current.width / 1000) * (current.height / 1000);
    const windowBase = area * (current.profileRate * current.typeMult + current.glazingAdd + current.colorAdd);
    const extrasTotal = current.extraItems.reduce((sum, extra) => sum + extra.price, 0);
    const installItem = current.extraItems.find((extra) => extra.value === "install");
    const install = installItem ? installItem.price : 0;
    const optionsTotal = extrasTotal - install;
    const total = Math.round((windowBase + extrasTotal) / 100) * 100;

    return {
      area,
      windowBase,
      extrasTotal,
      optionsTotal,
      install,
      total,
      monthly: Math.round(total / 6 / 10) * 10,
    };
  }

  function setAllPriceDisplays(value) {
    $$("[data-price-display]").forEach((el) => {
      el.textContent = formatInt(value);
    });
  }

  function animatePriceTo(target, animate = true) {
    window.cancelAnimationFrame(priceRaf);
    const from = displayedPrice == null ? target : displayedPrice;

    if (!animate || reduceMotion || from === target) {
      displayedPrice = target;
      setAllPriceDisplays(target);
      return;
    }

    const start = performance.now();
    const duration = 460;

    const tick = (now) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = Math.round(from + (target - from) * eased);
      displayedPrice = value;
      setAllPriceDisplays(value);
      if (progress < 1) {
        priceRaf = window.requestAnimationFrame(tick);
      } else {
        displayedPrice = target;
        setAllPriceDisplays(target);
      }
    };

    priceRaf = window.requestAnimationFrame(tick);
  }

  function renderConfig(animatePrice = true) {
    config = readConfig();
    const price = computePrice(config);

    const dimWidth = $("#dim-width");
    const dimHeight = $("#dim-height");

    if (dimWidth) dimWidth.textContent = `${formatInt(config.width)} мм`;
    if (dimHeight) dimHeight.textContent = `${formatInt(config.height)} мм`;

    animatePriceTo(price.total, animatePrice);

    const monthly = $("[data-monthly]");
    if (monthly) monthly.textContent = formatInt(price.monthly);

    const breakdownWindow = $('[data-breakdown="window"]');
    const breakdownExtras = $('[data-breakdown="extras"]');
    const breakdownInstall = $('[data-breakdown="install"]');
    if (breakdownWindow) breakdownWindow.textContent = `${formatInt(price.windowBase)} ₽`;
    if (breakdownExtras) {
      breakdownExtras.textContent = price.optionsTotal
        ? `${formatInt(price.optionsTotal)} ₽`
        : "не выбраны";
    }
    if (breakdownInstall) {
      breakdownInstall.textContent = price.install ? `${formatInt(price.install)} ₽` : "не выбран";
    }

    config.price = price;
    scheduleScene();
    persistConfig();
  }

  function scheduleScene() {
    if (!sceneControl || sceneRaf) return;
    sceneRaf = window.requestAnimationFrame(() => {
      sceneRaf = 0;
      if (sceneControl && config) sceneControl.update(config);
    });
  }

  function persistConfig() {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      try {
        const saved = {
          type: config.type,
          width: config.width,
          height: config.height,
          profile: config.profile,
          glazing: config.glazing,
          color: config.color,
          extras: config.extras,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
      } catch (error) {
        /* localStorage may be unavailable in private mode. */
      }
    }, 180);
  }

  function restoreConfig() {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    } catch (error) {
      saved = null;
    }
    if (!saved || typeof saved !== "object") return;

    const radioFields = [
      ["window-type", saved.type],
      ["profile", saved.profile],
      ["glazing", saved.glazing],
      ["color", saved.color],
    ];

    radioFields.forEach(([name, value]) => {
      if (!value) return;
      const input = $(`input[name="${name}"][value="${value}"]`);
      if (input) input.checked = true;
    });

    if (widthInput && Number.isFinite(Number(saved.width))) {
      const w = clamp(Number(saved.width), 700, 2200);
      if (widthScrub) widthScrub.set(w);
      else widthInput.value = String(w);
    }
    if (heightInput && Number.isFinite(Number(saved.height))) {
      const h = clamp(Number(saved.height), 700, 2200);
      if (heightScrub) heightScrub.set(h);
      else heightInput.value = String(h);
    }

    if (Array.isArray(saved.extras)) {
      $$('input[name="extra"]').forEach((input) => {
        input.checked = saved.extras.includes(input.value);
      });
    }
  }

  function updateOpenButton() {
    if (!openButton) return;
    openButton.setAttribute("aria-pressed", String(isOpen));
    const label = $("span", openButton);
    if (label) label.textContent = isOpen ? "Закрыть створку" : "Открыть створку";
  }

  function toggleWindowSash() {
    isOpen = !isOpen;
    updateOpenButton();
    if (sceneControl) sceneControl.setOpen(isOpen);
  }

  function loadScene() {
    if (sceneRequested || !stageEl) return;
    sceneRequested = true;

    import("./scene.js")
      .then((module) => {
        sceneControl = module.createWindowScene(stageEl, { reducedMotion: reduceMotion });
        sceneControl.update(config);
        sceneControl.setOpen(isOpen);
        if (loadingEl) loadingEl.classList.add("is-hidden");
        stageEl.classList.add("is-ready");
        if (fallbackEl) fallbackEl.hidden = true;
        stageEl.setAttribute("tabindex", "0");
        stageEl.setAttribute("role", "application");
        stageEl.setAttribute(
          "aria-label",
          "3D-модель окна. Стрелки — повернуть модель, Home — сбросить вид, Enter — открыть или закрыть створку."
        );
      })
      .catch((error) => {
        console.error("3D scene failed to load:", error);
        if (loadingEl) loadingEl.classList.add("is-hidden");
        if (fallbackEl) fallbackEl.hidden = false;
      });
  }

  function initConfigurator() {
    if (!widthInput || !heightInput) return;

    widthScrub = widthInput.closest(".scrub-field")?.scrubField || null;
    heightScrub = heightInput.closest(".scrub-field")?.scrubField || null;

    restoreConfig();

    $$('input[name="window-type"], input[name="profile"], input[name="glazing"], input[name="color"], input[name="extra"]').forEach((input) => {
      input.addEventListener("change", () => renderConfig(true));
    });

    [widthInput, heightInput].forEach((input) => {
      input.addEventListener("input", () => renderConfig(false));
    });

    if (openButton) openButton.addEventListener("click", toggleWindowSash);

    if (stageEl) {
      stageEl.addEventListener("keydown", (event) => {
        if (!sceneControl) return;
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          sceneControl.rotate(-0.28);
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          sceneControl.rotate(0.28);
        } else if (event.key === "Home") {
          event.preventDefault();
          sceneControl.reset();
        } else if (event.key === "Enter" && event.target === stageEl) {
          event.preventDefault();
          toggleWindowSash();
        }
      });
    }

    renderConfig(false);

    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            observer.disconnect();
            loadScene();
          }
        },
        { rootMargin: "650px 0px" }
      );
      observer.observe(stageEl);
    } else {
      loadScene();
    }

    /* Public hook for QA and the configurable hero artwork. */
    window.OknaGud = {
      getConfig: () => ({ ...config, price: computePrice(config) }),
      setConfig(partial) {
        if (!partial) return;
        if (partial.type) {
          const input = $(`input[name="window-type"][value="${partial.type}"]`);
          if (input) input.checked = true;
        }
        if (partial.profile) {
          const input = $(`input[name="profile"][value="${partial.profile}"]`);
          if (input) input.checked = true;
        }
        if (partial.glazing) {
          const input = $(`input[name="glazing"][value="${partial.glazing}"]`);
          if (input) input.checked = true;
        }
        if (partial.color) {
          const input = $(`input[name="color"][value="${partial.color}"]`);
          if (input) input.checked = true;
        }
        if (partial.extras) {
          $$('input[name="extra"]').forEach((input) => {
            input.checked = partial.extras.includes(input.value);
          });
        }
        if (widthInput && Number.isFinite(Number(partial.width))) {
          const w = clamp(Number(partial.width), 700, 2200);
          if (widthScrub) widthScrub.set(w);
          else widthInput.value = String(w);
        }
        if (heightInput && Number.isFinite(Number(partial.height))) {
          const h = clamp(Number(partial.height), 700, 2200);
          if (heightScrub) heightScrub.set(h);
          else heightInput.value = String(h);
        }
        renderConfig(true);
      },
      toggleOpen: toggleWindowSash,
      rotate(delta) {
        if (sceneControl) sceneControl.rotate(Number(delta) || 0);
      },
      resetView() {
        if (sceneControl) sceneControl.reset();
      },
      setOpen(value) {
        isOpen = Boolean(value);
        updateOpenButton();
        if (sceneControl) sceneControl.setOpen(isOpen);
      },
      openLeadBooking(data) {
        openLeadDialog("booking", data);
      },
    };
  }

  /* ============================================================
     WORKS → CONFIGURATOR
     ============================================================ */

  function initWorkLinks() {
    const links = $$("[data-work-config]");
    if (!links.length) return;

    links.forEach((link) => {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        /* в аккордеоне-галерее первый тап лишь раскрывает панель;
           переход к конфигуратору — только по уже раскрытой */
        const panel = link.closest(".ag-panel");
        if (panel && !panel.classList.contains("ag-panel--active")) return;
        let preset = null;
        try {
          preset = JSON.parse(link.dataset.workConfig || "null");
        } catch (error) {
          preset = null;
        }

        if (preset && window.OknaGud) {
          window.OknaGud.setConfig(preset);
        }

        const sizeTab = $("#tab-size");
        if (sizeTab) sizeTab.click();

        const section = $("#configurator");
        if (section) {
          section.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
        }

        const shell = $(".config-shell");
        if (shell) {
          shell.classList.remove("is-highlighted");
          /* restart the short highlight pulse */
          void shell.offsetWidth;
          shell.classList.add("is-highlighted");
          window.setTimeout(() => shell.classList.remove("is-highlighted"), 1800);
        }
      });
    });
  }

  /* ============================================================
     CONFIG TABS
     ============================================================ */

  function initTabs() {
    const tabs = $$(".config-tab");
    const panels = $$(".tab-panel");
    if (!tabs.length) return;

    const activate = (tab, focus = false) => {
      tabs.forEach((item) => {
        const selected = item === tab;
        item.classList.toggle("is-active", selected);
        item.setAttribute("aria-selected", String(selected));
        item.tabIndex = selected ? 0 : -1;
      });
      panels.forEach((panel) => {
        const selected = panel.id === tab.getAttribute("aria-controls");
        panel.classList.toggle("is-active", selected);
        panel.hidden = !selected;
      });
      const scroller = $("#config-panels");
      if (scroller) scroller.scrollTop = 0;
      if (focus) tab.focus();
    };

    tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => activate(tab));
      tab.addEventListener("keydown", (event) => {
        let nextIndex = null;
        if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
        if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
        if (event.key === "Home") nextIndex = 0;
        if (event.key === "End") nextIndex = tabs.length - 1;
        if (nextIndex === null) return;
        event.preventDefault();
        activate(tabs[nextIndex], true);
      });
    });
  }

  /* ============================================================
     FAQ
     ============================================================ */

  function initFaq() {
    const items = $$(".faq-item");
    if (!items.length) return;

    const setItem = (item, open) => {
      const button = $(".faq-q", item);
      const panel = $(".faq-a", item);
      item.classList.toggle("is-open", open);
      if (button) button.setAttribute("aria-expanded", String(open));
      if (panel) {
        panel.setAttribute("aria-hidden", String(!open));
        panel.inert = !open;
      }
    };

    items.forEach((item) => {
      setItem(item, item.classList.contains("is-open"));
      const button = $(".faq-q", item);
      if (!button) return;
      button.addEventListener("click", () => {
        const willOpen = !item.classList.contains("is-open");
        items.forEach((other) => setItem(other, false));
        if (willOpen) setItem(item, true);
      });
    });
  }

  /* ============================================================
     FORMS + DIALOGS
     ============================================================ */

  const dialogs = {
    lead: $("#lead-dialog"),
    privacy: $("#privacy-dialog"),
  };

  let leadMode = "callback";
  let lastSnapshot = null;
  let bookingData = null;

  function digitsOnly(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function formatPhone(value) {
    let digits = digitsOnly(value).slice(0, 11);
    if (!digits) return "";
    if (digits.startsWith("8")) digits = `7${digits.slice(1)}`;
    if (!digits.startsWith("7") && digits.length === 10) digits = `7${digits}`;
    if (!digits.startsWith("7")) return String(value);
    const rest = digits.slice(1);
    let output = "+7";
    if (rest.length) output += ` (${rest.slice(0, 3)}`;
    if (rest.length >= 3) output += ")";
    if (rest.length > 3) output += ` ${rest.slice(3, 6)}`;
    if (rest.length > 6) output += `-${rest.slice(6, 8)}`;
    if (rest.length > 8) output += `-${rest.slice(8, 10)}`;
    return output;
  }

  function isPhoneValid(value) {
    const digits = digitsOnly(value);
    if (digits.length === 11) return digits.startsWith("7") || digits.startsWith("8");
    if (digits.length === 10) return digits.startsWith("9");
    return false;
  }

  function fieldErrorId(field) {
    const prefix = field.form && field.form.id === "dialog-form" ? "dialog" : "lead";
    if (field.name === "consent") return `${prefix}-consent-error`;
    return `${prefix}-${field.name}-error`;
  }

  function setFieldError(field, message) {
    const id = fieldErrorId(field);
    const error = document.getElementById(id);
    field.setAttribute("aria-invalid", message ? "true" : "false");
    if (message) field.setAttribute("aria-describedby", id);
    else field.removeAttribute("aria-describedby");
    if (error) error.textContent = message || "";
  }

  function validateForm(form) {
    const name = form.querySelector('[name="name"]');
    const phone = form.querySelector('[name="phone"]');
    const consent = form.querySelector('[name="consent"]');
    let firstInvalid = null;

    setFieldError(name, "");
    setFieldError(phone, "");
    setFieldError(consent, "");

    if (name.value.trim().length < 2) {
      setFieldError(name, "Напишите, как к вам обращаться");
      firstInvalid = firstInvalid || name;
    }

    if (!isPhoneValid(phone.value)) {
      setFieldError(phone, "Введите телефон в формате +7 (999) 000-00-00");
      firstInvalid = firstInvalid || phone;
    }

    if (!consent.checked) {
      setFieldError(consent, "Нужно согласие на обработку данных");
      firstInvalid = firstInvalid || consent;
    }

    if (firstInvalid) {
      firstInvalid.focus({ preventScroll: false });
      return false;
    }

    return true;
  }

  function snapshotConfig() {
    if (!config) return null;
    const price = computePrice(config);
    return {
      type: TYPE_LABELS[config.type] || "Окно",
      size: `${formatInt(config.width)} × ${formatInt(config.height)} мм`,
      profile: PROFILE_LABELS[config.profile] || "Профиль",
      glass: GLASS_LABELS[config.glazing] || "Стеклопакет",
      color: COLOR_LABELS[config.color] || "белый",
      extras: config.extraItems.map((extra) => extra.value),
      total: price.total,
      monthly: price.monthly,
      area: Number(price.area.toFixed(2)),
    };
  }

  function setDialogMode(mode) {
    leadMode = mode;
    const eyebrow = $("#dialog-eyebrow");
    const title = $("#dialog-title");
    const description = $("#dialog-description");
    const configBox = $("#dialog-config");
    const totalRow = configBox ? configBox.querySelector(".dialog-total") : null;
    const submitLabel = $("#dialog-submit span");

    if (mode === "config" && config) {
      lastSnapshot = snapshotConfig();
      if (eyebrow) eyebrow.textContent = "Ваш расчёт";
      if (title) title.textContent = "Зафиксировать цену";
      if (description) description.textContent = "Оставьте телефон — инженер перезвонит, согласует замер и подтвердит смету.";
      if (configBox) configBox.hidden = false;
      if (totalRow) totalRow.hidden = false;
      if (submitLabel) submitLabel.textContent = "Отправить расчёт";

      const typeEl = $("#dialog-config-type");
      const sizeEl = $("#dialog-config-size");
      const profileEl = $("#dialog-config-profile");
      const glassEl = $("#dialog-config-glass");
      const priceEl = $("#dialog-price");
      if (typeEl) typeEl.textContent = lastSnapshot.type;
      if (sizeEl) sizeEl.textContent = lastSnapshot.size;
      if (profileEl) profileEl.textContent = `${lastSnapshot.profile} · ${lastSnapshot.color}`;
      if (glassEl) glassEl.textContent = lastSnapshot.glass;
      if (priceEl) priceEl.textContent = formatInt(lastSnapshot.total);
    } else if (mode === "booking" && bookingData) {
      lastSnapshot = null;
      if (eyebrow) eyebrow.textContent = "Заявка";
      if (title) title.textContent = "Записаться на замер";
      if (description) description.textContent = "Мы подтвердим выбранную дату по телефону. Перенести или отменить можно в любой момент.";
      if (configBox) configBox.hidden = false;
      if (totalRow) totalRow.hidden = true;
      if (submitLabel) submitLabel.textContent = "Отправить заявку";

      const typeEl = $("#dialog-config-type");
      const sizeEl = $("#dialog-config-size");
      const profileEl = $("#dialog-config-profile");
      const glassEl = $("#dialog-config-glass");
      const priceEl = $("#dialog-price");
      if (typeEl) typeEl.textContent = `Объект: ${bookingData.viewLabel}`;
      if (sizeEl) sizeEl.textContent = `Замер: ${bookingData.measureText}`;
      if (profileEl) profileEl.textContent = `Монтаж: ${bookingData.installText}`;
      if (glassEl) glassEl.textContent = `Окон: ${bookingData.windows}`;
      if (priceEl) priceEl.textContent = "";
    } else {
      lastSnapshot = null;
      if (eyebrow) eyebrow.textContent = "Заявка";
      if (title) title.textContent = "Бесплатный замер";
      if (description) description.textContent = "Оставьте телефон — перезвоним в течение 15 минут и подберём удобное время.";
      if (configBox) configBox.hidden = true;
      if (totalRow) totalRow.hidden = false;
      if (submitLabel) submitLabel.textContent = "Записаться на замер";
    }
  }

  function syncBodyLock() {
    const hasOpenDialog = Object.values(dialogs).some((dialog) => dialog && dialog.open);
    document.body.classList.toggle("is-locked", hasOpenDialog);
  }

  function openLeadDialog(mode = "callback", data = null) {
    const dialog = dialogs.lead;
    if (!dialog) return;

    if (data) bookingData = data;
    setDialogMode(mode);

    const form = $("#dialog-form");
    const success = $("#dialog-success");
    if (form) form.hidden = false;
    if (success) success.hidden = true;

    if (typeof dialog.showModal === "function") {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }

    syncBodyLock();
    window.setTimeout(() => {
      const name = $("#dialog-name");
      if (name) name.focus();
    }, 60);
  }

  function closeLeadDialog() {
    const dialog = dialogs.lead;
    if (!dialog) return;
    if (typeof dialog.close === "function" && dialog.open) dialog.close();
    else dialog.removeAttribute("open");
    syncBodyLock();
  }

  function openPrivacyDialog() {
    const dialog = dialogs.privacy;
    if (!dialog) return;
    if (typeof dialog.showModal === "function") {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
    syncBodyLock();
  }

  function closePrivacyDialog() {
    const dialog = dialogs.privacy;
    if (!dialog) return;
    if (typeof dialog.close === "function" && dialog.open) dialog.close();
    else dialog.removeAttribute("open");
    syncBodyLock();
  }

  async function submitForm(form, kind) {
    const submit = form.querySelector('[type="submit"]');
    const label = submit ? submit.querySelector("span") : null;
    const originalLabel = label ? label.textContent : "";
    const micro = form.querySelector(".form-micro");
    const microDefault = micro ? micro.textContent : "";

    if (!validateForm(form)) return;

    if (submit) submit.disabled = true;
    if (label) label.textContent = "Отправляем…";
    if (micro) {
      micro.textContent = microDefault;
      micro.style.color = "";
    }

    const name = form.querySelector('[name="name"]').value.trim();
    const phone = formatPhone(form.querySelector('[name="phone"]').value) || form.querySelector('[name="phone"]').value.trim();
    const commentField = form.querySelector('[name="comment"]');
    const payload = {
      name,
      phone,
      comment: commentField ? commentField.value.trim() : "",
      consent: true,
      source: kind === "dialog" ? leadMode : "inline",
      config: kind === "dialog" ? lastSnapshot : snapshotConfig(),
      booking: kind === "dialog" && leadMode === "booking" ? bookingData : null,
      page: window.location.href,
      createdAt: new Date().toISOString(),
    };

    try {
      if (LEAD_ENDPOINT) {
        const response = await fetch(LEAD_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error(`Request failed: ${response.status}`);
      } else {
        await WAIT(550);
      }

      if (kind === "inline") {
        form.hidden = true;
        const success = $("#lead-success");
        if (success) success.hidden = false;
      } else {
        form.hidden = true;
        const success = $("#dialog-success");
        if (success) success.hidden = false;
      }

      form.reset();
    } catch (error) {
      console.error(error);
      if (micro) {
        micro.textContent = "Не получилось отправить. Позвоните нам: +7 (495) 000-00-00";
        micro.style.color = "#e1a191";
      }
    } finally {
      if (submit) submit.disabled = false;
      if (label) label.textContent = originalLabel;
    }
  }

  function initForms() {
    const leadForm = $("#lead-form");
    const dialogForm = $("#dialog-form");
    const successClose = $("#lead-success-close");

    $$("[data-open-lead]").forEach((button) => {
      button.addEventListener("click", () => {
        const menuToggle = $(".nav-toggle");
        if (document.body.classList.contains("menu-open") && menuToggle) {
          menuToggle.click();
        }
        openLeadDialog(button.dataset.openLead || "callback");
      });
    });

    $$("[data-open-privacy]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openPrivacyDialog();
      });
    });

    $$("[data-close-dialog]").forEach((button) => {
      button.addEventListener("click", closeLeadDialog);
    });

    $$("[data-close-privacy]").forEach((button) => {
      button.addEventListener("click", closePrivacyDialog);
    });

    const dialogClose = $("#dialog-close");
    if (dialogClose) dialogClose.addEventListener("click", closeLeadDialog);

    Object.values(dialogs).forEach((dialog) => {
      if (!dialog) return;
      dialog.addEventListener("close", syncBodyLock);
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog) {
          if (dialog === dialogs.lead) closeLeadDialog();
          if (dialog === dialogs.privacy) closePrivacyDialog();
        }
      });
    });

    [leadForm, dialogForm].forEach((form) => {
      if (!form) return;
      const submit = form.querySelector('[type="submit"]');
      const kind = form.id === "dialog-form" ? "dialog" : "inline";

      $$('[name="name"], [name="phone"], [name="consent"]', form).forEach((field) => {
        const reset = () => setFieldError(field, "");
        field.addEventListener("input", reset);
        field.addEventListener("change", reset);
      });

      const phone = form.querySelector('[name="phone"]');
      if (phone) {
        phone.addEventListener("blur", () => {
          if (digitsOnly(phone.value).length >= 10) {
            phone.value = formatPhone(phone.value);
          }
        });
      }

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (submit && submit.disabled) return;
        submitForm(form, kind);
      });
    });

    if (successClose) {
      successClose.addEventListener("click", () => {
        const success = $("#lead-success");
        const form = $("#lead-form");
        if (success) success.hidden = true;
        if (form) {
          form.hidden = false;
          form.reset();
          const name = form.querySelector('[name="name"]');
          if (name) name.focus();
        }
      });
    }

    const dialog = dialogs.lead;
    if (dialog) {
      dialog.addEventListener("close", () => {
        const form = $("#dialog-form");
        const success = $("#dialog-success");
        window.setTimeout(() => {
          if (form) {
            form.hidden = false;
            form.reset();
          }
          if (success) success.hidden = true;
        }, 250);
      });
    }
  }

  /* ============================================================
     BOOT
     ============================================================ */

  function boot() {
    initReveals();
    initHeader();
    initConfigurator();
    initWorkLinks();
    initTabs();
    initFaq();
    initForms();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
