/*
 * Leer Tranquilo – content.js
 * Versión 0.2.4 (hotfix: corrige sintaxis y cuelgues)
 */

(() => {
  'use strict';

  // ====== VERSION ======
  const VERSION = '0.2.4';
  try { Object.defineProperty(window, '__LT_VERSION', { value: VERSION, configurable: true }); } catch {}

  // ====== STATE ======
  const STATE = {
    intervalId: null,
    observer: null,
    shadowRoots: new Set(),
  };

  // ====== SHADOW DOM HOOK (suave) ======
  try {
    const _attach = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function(init){
      const root = _attach.call(this, init);
      try { STATE.shadowRoots.add(root); } catch {}
      return root;
    };
  } catch {}

  // ====== STYLES ======
  function injectStyles(){
    if (document.getElementById('lt-style')) return;
    const style = document.createElement('style');
    style.id = 'lt-style';
    style.textContent = `
      .comments, .comment, [data-testid*="comment"], [aria-label*="comment" i] {
        max-height: none !important;
        overflow: visible !important;
      }
      [class*="truncate" i], [class*="collapsed" i] {
        -webkit-line-clamp: unset !important;
        line-clamp: unset !important;
        max-height: none !important;
        overflow: visible !important;
      }
      details[open] > summary ~ * { display: block !important; }
    `;
    document.documentElement.appendChild(style);
  }

  // ====== UI BUTTON ======
  function injectButton(){
    const old = document.getElementById('lt-control');
    if (old) old.remove();

    const btn = document.createElement('button');
    btn.id = 'lt-control';
    btn.textContent = `Expand & Freeze · v${VERSION}`;
    btn.title = `Leer Tranquilo ${VERSION} — expandir y congelar comentarios`;
    Object.assign(btn.style, {
      position: 'fixed',
      inset: 'auto 16px 16px auto',
      zIndex: 2147483647,
      padding: '10px 12px',
      background: '#6200ee',
      color: '#fff',
      border: 'none',
      borderRadius: '10px',
      cursor: 'pointer',
      fontSize: '13px',
      pointerEvents: 'auto',
      boxShadow: '0 4px 14px rgba(0,0,0,.25)',
      userSelect: 'none',
    });

    btn.addEventListener('click', (e) => {
      try { e.preventDefault(); e.stopPropagation(); } catch {}
      startPersistentExpand();
    }, true);

    (document.body || document.documentElement).appendChild(btn);
  }

  // ====== EXPANSION LOGIC ======
  const TEXT_PATTERNS = [
    /ver\s*m[aá]s|mostrar\s*m[aá]s|desplegar|ampliar/i,
    /see\s*more|show\s*more|expand|more\s*replies?/i,
    /load\s*more|view\s*\d+\s*more/i,
    /read\s*more|continue\s*reading/i,
  ];

  function isVisible(el){
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function expandOnceInRoot(root){
    if (!root) return;

    const qsa = root.querySelectorAll ? root.querySelectorAll.bind(root) : () => [];

    const clickable = qsa('button, a, summary, div, span, [role="button"], [tabindex]');
    const clicked = new Set();
    const tryClick = (el) => { if (!clicked.has(el)) { clicked.add(el); try { el.click(); } catch {} } };

    // 1) por texto
    for (const el of clickable){
      const txt = (el.innerText || el.textContent || '').trim();
      if (!txt) continue;
      if (!isVisible(el)) continue;
      if (TEXT_PATTERNS.some(rx => rx.test(txt))) tryClick(el);
    }
    // 2) ARIA/semántico
    qsa('[aria-expanded="false"], details:not([open]) > summary, [data-click-to-expand]').forEach(tryClick);
    // 3) "ver X respuestas"
    qsa('[data-test-id*="repl" i], [data-testid*="repl" i]').forEach(tryClick);
    // 4) inputs de disclosure
    qsa('input[type="checkbox"], input[type="radio"]').forEach((el)=>{
      if (!el.checked) { try { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); } catch {} }
    });

    // 5) quitar clases de colapso y estilos inline de truncado
    qsa('[class*="collapsed" i], [class*="truncate" i], [style*="line-clamp" i], [style*="-webkit-line-clamp" i]').forEach((el)=>{
      try {
        el.classList.remove('collapsed');
        el.style.maxHeight = 'none';
        el.style.webkitLineClamp = 'unset';
        el.style.lineClamp = 'unset';
        el.style.overflow = 'visible';
      } catch {}
    });
  }

  function allRoots(){
    const roots = [document];
    try {
      document.querySelectorAll('iframe').forEach((f)=>{
        try { if (f.contentDocument) roots.push(f.contentDocument); } catch {}
      });
    } catch {}
    try { STATE.shadowRoots.forEach((r)=> roots.push(r)); } catch {}
    return roots;
  }

  function expandEverywhere(){
    injectStyles();
    const roots = allRoots();
    for (const r of roots) expandOnceInRoot(r);
  }

  // ====== PERSISTENT MODE ======
  function startPersistentExpand(){
    // Limpia previos
    try { if (STATE.intervalId) clearInterval(STATE.intervalId); } catch {}
    try { if (STATE.observer) STATE.observer.disconnect(); } catch {}

    // 1) intervalo insistente
    expandEverywhere();
    STATE.intervalId = setInterval(expandEverywhere, 800);

    // 2) nuestro observer
    if ('MutationObserver' in window){
      STATE.observer = new MutationObserver((muts)=>{
        for (const m of muts){
          if (m.addedNodes && m.addedNodes.length){
            m.addedNodes.forEach((n)=>{ if (n && n.nodeType === 1) expandOnceInRoot(n); });
          }
        }
      });
      try { STATE.observer.observe(document.documentElement, { childList: true, subtree: true }); } catch {}
    }
  }

  // ====== AUTO START (suave) ======
  (function boot(){
    injectStyles();
    let ticks = 0;
    const t = setInterval(()=>{
      expandEverywhere();
      if (++ticks >= 30) clearInterval(t); // ~24s
    }, 800);
  })();

  // UI
  injectButton();
})();
