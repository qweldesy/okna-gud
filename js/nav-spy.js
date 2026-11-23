/* ============================================================
   Navigation 17 (adapted) — the floating pill is always a pill;
   while scrolling it just shrinks (CSS transitions), plus a
   scroll-spy indicator sliding behind the active section link.
   ============================================================ */

(() => {
  "use strict";

  const header = document.querySelector(".site-header");
  const nav = document.querySelector(".main-nav");
  if (!header || !nav) return;

  /* Sliding highlight behind the active link */
  const indicator = document.createElement("span");
  indicator.className = "nav-indicator";
  indicator.setAttribute("aria-hidden", "true");
  nav.prepend(indicator);

  const links = Array.from(nav.querySelectorAll('a[href^="#"]'));
  if (!links.length) return;

  const TRIGGER = 150; /* px from the viewport top — the header band */
  let activeLink = null;
  let rafPending = false;

  function measure() {
    if (!activeLink) return;
    const navRect = nav.getBoundingClientRect();
    const linkRect = activeLink.getBoundingClientRect();
    indicator.style.width = `${Math.round(linkRect.width)}px`;
    indicator.style.transform = `translate(${Math.round(linkRect.left - navRect.left)}px, -50%)`;
  }

  function setActive(link) {
    if (link === activeLink) {
      measure();
      return;
    }
    if (activeLink) {
      activeLink.classList.remove("is-active");
      activeLink.removeAttribute("aria-current");
    }
    activeLink = link;
    if (link) {
      link.classList.add("is-active");
      link.setAttribute("aria-current", "true");
      measure();
      indicator.style.opacity = "1";
    } else {
      indicator.style.opacity = "0";
    }
  }

  function pickSection() {
    const doc = document.documentElement;
    const atBottom = window.innerHeight + window.scrollY >= doc.scrollHeight - 4;
    if (atBottom) {
      setActive(links[links.length - 1]);
      return;
    }

    let current = null;
    for (const link of links) {
      const section = document.getElementById(String(link.getAttribute("href")).slice(1));
      if (!section) continue;
      const rect = section.getBoundingClientRect();
      if (rect.top <= TRIGGER && rect.bottom > TRIGGER) {
        current = link;
        break;
      }
    }
    setActive(current);
  }

  function onScroll() {
    if (rafPending) return;
    rafPending = true;
    window.requestAnimationFrame(() => {
      rafPending = false;
      pickSection();
    });
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", () => {
    measure();
    pickSection();
  });
  if (document.fonts && typeof document.fonts.ready === "object") {
    document.fonts.ready.then(() => measure());
  }
  onScroll();
})();
