// Leer Tranquilo – lt-dom.js
// v0.3.10 (hotfix selectors + safe click)

window.ltDom = (() => {
  const clicked = new WeakSet();

  const rxSeeMore = /(see\s*more|ver\s*m[aá]s|show\s*more|read\s*more)/i;
  const rxReplies = /(repl(y|ies)|respuestas|view\s+\d+\s+more\s+repl(y|ies))/i;

  function textOf(el) {
    const t = (el.innerText || el.textContent || "").trim();
    const aria = (el.getAttribute?.("aria-label") || "").trim();
    return `${t}\n${aria}`;
  }

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    const vw = window.innerWidth || document.documentElement.clientWidth;
    const vh = window.innerHeight || document.documentElement.clientHeight;
    return rect.bottom >= -60 && rect.top <= vh + 60 && rect.left <= vw && rect.right >= 0;
  }

  function isSafe(el) {
    // nunca navegar: si es <a> con href real, no tocamos
    if (el.tagName === "A") {
      const href = (el.getAttribute("href") || "").trim();
      if (href && href !== "#" && !href.startsWith("javascript:")) return false;
    }
    // evita ads/aside
    if (el.closest("aside, .ad, [data-ad], [id*='ad-'], [class*='ad-']")) return false;
    return true;
  }

  function looksExpandable(el) {
    const t = textOf(el);
    if (rxSeeMore.test(t)) return true;
    if (rxReplies.test(t)) return true;

    // Heurísticas frecuentes en OpenWeb
    const role = (el.getAttribute?.("role") || "").toLowerCase();
    const ow = (el.getAttribute?.("data-ow-action") || "").toLowerCase();
    if (role === "button" && /more|expand|reply|repl/.test(t)) return true;
    if (/(more|expand|repl)/.test(ow)) return true;

    return false;
  }

  function mouseClick(el) {
    try {
      const ev = new MouseEvent("click", { bubbles: true, cancelable: true, view: window });
      const ok = el.dispatchEvent(ev);
      if (ok && typeof el.click === "function") el.click();
      return true;
    } catch (e) {
      console.warn("[LT] safeClick error:", e);
      return false;
    }
  }

  function expandAll(maxActions = 25) {
    let actions = 0;

    // Ampliamos el set de candidatos: buttons, anchors "seguros", spans con role=button
    const nodes = document.querySelectorAll("button, a, [role='button'], span");

    for (const el of nodes) {
      if (actions >= maxActions) break;
      if (clicked.has(el)) continue;
      if (!isVisible(el)) continue;
      if (!isSafe(el)) continue;
      if (!looksExpandable(el)) continue;

      // marcar y disparar
      clicked.add(el);
      el.dataset.ltHandled = "1";
      if (mouseClick(el)) {
        actions++;
        // pequeño respiro para que el DOM inserte contenido y evitar mareo
        // (no await aquí para mantenerlo corto/rápido; el loop externo volverá)
      }
    }

    return actions;
  }

  return { expandAll };
})();
