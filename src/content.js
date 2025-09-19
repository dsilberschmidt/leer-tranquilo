/*
 * Leer Tranquilo — content.js
 * v0.3.8
 *
 * Enfoque:
 * - Botón = one-shot: expande SOLO lo necesario y luego FREEZE.
 * - Prioriza viewport (visible) y skippea "replies" por defecto.
 * - Modo persistente queda en Alt+Shift+L.
 * - Hotkeys: Alt+Shift+F Freeze, Alt+Shift+X Panic, Alt+Shift+R toggle Replies.
 */

(() => {
  'use strict';
  if (window.__LT_KILL) return;

  const VERSION = '0.3.8';
  const IS_TOP = (() => { try { return window.top === window; } catch { return false; } })();
  const HOST = location.hostname || '';
  const ALLOW_HOST = /(?:^|\.)jpost\.com$|(?:^|\.)spot\.im$|(?:^|\.)openweb/i;
  if (!ALLOW_HOST.test(HOST)) return;

  // Estado
  const STATE = {
    running: false,
    frozen: false,
    mode: 'idle', // 'idle' | 'oneshot' | 'persistent'
    timerId: null,
    observer: null,
    lastActionTs: 0,
    shadowRoots: new Set(),
    clickBudget: 0,
    idleTicks: 0,
    expandReplies: false, // por defecto NO abrir replies
  };

  // Firma
  try { Object.defineProperty(window, '__LT_VERSION', { value: VERSION, configurable: true }); } catch {}
  try { document.documentElement.setAttribute('data-lt-version', VERSION); } catch {}
  console.info(`[LT] content loaded v${VERSION} on ${HOST} (${IS_TOP ? 'top' : 'iframe'})`);

  // ---------- Hotkeys base ----------
  if (IS_TOP) {
    addEventListener('keydown', (e) => {
      if (e.altKey && e.shiftKey && /x/i.test(e.key)) { e.preventDefault(); e.stopPropagation(); panicStop(); }
      if (e.altKey && e.shiftKey && /f/i.test(e.key)) { e.preventDefault(); e.stopPropagation(); freezeNow('manual'); }
      if (e.altKey && e.shiftKey && /r/i.test(e.key)) { // toggle replies
        e.preventDefault(); e.stopPropagation();
        STATE.expandReplies = !STATE.expandReplies;
        const b = document.getElementById('lt-control');
        if (b) b.title = titleForBtn();
        console.info(`[LT] expandReplies = ${STATE.expandReplies}`);
      }
      if (e.altKey && e.shiftKey && /l/i.test(e.key)) { e.preventDefault(); e.stopPropagation(); startPersistentExpand(document.getElementById('lt-control')); }
    }, true);
  }

  function titleForBtn(){
    return `Leer Tranquilo ${VERSION} — expandir (one-shot) y congelar\nReplies: ${STATE.expandReplies ? 'ON' : 'OFF'}  ·  Hotkeys: Alt+Shift+R para alternar`;
  }

  // ---------- Panic & Freeze ----------
  function panicStop() {
    try { window.__LT_KILL = true; } catch {}
    clearTimersObservers();
    STATE.running = false;
    const b = document.getElementById('lt-control');
    if (b) { b.textContent = `LT · STOPPED · v${VERSION}`; b.disabled = true; b.style.opacity = '0.6'; b.style.cursor = 'not-allowed'; }
    console.info('[LT] PANIC STOP');
  }

  function injectFreezeStyles() {
    if (document.getElementById('lt-freeze-style')) return;
    const style = document.createElement('style');
    style.id = 'lt-freeze-style';
    style.textContent = `
      * { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
      [class*="sticky" i], [style*="position:sticky" i] { position: static !important; top: auto !important; }
      .comments, .comment, [data-testid*="comment" i], [aria-label*="comment" i] { max-height: none !important; overflow: visible !important; }
      [class*="truncate" i], [class*="collapsed" i], [class*="clamp" i], [style*="line-clamp" i], [style*="-webkit-line-clamp" i] {
        -webkit-line-clamp: unset !important; line-clamp: unset !important; max-height: none !important; overflow: visible !important;
      }
      iframe[style*="height" i], iframe[height] { max-height: 60vh !important; }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function freezeNow(reason = 'manual') {
    if (STATE.frozen) return;
    STATE.frozen = true;
    clearTimersObservers();
    STATE.running = false;
    STATE.mode = 'idle';
    injectFreezeStyles();
    try { document.querySelectorAll('video, audio').forEach(m => { try { m.pause(); m.autoplay = false; } catch {} }); } catch {}
    const b = document.getElementById('lt-control');
    if (b) { b.textContent = `LT · FROZEN (${reason}) · v${VERSION}`; b.disabled = false; b.style.opacity = '0.9'; b.style.cursor = 'pointer'; }
    document.documentElement.setAttribute('data-lt-frozen', 'true');
    console.info(`[LT] FROZEN (${reason})`);
  }

  function clearTimersObservers(){
    try { if (STATE.timerId) { clearTimeout(STATE.timerId); STATE.timerId = null; } } catch {}
    try { STATE.observer?.disconnect(); STATE.observer = null; } catch {}
  }

  // ---------- Shadow hook ----------
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

  // ---------- Utils ----------
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

      try {
        const sr = node.shadowRoot || (node instanceof ShadowRoot ? node : null);
        if (sr) stack.push(sr);
      } catch {}

      try {
        if (node.children && node.children.length) for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i]);
      } catch {}

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
        if (n.querySelectorAll) n.querySelectorAll(selector).forEach(el => { if (out.length < limit) out.push(el); });
      } catch {}
    }
    return out;
  }

  function isVisible(el){ try { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; } catch { return false; } }
  function isInViewport(el, margin = 200){
    try { const r = el.getBoundingClientRect(); const vh = (el.ownerDocument?.defaultView?.innerHeight) || window.innerHeight || 0; return r.top < vh + margin && r.bottom > -margin; } catch { return false; }
  }
  function clickHard(el){
    if (!el || !isVisible(el)) return false;
    try {
      ['pointerdown','mousedown','click'].forEach(type => el.dispatchEvent(new MouseEvent(type, {bubbles:true,cancelable:true,view:window})));
      return true;
    } catch { return false; }
  }
  function hover(el){ try { el.dispatchEvent(new MouseEvent('mouseover', {bubbles:true, cancelable:true, view:window})); } catch {} }
  function jiggleScroll(doc = document){ try { const w = doc.defaultView || window; const y = (w.scrollY || 0) + 1; w.scrollTo(0, y); w.scrollTo(0, y - 1); } catch {} }

  function injectBaseStyles(){
    if (document.getElementById('lt-style')) return;
    const style = document.createElement('style');
    style.id = 'lt-style';
    style.textContent = `
      .comments, .comment, [data-testid*="comment" i], [aria-label*="comment" i] { max-height: none !important; overflow: visible !important; }
      [class*="truncate" i], [class*="collapsed" i], [class*="clamp" i], [style*="line-clamp" i] {
        -webkit-line-clamp: unset !important; line-clamp: unset !important; max-height: none !important; overflow: visible !important;
      }
      details[open] > summary ~ * { display: block !important; }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  // ---------- Botón ----------
  function injectButton(){
    if (!IS_TOP) return;
    const old = document.getElementById('lt-control'); if (old) old.remove();
    const btn = document.createElement('button');
    btn.id = 'lt-control';
    btn.textContent = `Expand & Freeze · v${VERSION}`;
    btn.title = titleForBtn();
    Object.assign(btn.style, {
      position: 'fixed', right: '16px', bottom: '16px', zIndex: 2147483647,
      padding: '10px 12px', background: '#00695c', color: '#fff', border: 'none',
      borderRadius: '10px', cursor: 'pointer', fontSize: '13px', pointerEvents: 'auto',
      boxShadow: '0 4px 14px rgba(0,0,0,.25)', userSelect: 'none'
    });
    const handler = (e) => {
      e.preventDefault?.(); e.stopPropagation?.(); e.stopImmediatePropagation?.();
      if (window.__LT_KILL || STATE.running) return;
      console.info('[LT] click -> oneShotExpandAndFreeze');
      oneShotExpandAndFreeze(btn);
    };
    btn.addEventListener('click', handler, true);
    btn.addEventListener('pointerdown', handler, true);
    (document.body || document.documentElement).appendChild(btn);
  }

  // ---------- Heurísticas ----------
  const TEXT_PATTERNS_CORE = [
    /ver\s*m[aá]s|mostrar\s*m[aá]s|desplegar|ampliar/i,
    /see\s*more|show\s*more|expand/i,
    /load\s*more|view\s*\d+\s*more/i,
    /read\s*more|continue\s*reading/i
  ];
  // Lo consideramos "reply" para NO abrir si expandReplies=false
  const TEXT_PATTERNS_REPLY = [
    /reply|replies|responder|respuestas|ver\s*(\d+)?\s*respuestas/i,
    /more\s*repl(y|ies)/i,
  ];

  function isReplyButton(el){
    const txt = (el.innerText || el.textContent || '').trim();
    if (!txt) return false;
    return TEXT_PATTERNS_REPLY.some(rx => rx.test(txt));
  }

  function looksLikeExpander(el){
    const txt = (el.innerText || el.textContent || '').trim();
    if (!txt) return false;
    if (!STATE.expandReplies && isReplyButton(el)) return false;
    return (
      TEXT_PATTERNS_CORE.some(rx => rx.test(txt)) ||
      /aria-expanded="false"/i.test(el.outerHTML || '') ||
      el.matches?.('details > summary, [aria-expanded="false"], [data-click-to-expand]') ||
      el.getAttribute?.('aria-label')?.match?.(/show|more|expand|ver|mostrar/i)
    );
  }

  // expande un root con estrategia de “viewport primero”
  function expandOnceInRoot(root) {
    if (!root || window.__LT_KILL) return 0;
    let actions = 0;
    let budget = STATE.clickBudget;

    // 0) destruncar
    for (const el of qsaDeep(root, '[class*="collapsed" i], [class*="truncate" i], [style*="line-clamp" i], [style*="-webkit-line-clamp" i]', 200)) {
      try { el.classList.remove('collapsed'); el.style.maxHeight='none'; el.style.webkitLineClamp='unset'; el.style.lineClamp='unset'; el.style.overflow='visible'; actions++; } catch {}
    }
    if (budget <= 0) { STATE.clickBudget = budget; return actions; }

    const tryClick = (el) => {
      if (budget <= 0) return;
      if (!isVisible(el)) return;
      if (!looksLikeExpander(el)) return;
      if (clickHard(el)) { actions++; budget--; }
    };

    // 1) SOLO cosas en viewport
    const clickables = qsaDeep(root, 'button, a, summary, [role="button"], [tabindex], details > summary', 300);
    for (const el of clickables) { if (budget <= 0) break; if (isInViewport(el, 120)) tryClick(el); }
    if (budget <= 0) { STATE.clickBudget = budget; return actions; }

    // 2) área cercana al viewport
    for (const el of clickables) { if (budget <= 0) break; if (!isInViewport(el, 600)) continue; tryClick(el); }
    if (budget <= 0) { STATE.clickBudget = budget; return actions; }

    // 3) resto (capado)
    let tailClicks = 0;
    for (const el of clickables) {
      if (budget <= 0) break;
      if (isInViewport(el, 1600)) { tryClick(el); tailClicks++; if (tailClicks >= 20) break; }
    }

    // 4) específicos de OpenWeb/Spot.IM (sin replies si expandReplies=false)
    const roots = qsaDeep(root, `
      [id*="openweb" i], [class*="openweb" i],
      [id*="spot" i], [class*="spot" i],
      [id*="conversation" i], [class*="conversation" i],
      ow-conversation, ow-comments, ow-comment, ow-thread
    `, 40);
    for (const rw of roots) {
      if (budget <= 0) break;

      // más seguro: expanders generales
      qsaDeep(rw, `
        .ow-button, .ow-load-more, .ow-see-more, .ow-expand,
        [data-action*="expand" i], [data-testid*="showmore" i], [data-qa*="see-more" i],
        button[aria-label*="more" i], a[aria-label*="more" i]
      `, 150).forEach(el => {
        if (budget > 0 && isInViewport(el, 600)) tryClick(el);
      });

      // NO abrir botones que explícitamente son replies cuando expandReplies=false
      if (STATE.expandReplies) {
        qsaDeep(rw, '[class*="repl" i], [data-testid*="repl" i], [data-qa*="repl" i], [aria-label*="repl" i]', 80)
          .forEach(el => { if (budget > 0 && isInViewport(el, 600)) tryClick(el); });
      }

      // destruncado extra
      qsaDeep(rw, '[class*="trunc" i], [class*="clamp" i]', 150).forEach(el=>{
        try { el.style.webkitLineClamp='unset'; el.style.lineClamp='unset'; el.style.maxHeight='none'; el.style.overflow='visible'; actions++; } catch {}
      });

      qsaDeep(rw, '[class*="thread" i], [role="listitem"]', 120).forEach(hover);
    }

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

  // ---------- Observer (para bootstrap de un one-shot/persistente) ----------
  function installObserver() {
    if (!('MutationObserver' in window)) return null;
    const obs = new MutationObserver((muts)=>{
      if (window.__LT_KILL || STATE.frozen) return;
      let localActs = 0, seen = 0;
      for (const m of muts){
        if (seen > 30) break; seen++;
        if (m.addedNodes?.length) m.addedNodes.forEach((n)=>{ if (n?.nodeType === 1) localActs += expandOnceInRoot(n) || 0; });
      }
      if (localActs) { STATE.idleTicks = 0; console.info(`[LT] boot tick actions=${localActs}`); }
    });
    try { obs.observe(document.documentElement, { childList: true, subtree: true }); } catch {}
    return obs;
  }

  // ---------- Modos ----------
  function startPersistentExpand(btn){
    if (window.__LT_KILL || STATE.frozen) return;
    if (STATE.running) { console.info('[LT] loop already running; ignoring'); return; }
    STATE.running = true; STATE.mode = 'persistent';
    STATE.clickBudget = 50; STATE.idleTicks = 0;
    clearTimersObservers();
    STATE.observer = installObserver();

    if (btn) { btn.textContent = `Expand · PERSIST · v${VERSION}`; btn.disabled = false; btn.style.opacity = '0.9'; btn.style.cursor = 'pointer'; }

    console.info('[LT] persistent loop starting');
    const loop = () => {
      if (window.__LT_KILL || STATE.frozen) return;
      openCommentsModuleOnce();
      STATE.clickBudget = Math.min(STATE.clickBudget + 18, 70);
      const actions = expandEverywhere();
      console.info(`[LT] tick on ${HOST} (${IS_TOP ? 'top' : 'iframe'}): actions=${actions}`);
      const recent = Date.now() - STATE.lastActionTs;
      const delay = actions > 0 ? 1400 : (recent < 6000 ? 2200 : 4000);
      STATE.timerId = setTimeout(loop, delay);
    };
    loop();
  }

  function oneShotExpandAndFreeze(btn){
    if (window.__LT_KILL || STATE.frozen) return;
    if (STATE.running) return;
    STATE.running = true; STATE.mode = 'oneshot'; STATE.idleTicks = 0;
    STATE.clickBudget = 45;
    clearTimersObservers();
    STATE.observer = installObserver();

    if (btn) { btn.textContent = `Expanding… · v${VERSION}`; btn.disabled = true; btn.style.opacity = '0.85'; btn.style.cursor = 'default'; }
    console.info('[LT] one-shot loop starting');

    const QUIET_TICKS = 2;
    const QUIET_MS = 4000;       // baja a 4s para cortar antes
    const MAX_DURATION_MS = 18000; // tope más corto

    const t0 = Date.now();
    const loop = () => {
      if (window.__LT_KILL || STATE.frozen) return;

      openCommentsModuleOnce();
      STATE.clickBudget = Math.min(STATE.clickBudget + 16, 60);

      const actions = expandEverywhere();
      if (actions > 0) STATE.idleTicks = 0; else STATE.idleTicks++;

      const sinceLast = Date.now() - STATE.lastActionTs;
      console.info(`[LT] tick: actions=${actions} idleTicks=${STATE.idleTicks} sinceLast=${sinceLast}ms`);

      const doneByQuiet = STATE.idleTicks >= QUIET_TICKS && sinceLast >= QUIET_MS;
      const doneByTimeout = (Date.now() - t0) >= MAX_DURATION_MS;

      if (doneByQuiet || doneByTimeout) {
        clearTimersObservers();
        STATE.running = false; STATE.mode = 'idle';
        if (btn) btn.textContent = `Freezing… · v${VERSION}`;
        setTimeout(()=>freezeNow(doneByQuiet ? 'quiet' : 'timeout'), 40);
        return;
      }

      const recent = Date.now() - STATE.lastActionTs;
      const delay = actions > 0 ? 900 : (recent < 5000 ? 1400 : 2200);
      STATE.timerId = setTimeout(loop, delay);
    };
    loop();
  }

  // Abre el módulo de comentarios 1 vez si existe
  function openCommentsModuleOnce(doc = document){
    let did = 0;
    const cand = qsaDeep(doc, 'a[href*="#comments"], [data-qa*="comment" i], [data-test*="comment" i], [aria-controls*="comment" i], button, a', 120);
    for (const el of cand) {
      const t=(el.innerText||el.textContent||'').toLowerCase();
      if (/comments|open\s*comments|view\s*comments|show\s*comments|join\s*the\s*discussion/.test(t)){
        if (isInViewport(el, 800) && clickHard(el)) did++;
      }
    }
    return did;
  }

  // ---------- Boot ----------
  (function boot(){
    injectBaseStyles();
    if (IS_TOP) {
      let ticks = 0;
      const t = setInterval(()=>{
        if (window.__LT_KILL || STATE.frozen) { clearInterval(t); return; }
        openCommentsModuleOnce();
        const acts = expandEverywhere();
        console.info(`[LT] boot tick actions=${acts}`);
        if (++ticks >= 2) clearInterval(t);
      }, 800);
    }
  })();

  injectButton();
})();
