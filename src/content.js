/*
 * Leer Tranquilo — content.js
 * v0.3.4 (panic stop + suavizado)
 *
 * Cambios clave:
 * - Alt+Shift+X = PANIC STOP (mata loop y observer al instante)
 * - Menos agresivo: delays más largos y tope de clicks por tick
 * - Respeta window.__LT_KILL siempre (por si pegás un snippet en consola)
 * - Botón solo en top; no autobucle en iframes (evita CPU extra)
 */

(() => {
  'use strict';

  // Si algún frame ya marcó kill, no inyectamos nada.
  if (window.__LT_KILL) return;

  const VERSION = '0.3.4';
  const IS_TOP = (() => { try { return window.top === window; } catch { return false; } })();
  const HOST = location.hostname || '';

  // Limitar a dominios relevantes (menos ruido)
  const ALLOW_HOST = /(?:^|\.)jpost\.com$|(?:^|\.)spot\.im$|(?:^|\.)openweb/i;
  if (!ALLOW_HOST.test(HOST)) return;

  // Señales visibles para debugging rápido
  try { Object.defineProperty(window, '__LT_VERSION', { value: VERSION, configurable: true }); } catch {}
  try { document.documentElement.setAttribute('data-lt-version', VERSION); } catch {}
  console.info(`[LT] content loaded v${VERSION} on ${HOST} (${IS_TOP ? 'top' : 'iframe'})`);

  // -------- Estado global (expuesto para poder frenarlo desde consola) --------
  const STATE = {
    running: false,
    timerId: null,
    observer: null,
    lastActionTs: 0,
    shadowRoots: new Set(),
    clickBudget: 0
  };
  // Exponer ids para limpiar desde consola
  try { window.__LT_timerId = null; } catch {}
  try { window.__LT_observer = null; } catch {}

  // -------- Panic Stop (tecla) --------
  function panicStop() {
    try { window.__LT_KILL = true; } catch {}
    try { clearTimeout(STATE.timerId); window.__LT_timerId = null; } catch {}
    try { STATE.observer?.disconnect(); window.__LT_observer = null; } catch {}
    STATE.running = false;
    const b = document.getElementById('lt-control');
    if (b) { b.textContent = `LT · STOPPED · v${VERSION}`; b.disabled = true; b.style.opacity = '0.6'; b.style.cursor = 'not-allowed'; }
    console.info('[LT] PANIC STOP');
  }

  if (IS_TOP) {
    addEventListener('keydown', (e) => {
      if (e.altKey && e.shiftKey && (e.key === 'X' || e.key === 'x')) {
        e.preventDefault(); e.stopPropagation();
        panicStop();
      }
    }, true);
  }

  // -------- Shadow DOM hook (para deep traversal) --------
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

  // -------- Utils --------
  function* deepNodes(root) {
    if (!root) return;
    const stack = [root];
    const seen = new Set();
    while (stack.length) {
      if (window.__LT_KILL) return;
      const node = stack.pop();
      if (!node || seen.has(node)) continue;
      seen.add(node);

      yield node;

      // shadow root
      try {
        const sr = node.shadowRoot || (node instanceof ShadowRoot ? node : null);
        if (sr) stack.push(sr);
      } catch {}

      // children
      try {
        if (node.children && node.children.length) {
          for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i]);
        }
      } catch {}

      // same-origin iframes
      try {
        if (node.tagName === 'IFRAME' && node.contentDocument) {
          stack.push(node.contentDocument);
          if (node.contentDocument.documentElement) stack.push(node.contentDocument.documentElement);
        }
      } catch {}
    }
  }

  function qsaDeep(root, selector, limit = Infinity) {
    const out = [];
    for (const n of deepNodes(root)) {
      if (window.__LT_KILL) break;
      if (out.length >= limit) break;
      try {
        if (n.querySelectorAll) n.querySelectorAll(selector).forEach(el => {
          if (out.length < limit) out.push(el);
        });
      } catch {}
    }
    return out;
  }

  function isVisible(el){ try { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; } catch { return false; } }

  function clickHard(el){
    if (!el || !isVisible(el)) return false;
    try {
      const evs = ['pointerdown','mousedown','click'];
      evs.forEach(type => el.dispatchEvent(new MouseEvent(type, {bubbles:true,cancelable:true,view:window})));
      return true;
    } catch { return false; }
  }

  function hover(el){
    try { el.dispatchEvent(new MouseEvent('mouseover', {bubbles:true, cancelable:true, view:window})); } catch {}
  }

  function jiggleScroll(doc = document){
    try {
      const w = doc.defaultView || window;
      const y = (w.scrollY || 0) + 1;
      w.scrollTo(0, y);
      w.scrollTo(0, y - 1);
    } catch {}
  }

  // -------- Estilos anti-truncado --------
  function injectStyles(){
    if (document.getElementById('lt-style')) return;
    const style = document.createElement('style');
    style.id = 'lt-style';
    style.textContent = `
      .comments, .comment, [data-testid*="comment" i], [aria-label*="comment" i] {
        max-height: none !important; overflow: visible !important;
      }
      [class*="truncate" i], [class*="collapsed" i], [class*="clamp" i], [style*="line-clamp" i] {
        -webkit-line-clamp: unset !important; line-clamp: unset !important;
        max-height: none !important; overflow: visible !important;
      }
      details[open] > summary ~ * { display: block !important; }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  // -------- Botón (solo top) --------
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
      if (window.__LT_KILL) return;
      console.info('[LT] click -> startPersistentExpand');
      startPersistentExpand(btn);
    };
    btn.addEventListener('click', handler, true);
    btn.addEventListener('pointerdown', handler, true);
    (document.body || document.documentElement).appendChild(btn);
  }

  // -------- Heurísticas --------
  const TEXT_PATTERNS = [
    /ver\s*m[aá]s|mostrar\s*m[aá]s|desplegar|ampliar/i,
    /see\s*more|show\s*more|expand|more\s*repl(y|ies)?/i,
    /load\s*more|view\s*\d+\s*more/i,
    /read\s*more|continue\s*reading/i
  ];

  function openCommentsModuleOnce(doc = document){
    let did = 0;
    const cand = qsaDeep(doc, 'a[href*="#comments"], [data-qa*="comment" i], [data-test*="comment" i], [aria-controls*="comment" i], button, a', 200);
    for (const el of cand) {
      const t=(el.innerText||el.textContent||'').toLowerCase();
      if (/comments|open\s*comments|view\s*comments|show\s*comments|join\s*the\s*discussion/.test(t)){
        if (clickHard(el)) did++;
      }
    }
    return did;
  }

  function expandOnceInRoot(root){
    if (!root || window.__LT_KILL) return 0;
    let actions = 0;
    let budget = STATE.clickBudget;

    // 0) Destruncar genérico
    for (const el of qsaDeep(root, '[class*="collapsed" i], [class*="truncate" i], [style*="line-clamp" i], [style*="-webkit-line-clamp" i]', 300)) {
      try {
        el.classList.remove('collapsed');
        el.style.maxHeight = 'none';
        el.style.webkitLineClamp = 'unset';
        el.style.lineClamp = 'unset';
        el.style.overflow = 'visible';
        actions++;
      } catch {}
    }

    if (budget <= 0) return actions;

    // 1) Clicks por texto/aria
    const clickable = qsaDeep(root, 'button, a, summary, [role="button"], [tabindex], details > summary', 800);
    const clicked = new Set();
    const tryClick = (el) => {
      if (budget <= 0 || clicked.has(el)) return;
      if (clickHard(el)) { actions++; budget--; clicked.add(el); }
    };

    for (const el of clickable){
      if (budget <= 0) break;
      const txt = (el.innerText || el.textContent || '').trim();
      if (!txt) continue;
      if (TEXT_PATTERNS.some(rx => rx.test(txt))) tryClick(el);
    }

    qsaDeep(root, '[aria-expanded="false"], details:not([open]) > summary, [data-click-to-expand]', 200).forEach(tryClick);
    qsaDeep(root, '[data-test-id*="repl" i], [data-testid*="repl" i], [data-qa*="repl" i]', 200).forEach(tryClick);

    // 2) OpenWeb/Spot.IM específicos
    const roots = qsaDeep(root, `
      [id*="openweb" i],
      [class*="openweb" i],
      [id*="spot" i],
      [class*="spot" i],
      [id*="conversation" i],
      [class*="conversation" i],
      ow-conversation, ow-comments, ow-comment, ow-thread
    `, 50);

    roots.forEach(rw=>{
      if (budget <= 0) return;
      qsaDeep(rw, `
        .ow-button, .ow-load-more, .ow-see-more, .ow-expand,
        [data-action*="expand" i], [data-testid*="showmore" i], [data-qa*="see-more" i],
        button[aria-label*="more" i], button[aria-label*="repl" i], a[aria-label*="more" i]
      `, 200).forEach(tryClick);

      qsaDeep(rw, '[class*="trunc" i], [class*="collapsed" i], [class*="clamp" i]', 200).forEach(el=>{
        try { el.style.webkitLineClamp='unset'; el.style.lineClamp='unset'; el.style.maxHeight='none'; el.style.overflow='visible'; actions++; } catch {}
      });

      qsaDeep(rw, '[class*="repl" i], [class*="thread" i], [role="listitem"]', 200).forEach(hover);
    });

    // 3) Nudge scroll
    jiggleScroll(root.ownerDocument || document);

    // devolver el budget consumido para coordinar ticks
    STATE.clickBudget = budget;
    return actions;
  }

  function allRoots(){
    const roots = [document, document.documentElement, document.body].filter(Boolean);
    try { document.querySelectorAll('iframe').forEach((f)=>{ try { if (f.contentDocument) roots.push(f.contentDocument); } catch {} }); } catch {}
    try { STATE.shadowRoots.forEach((r)=> roots.push(r)); } catch {}
    return roots;
  }

  function expandEverywhere(){
    if (window.__LT_KILL) return 0;
    injectStyles();
    let actions = 0;
    for (const r of allRoots()) actions += (expandOnceInRoot(r) || 0);
    if (actions) STATE.lastActionTs = Date.now();
    return actions;
  }

  // -------- Loop seguro --------
  function startPersistentExpand(btn){
    if (window.__LT_KILL) return;
    if (STATE.running) { console.info('[LT] loop already running; ignoring'); return; }
    STATE.running = true;

    // Budget control: máx. 60 clics por tick (antes era ilimitado)
    STATE.clickBudget = 60;

    try { if (STATE.timerId) clearTimeout(STATE.timerId); } catch {}
    try { if (STATE.observer) STATE.observer.disconnect(); } catch {}

    if (btn) { btn.textContent = `Expand & Freeze · v${VERSION} · ON`; btn.disabled = true; btn.style.opacity = '0.85'; btn.style.cursor = 'default'; }
    console.info('[LT] persistent loop starting');

    const loop = () => {
      if (window.__LT_KILL) return;
      // abrir el módulo una vez por ciclo en top
      if (IS_TOP) openCommentsModuleOnce();

      // resetear un poco el budget en cada tick (pero no infinito)
      STATE.clickBudget = Math.min(STATE.clickBudget + 20, 80);

      const actions = expandEverywhere();
      console.info(`[LT] tick on ${HOST} (${IS_TOP ? 'top' : 'iframe'}): actions=${actions}`);

      // Delays dóciles
      const recent = Date.now() - STATE.lastActionTs;
      const delay = actions > 0 ? 1500 : (recent < 8000 ? 2500 : 5000);

      STATE.timerId = setTimeout(loop, delay);
      window.__LT_timerId = STATE.timerId;
    };

    // Observer con throttling implícito (solo childList)
    if ('MutationObserver' in window){
      STATE.observer = new MutationObserver((muts)=>{
        if (window.__LT_KILL) return;
        let localActs = 0;
        let seen = 0;
        for (const m of muts){
          if (seen > 40) break; // tope de lotes por ráfaga
          seen++;
          if (m.addedNodes?.length) m.addedNodes.forEach((n)=>{
            if (window.__LT_KILL) return;
            if (n?.nodeType === 1) localActs += expandOnceInRoot(n) || 0;
          });
        }
        if (localActs) console.info(`[LT] boot tick actions=${localActs}`);
      });
      try {
        STATE.observer.observe(document.documentElement, { childList: true, subtree: true });
        window.__LT_observer = STATE.observer;
      } catch {}
    }

    loop();
  }

  // -------- Boot (suave, sin auto-loop en iframes) --------
  (function boot(){
    if (window.__LT_KILL) return;
    injectStyles();
    // En top: mini “push” inicial muy corto para intentar montar comentarios
    if (IS_TOP) {
      let ticks = 0;
      const t = setInterval(()=>{
        if (window.__LT_KILL) { clearInterval(t); return; }
        openCommentsModuleOnce();
        const acts = expandEverywhere();
        console.info(`[LT] boot tick actions=${acts}`);
        if (++ticks >= 3) clearInterval(t);
      }, 900);
    }
  })();

  injectButton();

  // Hotkey para iniciar rápido (por si el botón no es cómodo)
  if (IS_TOP) {
    addEventListener('keydown', (e)=>{
      if (e.altKey && e.shiftKey && (e.key === 'L' || e.key === 'l')) {
        e.preventDefault(); e.stopPropagation();
        const b = document.getElementById('lt-control');
        startPersistentExpand(b || null);
      }
    }, true);
  }
})();
