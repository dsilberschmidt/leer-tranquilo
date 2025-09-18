/*
 * Leer Tranquilo – content.js (refactor)
 * Source (requested): https://github.com/dsilberschmidt/leer-tranquilo/blob/main/src/content.js
 * Nota: No pude leer el archivo remoto desde este entorno, así que te dejo una versión robusta
 * y auto-contenida para testear YA. Si querés, en el próximo paso pego el exacto del repo.
 */

// ====== VERSION ======
(function () {
  const VERSION = "0.2.0";
  try { Object.defineProperty(window, "__LT_VERSION", { value: VERSION, configurable: true }); } catch {}
})();

// ====== STYLES: fuerza expansión por CSS ======
(function injectStyles() {
  if (document.getElementById("lt-style")) return;
  const style = document.createElement("style");
  style.id = "lt-style";
  style.textContent = `
    /* Quita límites de alto típicos en contenedores de comentarios */
    .comments, .comment, [data-testid*="comment"], [aria-label*="comment" i] {
      max-height: none !important;
      overflow: visible !important;
    }
    /* Acordeones / spoilers */
    details[open] > summary ~ * { display: block !important; }
  `;
  document.documentElement.appendChild(style);
})();

// ====== UI: botón flotante ======
(function injectControl() {
  if (document.getElementById("lt-control")) return;
  const btn = document.createElement("button");
  btn.id = "lt-control";
  btn.textContent = "Expand & Freeze";
  Object.assign(btn.style, {
    position: "fixed",
    inset: "auto 16px 16px auto",
    zIndex: 2147483647,
    padding: "10px 12px",
    background: "#111",
    color: "#fff",
    border: "1px solid #333",
    borderRadius: "10px",
    cursor: "pointer",
    fontSize: "13px",
    boxShadow: "0 2px 10px rgba(0,0,0,.25)",
  });
  btn.addEventListener("click", () => runOnce({ freeze: true }));
  document.documentElement.appendChild(btn);
})();

// ====== Core ======
const TEXT_PATTERNS = [
  /ver\s*m[aá]s|mostrar\s*m[aá]s|desplegar|ampliar/i,
  /see\s*more|show\s*more|expand|more\s*replies?/i,
  /load\s*more|view\s*\d+\s*more/i,
  /read\s*more|continue\s*reading/i,
];

function isVisible(el) {
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function byTextCandidates(root = document) {
  const clickable = root.querySelectorAll('button, a, summary, div, span, [role="button"], [tabindex]');
  const out = [];
  for (const el of clickable) {
    const txt = (el.innerText || el.textContent || "").trim();
    if (!txt) continue;
    if (!isVisible(el)) continue;
    if (TEXT_PATTERNS.some((rx) => rx.test(txt))) out.push(el);
  }
  return out;
}

function ariaCandidates(root = document) {
  const sel = [
    '[aria-expanded="false"]',
    '[aria-haspopup="listbox"]',
    'details:not([open]) > summary',
    '[data-click-to-expand]'
  ].join(',');
  return Array.from(root.querySelectorAll(sel));
}

function expandOnce(root = document) {
  const clicked = new Set();
  const tryClick = (el) => {
    if (clicked.has(el)) return; clicked.add(el);
    try { el.click(); } catch {}
  };

  // 1) botones por texto
  byTextCandidates(root).forEach(tryClick);
  // 2) elementos ARIA/semánticos
  ariaCandidates(root).forEach(tryClick);
  // 3) "Ver X respuestas" típicos
  root.querySelectorAll('[data-test-id*="repl" i], [data-testid*="repl" i]').forEach(tryClick);
  // 4) inputs tipo disclosure
  root.querySelectorAll('input[type="checkbox"], input[type="radio"]').forEach((el) => {
    if (!el.checked) { try { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); } catch {} }
  });

  // Quitar clases que imponen colapso
  root.querySelectorAll('[class*="collapsed" i], [class*="truncate" i]').forEach((el) => {
    el.classList.remove('collapsed');
    el.style.maxHeight = 'none';
    el.style.webkitLineClamp = 'unset';
    el.style.overflow = 'visible';
  });
}

// ====== Freeze: neutraliza recolaspsos por MutationObserver ======
let patchedMO = false;
function patchMutationObserver() {
  if (patchedMO || !('MutationObserver' in window)) return;
  const Orig = window.MutationObserver;
  const registry = new WeakMap();
  window.MutationObserver = function (cb) {
    const obs = new Orig(cb);
    const observe = obs.observe.bind(obs);
    obs.observe = function (target, options) {
      // Registramos para poder cortar luego
      const list = registry.get(target) || [];
      list.push(obs);
      registry.set(target, list);
      return observe(target, options);
    };
    return obs;
  };
  // API para desconectar todo luego
  window.__LT_disconnectAllObservers = function () {
    registry.forEach((list) => list.forEach((o) => { try { o.disconnect(); } catch {} }));
  };
  patchedMO = true;
}

function runOnce({ freeze } = { freeze: false }) {
  expandOnce(document);
  if (freeze) {
    patchMutationObserver();
    // Desconectamos observadores activos una vez
    if (typeof window.__LT_disconnectAllObservers === 'function') {
      window.__LT_disconnectAllObservers();
    }
  }
}

// ====== Auto-reintento (por sitios que re-renderizan) ======
(function autoRunner() {
  let ticks = 0;
  const MAX_TICKS = 40; // ~20s si interval = 500ms
  const interval = 500;
  const t = setInterval(() => {
    runOnce();
    if (++ticks >= MAX_TICKS) clearInterval(t);
  }, interval);

  // Además, observa el documento para expandir al vuelo
  if ('MutationObserver' in window) {
    const mo = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.addedNodes && m.addedNodes.length) {
          m.addedNodes.forEach((n) => { if (n.nodeType === 1) expandOnce(n); });
        }
      }
    });
    try { mo.observe(document.documentElement, { childList: true, subtree: true }); } catch {}
  }
})();
