// Leer Tranquilo – lt-dom.js
// v0.3.11 (hotfix: "Show more comments" + mejores selectores y click seguro)

window.ltDom = (() => {
  const clicked = new WeakSet();

  // Cobertura amplia: See/Show/Read + "comments/replies"
  const rxSeeMore =
    /(see\s*more|show\s*more|read\s*more|ver\s*m[aá]s)(\s*(comments?|repl(y|ies)|responses?))?/i;
  const rxReplies =
    /(repl(y|ies)|respuestas|view\s+\d+\s+more\s+repl(y|ies)|more\s+comments?)/i;

  function textOf(el) {
    const t = (el.innerText || el.textContent || "").trim();
    const aria = (el.getAttribute?.("aria-label") || "").trim();
    const title = (el.getAttribute?.("title") || "").trim();
    return `${t}\n${aria}\n${title}`;
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
    // Evitar navegación real
    if (el.tagName === "A") {
      const href = (el.getAttribute("href") || "").trim();
      if (href && href !== "#" && !href.startsWith("javascript:")) return false;
    }
    // Evitar ads
    if (el.closest("aside, .ad, [data-ad], [id*='ad-'], [class*='ad-']")) return false;
    return true;
  }

  function isLikelyClickable(el) {
    if (!el) return false;
    if (el.tabIndex >= 0) return true;
    const role = (el.getAttribute?.("role") || "").toLowerCase();
    if (role === "button" || role === "link") return true;
    if (typeof el.onclick === "function") return true;
    const tag = el.tagName;
    if (tag === "BUTTON") return true;
    if (tag === "A") {
      const href = (el.getAttribute("href") || "").trim();
      if (!href || href === "#" || href.startsWith("javascript:")) return true;
    }
    // Cursor pointer es una buena señal
    const cs = getComputedStyle(el);
    if (cs.cursor === "pointer") return true;
    return false;
  }

  function findClickable(el) {
    // Caso común: el texto está en un hijo, pero el click va en el contenedor
    if (isLikelyClickable(el)) return el;
    const btnParent = el.closest("button, [role='button'], a, [tabindex]");
    if (btnParent) return btnParent;
    // fallback: padre inmediato si tiene pointer
    if (el.parentElement && isLikelyClickable(el.parentElement)) return el.parentElement;
    return el;
  }

  function mouseClick(el) {
    try {
      // Algunos widgets escuchan pointer events
      el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      const ok = el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      if (ok && typeof el.click === "function") el.click();
      return true;
    } catch (e) {
      console.warn("[LT] safeClick error:", e);
      return false;
    }
  }

  function looksExpandable(el) {
    const t = textOf(el);
    if (rxSeeMore.test(t)) return true;
    if (rxReplies.test(t)) return true;

    // Heurísticas típicas en motores de comentarios
    const role = (el.getAttribute?.("role") || "").toLowerCase();
    const ow = (el.getAttribute?.("data-ow-action") || "").toLowerCase();
    if (/(more|expand|reply|repl|comments?)/i.test(ow)) return true;
    if (role === "button" && /(more|expand|reply|comments?)/i.test(t)) return true;

    // Algunos usan aria-controls con ids tipo "comments"
    const ac = (el.getAttribute?.("aria-controls") || "").toLowerCase();
    if (/comment|repl/.test(ac)) return true;

    return false;
  }

  function expandAll(maxActions = 25) {
    let actions = 0;

    // Ampliamos el set: botones, links “seguros”, elementos con role button,
    // y contenedores comunes (div/span) para capturar textos como "Show more comments".
    const nodes = document.querySelectorAll("button, a, [role='button'], [tabindex], span, div");

    for (const raw of nodes) {
      if (actions >= maxActions) break;
      if (!raw || clicked.has(raw)) continue;
      if (!isVisible(raw)) continue;
      if (!isSafe(raw)) continue;
      if (!looksExpandable(raw)) continue;

      const el = findClickable(raw);
      if (clicked.has(el)) continue;
      clicked.add(raw);
      clicked.add(el);

      if (mouseClick(el)) {
        actions++;
        el.dataset.ltHandled = "1";
        // Micro-respiro: el loop externo volverá y verá nuevos nodos
      }
    }

    return actions;
  }

  return { expandAll };
})();
