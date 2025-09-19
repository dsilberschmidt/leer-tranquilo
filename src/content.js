/*
 * Leer Tranquilo – content.js
 * Versión 0.3.0 (iframe-aware auto-ON, botón sólo en top; heurísticas OpenWeb/Spot.IM)
 */
(() => {
  'use strict';

  const VERSION = '0.3.0';
  const IS_TOP = (() => { try { return window.top === window; } catch { return false; } })();

  try { Object.defineProperty(window, '__LT_VERSION', { value: VERSION, configurable: true }); } catch {}
  try { document.documentElement.setAttribute('data-lt-version', VERSION); } catch {}
  try { console.info(`[LT] content loaded v${VERSION} (${IS_TOP ? 'top' : `iframe @ ${location.origin}`})`); } catch {}

  const STATE = {
    timerId: null,
    observer: null,
    shadowRoots: new Set(),
    running: false
  };

  // Shadow DOM hook (suave)
  try {
    if (Element?.prototype?.attachShadow) {
      const _attach = Element.prototype.attachShadow;
      Element.prototype.attachShadow = function(init){
        const root = _attach.call(this, init);
        try { STATE.shadowRoots.add(root); } catch {}
        return root;
      };
    }
  } catch {}

  // Estilos para des-truncar
  function injectStyles(){
    if (document.getElementById('lt-style')) return;
    const style = document.createElement('style');
    style.id = 'lt-style';
    style.textContent = `
      .comments, .comment, [data-testid*="comment" i], [aria-label*="comment" i] {
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

  // Botón (sólo en top)
  function injectButton(){
    if (!IS_TOP) return; // no botón en iframes
    const old = document.getElementById('lt-control');
    if (old) old.remove();

    const btn = document.createElement('button');
    btn.id = 'lt-control';
    btn.textContent = `Expand & Freeze · v${VERSION}`;
    btn.title = `Leer Tranquilo ${VERSION} — expandir y congelar comentarios`;
    Object.assign(btn.style, {
      position: 'fixed', inset: 'auto 16px 16px auto', zIndex: 2147483647,
      padding: '10px 12px', background: '#6200ee', color: '#fff', border: 'none',
      borderRadius: '10px', cursor: 'pointer', fontSize: '13px', pointerEvents: 'auto',
      boxShadow: '0 4px 14px rgba(0,0,0,.25)', userSelect: 'none'
    });

    const handler = (e) => {
      try { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation?.(); } catch {}
      try { console.info('[LT] click -> startPersistentExpand'); } catch {}
      startPersistentExpand(btn);
    };

    btn.addEventListener('pointerdown', handler, true);
    btn.addEventListener('click', handler, true);
    btn.addEventListener('mousedown', handler, true);
    btn.addEventListener('pointerup', (e)=>{ try { e.preventDefault(); e.stopPropagation(); } catch {} }, true);

    (document.body || document.documentElement).appendChild(btn);
  }

  // Heurísticas
  const TEXT_PATTERNS = [
    /ver\s*m[aá]s|mostrar\s*m[aá]s|desplegar|ampliar/i,
    /see\s*more|show\s*more|expand|more\s*repl(y|ies)?/i,
    /load\s*more|view\s*\d+\s*more/i,
    /read\s*more|continue\s*reading/i
  ];

  function isVisible(el){
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function expandOnceInRoot(root){
    if (!root) return 0;
    let actions = 0;
    const qsa = root.querySelectorAll ? root.querySelectorAll.bind(root) : () => [];

    const clickable = qsa('button, a, summary, div, span, [role="button"], [tabindex]');
    const clicked = new Set();
    const tryClick = (el) => {
      if (!clicked.has(el)) { clicked.add(el); try { el.click(); actions++; } catch {} }
    };

    // 1) por texto (cota de 600)
    let count = 0;
    for (const el of clickable){
      if (++count > 600) break;
      const txt = (el.innerText || el.textContent || '').trim();
      if (!txt || !isVisible(el)) continue;
      if (TEXT_PATTERNS.some(rx => rx.test(txt))) tryClick(el);
    }
    // 2) ARIA / semántico
    qsa('[aria-expanded="false"], details:not([open]) > summary, [data-click-to-expand]').forEach(tryClick);
    // 3) “ver X respuestas”
    qsa('[data-test-id*="repl" i], [data-testid*="repl" i]').forEach(tryClick);
    // 4) inputs de disclosure
    qsa('input[type="checkbox"], input[type="radio"]').forEach((el)=>{
      if (!el.checked) { try { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); actions++; } catch {} }
    });
    // 5) quitar truncados/clamps
    qsa('[class*="collapsed" i], [class*="truncate" i], [style*="line-clamp" i], [style*="-webkit-line-clamp" i]').forEach((el)=>{
      try {
        el.classList.remove('collapsed');
        el.style.maxHeight = 'none';
        el.style.webkitLineClamp = 'unset';
        el.style.lineClamp = 'unset';
        el.style.overflow = 'visible';
        actions++;
      } catch {}
    });
    // 6) OpenWeb / Spot.IM
    try {
      const owRoots = Array.from(qsa('[id*="openweb" i], [class*="openweb" i], [id*="spot" i], [class*="spot" i], [id*="conversation" i], [class*="conversation" i]'));
      owRoots.forEach((rw)=>{
        rw.querySelectorAll('button, a, [role="button"]').forEach((b)=>{
          const t = (b.innerText || b.textContent || '').toLowerCase();
          if (/show\s*more|load\s*more|more\s*repl|view\s*more|see\s*more|mostrar|ver\s*m[aá]s/.test(t)) tryClick(b);
        });
        rw.querySelectorAll('[data-qa*="see-more" i], [data-test*="see-more" i], [data-action*="expand" i]').forEach(tryClick);
        rw.querySelectorAll('[class*="trunc" i], [class*="collapsed" i], [class*="clamp" i]').forEach((el)=>{
          try { el.style.webkitLineClamp = 'unset'; el.style.lineClamp = 'unset'; el.style.maxHeight = 'none'; el.style.overflow = 'visible'; actions++; } catch {}
        });
      });
    } catch {}

    return actions;
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
    let actions = 0;
    for (const r of allRoots()) actions += expandOnceInRoot(r) || 0;
    return actions;
  }

  // Loop adaptativo + single-run
  function startPersistentExpand(btn){
    if (STATE.running) { try { console.info('[LT] loop already running; ignoring'); } catch {} return; }
    STATE.running = true;

    try { if (STATE.timerId) clearTimeout(STATE.timerId); } catch {}
    try { if (STATE.observer) STATE.observer.disconnect(); } catch {}

    if (btn) {
      btn.textContent = `Expand & Freeze · v${VERSION} · ON`;
      btn.disabled = true; btn.style.opacity = '0.85'; btn.style.cursor = 'default';
    }
    try { console.info('[LT] persistent loop starting'); } catch {}

    const loop = () => {
      const actions = expandEverywhere();
      const delay = actions > 0 ? 900 : 4000;
      STATE.timerId = setTimeout(loop, delay);
    };
    loop();

    if ('MutationObserver' in window){
      STATE.observer = new MutationObserver((muts)=>{
        for (const m of muts){
          if (m.addedNodes?.length) m.addedNodes.forEach((n)=>{ if (n?.nodeType === 1) expandOnceInRoot(n); });
        }
      });
      try { STATE.observer.observe(document.documentElement, { childList: true, subtree: true }); } catch {}
    }
  }

  // Auto-start suave (top) y auto-ON (iframes)
  (function boot(){
    injectStyles();
    if (!IS_TOP) {
      // En iframes (Spot.IM/OpenWeb) arrancamos de una
      startPersistentExpand(null);
      return;
    }
    // En top, sólo un boot corto y dejamos el botón al usuario
    let ticks = 0;
    const t = setInterval(()=>{
      const acts = expandEverywhere();
      if (++ticks >= 6 || acts === 0) clearInterval(t);
    }, 800);
  })();

  injectButton();

  // Fallback global (sólo top)
  if (IS_TOP) {
    try {
      addEventListener('keydown', (e)=>{
        try {
          if (e.altKey && e.shiftKey && (e.key === 'L' || e.key === 'l')) {
            e.preventDefault(); e.stopPropagation();
            const b = document.getElementById('lt-control');
            startPersistentExpand(b || null);
          }
        } catch {}
      }, true);
    } catch {}
    try { window.__LT_toggle = () => { const b = document.getElementById('lt-control'); startPersistentExpand(b || null); return 'LT: started'; }; } catch {}
  }
})();
