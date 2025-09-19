/*
 * Leer Tranquilo – content.js
 * Versión 0.3.3
 * - All frames + host_permissions (MV3)
 * - Botón solo en top; auto-ON en iframes
 * - Apertura del módulo de comentarios
 * - Deep Shadow DOM traversal + heurísticas OpenWeb/Spot.IM
 * - “Jiggle” de scroll/hover para disparar lazy-loads
 */
(() => {
  'use strict';

  const VERSION = '0.3.3';
  const IS_TOP = (() => { try { return window.top === window; } catch { return false; } })();
  const host = location.hostname || '';

  // Permitimos correr solo en estos hosts (el iframe actual reporta www.jpost.com)
  const ALLOW_HOST = /(?:^|\.)jpost\.com$|(?:^|\.)spot\.im$|(?:^|\.)openweb\./i;
  if (!ALLOW_HOST.test(host)) return;

  try { Object.defineProperty(window, '__LT_VERSION', { value: VERSION, configurable: true }); } catch {}
  try { document.documentElement.setAttribute('data-lt-version', VERSION); } catch {}
  try { console.info(`[LT] content loaded v${VERSION} on ${host} (${IS_TOP ? 'top' : 'iframe'})`); } catch {}

  const STATE = {
    timerId: null,
    observer: null,
    shadowRoots: new Set(),
    running: false,
    lastActionTs: 0
  };

  // ===== Shadow DOM hook + deep traversal =====
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

  function* deepNodes(root) {
    if (!root) return;
    const stack = [root];
    const seen = new Set();
    while (stack.length) {
      const node = stack.pop();
      if (!node || seen.has(node)) continue;
      seen.add(node);

      yield node;

      // Shadow root
      const sr = node.shadowRoot || (node instanceof ShadowRoot ? node : null);
      if (sr) stack.push(sr);

      // Children
      if (node.children && node.children.length) {
        for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i]);
      }

      // Iframes same-origin
      if (node.tagName === 'IFRAME') {
        try {
          if (node.contentDocument) stack.push(node.contentDocument);
          if (node.contentDocument?.documentElement) stack.push(node.contentDocument.documentElement);
        } catch {}
      }
    }
  }

  function qsaDeep(root, selector) {
    const out = [];
    for (const n of deepNodes(root)) {
      try {
        if (n.querySelectorAll) n.querySelectorAll(selector).forEach(el => out.push(el));
      } catch {}
    }
    return out;
  }

  // ===== Estilos para des-truncar =====
  function injectStyles(){
    if (document.getElementById('lt-style')) return;
    const style = document.createElement('style');
    style.id = 'lt-style';
    style.textContent = `
      .comments, .comment, [data-testid*="comment" i], [aria-label*="comment" i] {
        max-height: none !important; overflow: visible !important;
      }
      [class*="truncate" i], [class*="collapsed" i], [class*="clamp" i] {
        -webkit-line-clamp: unset !important; line-clamp: unset !important;
        max-height: none !important; overflow: visible !important;
      }
      details[open] > summary ~ * { display: block !important; }
    `;
    document.documentElement.appendChild(style);
  }

  // ===== Botón (solo en top) =====
  function injectButton(){
    if (!IS_TOP) return;
    const old = document.getElementById('lt-control'); if (old) old.remove();
    const btn = document.createElement('button');
    btn.id = 'lt-control';
    btn.textContent = `Expand & Freeze · v${VERSION}`;
    btn.title = `Leer Tranquilo ${VERSION} — expandir y congelar comentarios`;
    Object.assign(btn.style, {
      position: 'fixed', right: '16px', bottom: '16px', zIndex: 2147483647,
      padding: '10px 12px', background: '#6200ee', color: '#fff', border: 'none',
      borderRadius: '10px', cursor: 'pointer', fontSize: '13px', pointerEvents: 'auto',
      boxShadow: '0 4px 14px rgba(0,0,0,.25)', userSelect: 'none'
    });
    const handler = (e) => {
      e.preventDefault?.(); e.stopPropagation?.(); e.stopImmediatePropagation?.();
      console.info('[LT] click -> startPersistentExpand');
      startPersistentExpand(btn);
    };
    btn.addEventListener('pointerdown', handler, true);
    btn.addEventListener('click', handler, true);
    btn.addEventListener('mousedown', handler, true);
    (document.body || document.documentElement).appendChild(btn);
  }

  // ===== Heurísticas =====
  const TEXT_PATTERNS = [
    /ver\s*m[aá]s|mostrar\s*m[aá]s|desplegar|ampliar/i,
    /see\s*more|show\s*more|expand|more\s*repl(y|ies)?/i,
    /load\s*more|view\s*\d+\s*more/i,
    /read\s*more|continue\s*reading/i
  ];

  function isVisible(el){ try { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; } catch { return false; } }

  function clickHard(el){
    try {
      const evs = ['pointerdown','mousedown','click'];
      evs.forEach(type => el.dispatchEvent(new MouseEvent(type, {bubbles:true,cancelable:true,view:window})));
      return true;
    } catch { return false; }
  }

  function hover(el){
    try { el.dispatchEvent(new MouseEvent('mouseover', {bubbles:true, cancelable:true, view:window})); } catch {}
  }

  function jiggleScroll(target = document){
    try {
      const y = Math.max(0, (typeof scrollY === 'number' ? scrollY : 0) + 1);
      target.defaultView?.scrollTo?.(0, y);
      target.defaultView?.scrollTo?.(0, y - 1);
    } catch {}
  }

  // Abre el módulo de comentarios en top
  function openCommentsModuleOnce(doc = document){
    let did = 0;
    const candidates = qsaDeep(doc, 'a[href*="#comments"], [data-qa*="comment" i], [data-test*="comment" i], [aria-controls*="comment" i], button, a');
    for (const el of candidates) {
      const t=(el.innerText||el.textContent||'').toLowerCase();
      if (/comments|open\s*comments|view\s*comments|show\s*comments|join\s*the\s*discussion/.test(t)){
        if (isVisible(el)) { clickHard(el); did++; }
      }
    }
    return did;
  }

  // ===== Expand logic por raíz =====
  function expandOnceInRoot(root){
    if (!root) return 0;
    let actions = 0;

    // 0) Quitar truncados genéricos visibles
    for (const el of qsaDeep(root, '[class*="collapsed" i], [class*="truncate" i], [style*="line-clamp" i], [style*="-webkit-line-clamp" i]')) {
      try {
        if (!isVisible(el)) continue;
        el.classList.remove('collapsed');
        el.style.maxHeight = 'none';
        el.style.webkitLineClamp = 'unset';
        el.style.lineClamp = 'unset';
        el.style.overflow = 'visible';
        actions++;
      } catch {}
    }

    // 1) Clicks por texto
    {
      let count = 0;
      const clickable = qsaDeep(root, 'button, a, summary, div, span, [role="button"], [tabindex]');
      const clicked = new Set();
      const tryClick = (el) => { if (!clicked.has(el)) { clicked.add(el); if (isVisible(el)) { clickHard(el); actions++; } } };

      for (const el of clickable){
        if (++count > 1200) break;
        const txt = (el.innerText || el.textContent || '').trim();
        if (!txt) continue;
        if (TEXT_PATTERNS.some(rx => rx.test(txt))) tryClick(el);
      }

      // 2) ARIA
      qsaDeep(root, '[aria-expanded="false"], details:not([open]) > summary, [data-click-to-expand]').forEach(tryClick);

      // 3) “ver X respuestas”
      qsaDeep(root, '[data-test-id*="repl" i], [data-testid*="repl" i], [data-qa*="repl" i]').forEach(tryClick);

      // 4) Inputs de disclosure
      qsaDeep(root, 'input[type="checkbox"], input[type="radio"]').forEach((el)=>{
        try {
          if (!el.checked && isVisible(el)) {
            el.checked = true;
            el.dispatchEvent(new Event('change', { bubbles: true }));
            actions++;
          }
        } catch {}
      });
    }

    // 5) OpenWeb/Spot.IM específicos (clases y data-* más frecuentes)
    {
      const roots = qsaDeep(root, `
        [id*="openweb" i],
        [class*="openweb" i],
        [id*="spot" i],
        [class*="spot" i],
        [id*="conversation" i],
        [class*="conversation" i],
        ow-conversation, ow-comments, ow-comment, ow-thread
      `);

      const tryClick = (el)=>{ if (isVisible(el)) { clickHard(el); actions++; } };

      roots.forEach(rw=>{
        // load more / see more replies
        qsaDeep(rw, `
          .ow-button, .ow-load-more, .ow-see-more, .ow-expand,
          [data-action*="expand" i], [data-testid*="showmore" i], [data-qa*="see-more" i],
          button[aria-label*="more" i], button[aria-label*="repl" i], a[aria-label*="more" i]
        `).forEach(tryClick);

        // toggles populares
        qsaDeep(rw, `
          [class*="more-repl" i], [class*="more-repl" i] button, [class*="show-more" i], [class*="load-more" i]
        `).forEach(tryClick);

        // quitar clamps locales
        qsaDeep(rw, '[class*="trunc" i], [class*="collapsed" i], [class*="clamp" i]').forEach(el=>{
          try { el.style.webkitLineClamp = 'unset'; el.style.lineClamp = 'unset'; el.style.maxHeight = 'none'; el.style.overflow = 'visible'; actions++; } catch {}
        });

        // hover sobre contenedores que lazy-cargan respuestas
        qsaDeep(rw, '[class*="repl" i], [class*="thread" i], [role="listitem"]').forEach(hover);
      });
    }

    // 6) Nudge de scroll para disparar observers/lazy
    jiggleScroll(root.ownerDocument || document);

    return actions;
  }

  function allRoots(){
    const roots = [document, document.documentElement, document.body].filter(Boolean);
    try { document.querySelectorAll('iframe').forEach((f)=>{ try { if (f.contentDocument) roots.push(f.contentDocument); } catch {} }); } catch {}
    try { STATE.shadowRoots.forEach((r)=> roots.push(r)); } catch {}
    return roots;
  }

  function expandEverywhere(){
    injectStyles();
    let actions = 0;
    for (const r of allRoots()) actions += expandOnceInRoot(r) || 0;
    if (actions) STATE.lastActionTs = Date.now();
    return actions;
  }

  // ===== Loop =====
  function startPersistentExpand(btn){
    if (STATE.running) { console.info('[LT] loop already running; ignoring'); return; }
    STATE.running = true;

    try { if (STATE.timerId) clearTimeout(STATE.timerId); } catch {}
    try { if (STATE.observer) STATE.observer.disconnect(); } catch {}

    if (btn) { btn.textContent = `Expand & Freeze · v${VERSION} · ON`; btn.disabled = true; btn.style.opacity = '0.85'; btn.style.cursor = 'default'; }
    console.info('[LT] persistent loop starting');

    const loop = () => {
      if (IS_TOP) openCommentsModuleOnce(); // montar si está colapsado
      const actions = expandEverywhere();
      console.info(`[LT] tick on ${host} (${IS_TOP ? 'top' : 'iframe'}): actions=${actions}`);
      const recent = Date.now() - STATE.lastActionTs;
      const delay = actions > 0 ? 800 : (recent < 6000 ? 1200 : 4000);
      STATE.timerId = setTimeout(loop, delay);
    };
    loop();

    if ('MutationObserver' in window){
      STATE.observer = new MutationObserver((muts)=>{
        let localActs = 0;
        for (const m of muts){
          if (m.addedNodes?.length) m.addedNodes.forEach((n)=>{ if (n?.nodeType === 1) localActs += expandOnceInRoot(n) || 0; });
        }
        if (localActs) console.info(`[LT] boot tick actions=${localActs}`);
      });
      try { STATE.observer.observe(document.documentElement, { childList: true, subtree: true }); } catch {}
    }
  }

  // ===== Boot =====
  (function boot(){
    injectStyles();
    if (!IS_TOP) { startPersistentExpand(null); return; }
    // Boot corto que ayuda a montar el widget
    let ticks = 0;
    const t = setInterval(()=>{
      openCommentsModuleOnce();
      const acts = expandEverywhere();
      console.info(`[LT] boot tick actions=${acts}`);
      if (++ticks >= 6 || acts === 0) clearInterval(t);
    }, 700);
  })();

  injectButton();

  if (IS_TOP) {
    addEventListener('keydown', (e)=>{
      if (e.altKey && e.shiftKey && (e.key === 'L' || e.key === 'l')) {
        e.preventDefault(); e.stopPropagation();
        const b = document.getElementById('lt-control');
        startPersistentExpand(b || null);
      }
    }, true);
    try { window.__LT_toggle = () => { const b = document.getElementById('lt-control'); startPersistentExpand(b || null); return 'LT: started'; }; } catch {}
  }
})();
