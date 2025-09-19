// Leer Tranquilo – lt-dom.js
// v0.4.0 (anchor persistente: guardar + restaurar; anti-reset suave; SPA aware)

window.ltDom = (() => {
  const STORAGE_KEY = (href) => {
    try {
      // Clave por origen + pathname (ignoramos hash y query variables)
      const u = new URL(href, location.href);
      return `LT:anchor:${u.origin}${u.pathname}`;
    } catch {
      return `LT:anchor:${location.origin}${location.pathname}`;
    }
  };

  let lastSave = 0;
  let scrollTimer = null;
  let bigDomObserver = null;

  // ======= Utilidades =======
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const vw = window.innerWidth || document.documentElement.clientWidth;
    const vh = window.innerHeight || document.documentElement.clientHeight;
    return r.bottom >= -80 && r.top <= vh + 80 && r.left <= vw && r.right >= 0;
  }

  function cssPath(el, limit = 4) {
    // Selector corto y robusto
    const parts = [];
    let node = el;
    let depth = 0;
    while (node && node.nodeType === 1 && depth < limit) {
      let sel = node.nodeName.toLowerCase();
      if (node.id) { sel += `#${CSS.escape(node.id)}`; parts.unshift(sel); break; }
      let cls = (node.className || "").toString().trim().split(/\s+/).filter(Boolean).slice(0,2);
      if (cls.length) sel += "." + cls.map(c => CSS.escape(c)).join(".");
      // Posición entre hermanos del mismo tipo
      let i = 1, sib = node;
      while ((sib = sib.previousElementSibling) && sib.nodeName === node.nodeName) i++;
      if (i > 1) sel += `:nth-of-type(${i})`;
      parts.unshift(sel);
      node = node.parentElement;
      depth++;
    }
    return parts.join(" > ");
  }

  function getViewportAnchor() {
    // Tomamos un punto ~30% desde arriba del viewport (más “zona de lectura”)
    const y = clamp(Math.floor(window.innerHeight * 0.3), 0, window.innerHeight - 1);
    let el = document.elementFromPoint(Math.floor(window.innerWidth * 0.5), y);

    // Subimos hasta encontrar algo con texto razonable
    const hasText = (n) => !!(n && (n.innerText || n.textContent || "").trim());
    while (el && !hasText(el)) el = el.parentElement || el;

    if (!el) el = document.scrollingElement || document.documentElement || document.body;

    const txt = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
    const snippet = txt.slice(0, 140);
    const selector = cssPath(el);
    const scrollY = window.scrollY || window.pageYOffset || 0;

    return { selector, snippet, scrollY };
  }

  function store(data) {
    try {
      sessionStorage.setItem(STORAGE_KEY(location.href), JSON.stringify({
        ...data,
        href: location.href,
        ts: Date.now(),
        vh: window.innerHeight,
      }));
    } catch {}
  }

  function load() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY(location.href));
      if (!raw) return null;
      return JSON.parse(raw);
    } catch { return null; }
  }

  // ======= API pública =======
  function saveAnchor(force = false) {
    const now = Date.now();
    if (!force && now - lastSave < 400) return;
    lastSave = now;
    const anchor = getViewportAnchor();
    store(anchor);
    // console.debug("[LT] saveAnchor", anchor);
  }

  function findBySelector(selector) {
    if (!selector) return null;
    try {
      const el = document.querySelector(selector);
      return el && isVisible(el) ? el : el;
    } catch { return null; }
  }

  function findBySnippet(snippet) {
    if (!snippet) return null;
    // Buscamos un bloque de texto que contenga el snippet (tolerante)
    const cand = document.querySelectorAll("p, div, article, section, span, li");
    const sn = snippet.slice(0, 80).toLowerCase();
    let best = null, bestLen = 0;
    for (const el of cand) {
      if (!el || !el.isConnected) continue;
      const txt = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
      if (!txt || txt.length < 10) continue;
      const idx = txt.indexOf(sn);
      if (idx >= 0) {
        const score = Math.min(80, sn.length) - idx * 0.01 - (Math.abs(txt.length - sn.length) * 0.001);
        if (score > bestLen) { bestLen = score; best = el; }
      }
    }
    return best;
  }

  function smoothScrollTo(y) {
    try {
      window.scrollTo({ top: y, behavior: "instant" in window ? "instant" : "auto" });
    } catch {
      window.scrollTo(0, y);
    }
  }

  function restoreAnchor(force = false) {
    const saved = load();
    if (!saved) return false;

    // 1) Intento por selector
    let target = findBySelector(saved.selector);

    // 2) Intento por snippet si no hay selector fiable o el nodo cambió
    if (!target || !isVisible(target)) {
      target = findBySnippet(saved.snippet) || target;
    }

    // 3) Scroll al y guardado si no tenemos un objetivo claro
    if (!target) {
      if (typeof saved.scrollY === "number") {
        smoothScrollTo(saved.scrollY);
        return true;
      }
      return false;
    }

    // Ajuste: posicionar el target ~30% del viewport desde arriba (zona de lectura)
    const rect = target.getBoundingClientRect();
    const currentY = window.scrollY || 0;
    const targetY = currentY + rect.top - Math.floor(window.innerHeight * 0.3);
    smoothScrollTo(clamp(targetY, 0, document.documentElement.scrollHeight));
    return true;
  }

  function armAnchorPersistence() {
    // Guardado con throttle mientras se hace scroll
    const onScroll = () => {
      if (scrollTimer) return;
      scrollTimer = setTimeout(() => {
        scrollTimer = null;
        saveAnchor();
      }, 350);
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    // Grandes cambios de DOM (publicidad/hidrataciones): reintentar restore
    try {
      if (bigDomObserver) bigDomObserver.disconnect();
      let changeCount = 0;
      bigDomObserver = new MutationObserver((list) => {
        for (const m of list) {
          if (m.type === "childList") changeCount += (m.addedNodes?.length || 0) + (m.removedNodes?.length || 0);
        }
        if (changeCount > 50) {
          changeCount = 0;
          // Un pequeño delay para que el layout se estabilice
          setTimeout(() => restoreAnchor(), 120);
        }
      });
      bigDomObserver.observe(document.body || document.documentElement, { childList: true, subtree: true });
    } catch {}

    // Hooks SPA: capturar navegación blanda y restaurar
    try {
      const _push = history.pushState;
      const _replace = history.replaceState;
      history.pushState = function (...args) {
        saveAnchor();
        const r = _push.apply(this, args);
        setTimeout(() => restoreAnchor(), 120);
        return r;
      };
      history.replaceState = function (...args) {
        saveAnchor();
        const r = _replace.apply(this, args);
        setTimeout(() => restoreAnchor(), 120);
        return r;
      };
      window.addEventListener("popstate", () => {
        setTimeout(() => restoreAnchor(), 120);
      });
    } catch {}
  }

  // Exponemos también expandAll por compatibilidad (no usado por defecto)
  function expandAll() { return 0; }

  return {
    // Persistencia de lectura
    armAnchorPersistence,
    saveAnchor,
    restoreAnchor,
    // Compat
    expandAll,
  };
})();
