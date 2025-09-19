/*
 * Leer Tranquilo — content.js
 * v0.3.6 (one-shot expand -> freeze)
 *
 * Cambios clave vs 0.3.4:
 * - El botón hace un ciclo **one-shot**: expande, espera quietud y **congela** (se auto-detiene).
 * - Modo persistente queda en Alt+Shift+L (por si lo necesitás).
 * - Hotkeys: Alt+Shift+X = PANIC STOP, Alt+Shift+F = FREEZE ahora.
 * - CSS de "freeze": desactiva animaciones/transiciones, stickies molestos y auto-play.
 */

(() => {
  'use strict';

  // Abort si otro frame marcó kill.
  if (window.__LT_KILL) return;

  const VERSION = '0.3.6';
  const IS_TOP = (() => { try { return window.top === window; } catch { return false; } })();
  const HOST = location.hostname || '';

  // Limitar dominios (reduce ruido/CPU)
  const ALLOW_HOST = /(?:^|\.)jpost\.com$|(?:^|\.)spot\.im$|(?:^|\.)openweb/i;
  if (!ALLOW_HOST.test(HOST)) return;

  // Huellas de debug
  try { Object.defineProperty(window, '__LT_VERSION', { value: VERSION, configurable: true }); } catch {}
  try { document.documentElement.setAttribute('data-lt-version', VERSION); } catch {}
  console.info(`[LT] content loaded v${VERSION} on ${HOST} (${IS_TOP ? 'top' : 'iframe'})`);

  // ---------------- Estado global ----------------
  const STATE = {
    running: false,
    frozen: false,
    mode: 'idle', // 'idle' | 'oneshot' | 'persistent'
    timerId: null,
    observer: null,
    lastActionTs: 0,
    shadowRoots: new Set(),
    clickBudget: 0,
    idleTicks: 0
  };
  try { window.__LT_timerId = null; } catch {}
  try { window.__LT_observer = null; } catch {}

  // ---------------- Panic stop ----------------
  function panicStop() {
    try { window.__LT_KILL = true; } catch {}
    try { clearTimeout(STATE.timerId); window.__LT_timerId = null; } catch {}
    try { STATE.observer?.disconnect(); window.__LT_observer = null; } catch {}
    STATE.running = false;
    const b = document.getElementById('lt-control');
    if (b) { b.textContent = `LT · STOPPED · v${VERSION}`; b.disabled = true; b.style.opacity = '0.6'; b.style.cursor = 'not-allowed'; }
    console.info('[LT] PANIC STOP');
  }

  // ---------------- FREEZE (congelar DOM) ----------------
  function injectFreezeStyles() {
    if (document.getElementById('lt-freeze-style')) return;
    const style = document.createElement('style');
    style.id = 'lt-freeze-style';
    style.textContent = `
      /* Pausar animaciones/transiciones para evitar saltos */
      * {
        animation: none !important;
        transition: none !important;
        scroll-behavior: auto !important;
      }
      /* Evitar "sticky" que empuje contenido durante la lectura */
      [class*="sticky" i], [style*="position:sticky" i] {
        position: static !important;
        top: auto !important;
      }
      /* Evitar truncados */
      .comments, .comment, [data-testid*="comment" i], [aria-label*="comment" i] {
        max-height: none !important; overflow: visible !important;
      }
      [class*="truncate" i], [class*="collapsed" i], [class*="clamp" i],
      [style*="line-clamp" i], [style*="-webkit-line-clamp" i] {
        -webkit-line-clamp: unset !important; line-clamp: unset !important;
        max-height: none !important; overflow: visible !important;
      }
      /* Evitar reflows por iframes de ads apareciendo de golpe (solo si ya cargaron) */
      iframe[style*="height" i], iframe[height] { max-height: 60vh !important; }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function freezeNow(reason = 'manual') {
    if (STATE.frozen) return;
    STATE.frozen = true;
    try { clearTimeout(STATE.timerId); window.__LT_timerId = null; } catch {}
    try { STATE.observer?.disconnect(); window.__LT_observer = null; } catch {}
    STATE.running = false;
    STATE.mode = 'idle';
    injectFreezeStyles();
    // Pausar videos/autoplay y desactivar IntersectionObservers típicos
    try {
      document.querySelectorAll('video, audio').forEach(m => { try { m.pause(); m.autoplay = false; } catch {} });
    } catch {}
    // Señal visual
    const b = document.getElementById('lt-control');
    if (b) { b.textContent = `LT · FROZEN (${reason}) · v${VERSION}`; b.disabled = false; b.style.opacity = '0.9'; b.style.cursor = 'pointer'; }
    document.documentElement.setAttribute('data-lt-frozen', 'true');
    console.info(`[LT] FROZEN (${reason})`);
  }

  // Hotkeys
  if (IS_TOP) {
    addEventListener('keydown', (e) => {
      // Panic
      if (e.altKey && e.shiftKey && (e.key === 'X' || e.key === 'x')) {
        e.preventDefault(); e.stopPropagation();
        panicStop();
      }
      // Freeze ahora
      if (e.altKey && e.shiftKey && (e.key === 'F' || e.key === 'f')) {
        e.preventDefault(); e.stopPropagation();
        freezeNow('manual');
      }
    }, true);
  }

  // ---------------- Shadow DOM hook ----------------
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

  // ---------------- Utils ----------------
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

  function injectBaseStyles(){
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

  // ---------------- Botón (top) ----------------
  function injectButton(){
    if (!IS_TOP) return;
    const old = document.getElementById('lt-control'); if (old) old.remove();
    const btn = document.createElement('button');
    btn.id = 'lt-control';
    btn.textContent = `Expand & Freeze · v${VERSION}`;
    btn.title = `Leer Tranquilo ${VERSION} — expandir (one-shot) y congelar`;
    Object.assign(btn.style, {
      position: 'fixed', right: '16px', bottom: '16px', zIndex: 2147483647,
      padding: '10px 12px', background: '#00695c', color: '#fff', border: 'none',
      borderRadius: '10px', cursor: 'pointer', fontSize: '13px', pointerEvents: 'auto',
      boxShadow: '0 4px 14px rgba(0,0,0,.25)', userSelect: 'none'
    });
    const handler = (e) => {
      e.preventDefault?.(); e.stopPropagation?.(); e.stopImmediatePropagation?.();
      if (window.__LT_KILL) return;
      if (STATE.running) return;
      console.info('[LT] click -> oneShotExpandAndFreeze');
      oneShotExpandAndFreeze(btn);
    };
    btn.addEventListener('click', handler, true);
    btn.addEventListener('pointerdown', handler, true);
    (document.body || document.documentElement).appendChild(btn);
  }

  // ---------------- Heurísticas de expansión ----------------
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

    if (budget <= 0) { STATE.clickBudget = budget; return actions; }

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
    injectBaseStyles();
    let actions = 0;
    for (const r of allRoots()) actions += (expandOnceInRoot(r) || 0);
    if (actions) STATE.lastActionTs = Date.now();
    return actions;
  }

  // ---------------- Loops ----------------
  function installObserver() {
    if (!('MutationObserver' in window)) return null;
    const obs = new MutationObserver((muts)=>{
      if (window.__LT_KILL || STATE.frozen) return;
      let localActs = 0;
      let seen = 0;
      for (const m of muts){
        if (seen > 40) break;
        seen++;
        if (m.addedNodes?.length) m.addedNodes.forEach((n)=>{
          if (window.__LT_KILL || STATE.frozen) return;
          if (n?.nodeType === 1) localActs += expandOnceInRoot(n) || 0;
        });
      }
      if (localActs) {
        STATE.idleTicks = 0;
        console.info(`[LT] boot tick actions=${localActs}`);
      }
    });
    try { obs.observe(document.documentElement, { childList: true, subtree: true }); } catch {}
    window.__LT_observer = obs;
    return obs;
  }

  // Modo persistente (Alt+Shift+L) — para debugging
  function startPersistentExpand(btn){
    if (window.__LT_KILL || STATE.frozen) return;
    if (STATE.running) { console.info('[LT] loop already running; ignoring'); return; }
    STATE.running = true;
    STATE.mode = 'persistent';

    STATE.clickBudget = 60;
    try { if (STATE.timerId) clearTimeout(STATE.timerId); } catch {}
    try { if (STATE.observer) STATE.observer.disconnect(); } catch {}
    STATE.observer = installObserver();

    if (btn) { btn.textContent = `Expand · PERSIST · v${VERSION}`; btn.disabled = false; btn.style.opacity = '0.9'; btn.style.cursor = 'pointer'; }
    console.info('[LT] persistent loop starting');

    const loop = () => {
      if (window.__LT_KILL || STATE.frozen) return;
      openCommentsModuleOnce();
      STATE.clickBudget = Math.min(STATE.clickBudget + 20, 80);
      const actions = expandEverywhere();
      console.info(`[LT] tick on ${HOST} (${IS_TOP ? 'top' : 'iframe'}): actions=${actions}`);
      const recent = Date.now() - STATE.lastActionTs;
      const delay = actions > 0 ? 1500 : (recent < 8000 ? 2500 : 5000);
      STATE.timerId = setTimeout(loop, delay);
      window.__LT_timerId = STATE.timerId;
    };
    loop();
  }

  // Modo one-shot (botón): expande y se frena solo al quedar quieto
  function oneShotExpandAndFreeze(btn){
    if (window.__LT_KILL || STATE.frozen) return;
    if (STATE.running) return;
    STATE.running = true;
    STATE.mode = 'oneshot';
    STATE.idleTicks = 0;

    STATE.clickBudget = 60;
    try { if (STATE.timerId) clearTimeout(STATE.timerId); } catch {}
    try { if (STATE.observer) STATE.observer.disconnect(); } catch {}
    // Usamos observer para “asistir” durante el one-shot
    STATE.observer = installObserver();

    if (btn) { btn.textContent = `Expanding… · v${VERSION}`; btn.disabled = true; btn.style.opacity = '0.85'; btn.style.cursor = 'default'; }
    console.info('[LT] one-shot loop starting');

    const QUIET_TICKS = 2;        // cuántos ticks seguidos sin acciones
    const QUIET_MS = 5000;        // y además X ms sin acciones
    const MAX_DURATION_MS = 30000; // cortar por salud

    const t0 = Date.now();

    const loop = () => {
      if (window.__LT_KILL || STATE.frozen) return;

      openCommentsModuleOnce();
      STATE.clickBudget = Math.min(STATE.clickBudget + 20, 80);

      const actions = expandEverywhere();
      if (actions > 0) {
        STATE.idleTicks = 0;
      } else {
        STATE.idleTicks++;
      }

      const sinceLast = Date.now() - STATE.lastActionTs;
      console.info(`[LT] tick: actions=${actions} idleTicks=${STATE.idleTicks} sinceLast=${sinceLast}ms`);

      const doneByQuiet = STATE.idleTicks >= QUIET_TICKS && sinceLast >= QUIET_MS;
      const doneByTimeout = (Date.now() - t0) >= MAX_DURATION_MS;

      if (doneByQuiet || doneByTimeout) {
        // limpiar y freeze
        try { STATE.observer?.disconnect(); window.__LT_observer = null; } catch {}
        try { clearTimeout(STATE.timerId); window.__LT_timerId = null; } catch {}
        STATE.running = false;
        STATE.mode = 'idle';
        if (btn) { btn.textContent = `Freezing… · v${VERSION}`; }
        // pequeño delay para dejar terminar microtareas de layout
        setTimeout(()=>freezeNow(doneByQuiet ? 'quiet' : 'timeout'), 50);
        return;
      }

      // seguir iterando con delays dóciles
      const recent = Date.now() - STATE.lastActionTs;
      const delay = actions > 0 ? 1200 : (recent < 6000 ? 2000 : 3500);
      STATE.timerId = setTimeout(loop, delay);
      window.__LT_timerId = STATE.timerId;
    };

    loop();
  }

  // ---------------- Boot ----------------
  (function boot(){
    if (window.__LT_KILL) return;
    injectBaseStyles();
    // Minipush inicial (no agresivo)
    if (IS_TOP) {
      let ticks = 0;
      const t = setInterval(()=>{
        if (window.__LT_KILL || STATE.frozen) { clearInterval(t); return; }
        openCommentsModuleOnce();
        const acts = expandEverywhere();
        console.info(`[LT] boot tick actions=${acts}`);
        if (++ticks >= 2) clearInterval(t);
      }, 900);
    }
  })();

  injectButton();

  // Hotkeys extra en top
  if (IS_TOP) {
    addEventListener('keydown', (e)=>{
      // Start persistente
      if (e.altKey && e.shiftKey && (e.key === 'L' || e.key === 'l')) {
        e.preventDefault(); e.stopPropagation();
        const b = document.getElementById('lt-control');
        startPersistentExpand(b || null);
      }
    }, true);
  }
})();
