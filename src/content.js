// == LT Reader Helper ==
// Version tag for quick check:
document.documentElement.setAttribute('data-lt-version', '0.4.1');

// ---- Config (solo anclaje, sin expanders) ----
const LT = {
  id: 'LT',
  ver: '0.4.1',
  anchorKey: () => `LT:anchor:${location.origin}${location.pathname}`,
  articleSelector: 'main article, article, [data-qaid="article"], .article-content, .articleBody',
  // Timings + heurísticas
  bootDelayMs: 400,            // arranque suave post-load
  restoreDelays: [0, 140, 420, 900],
  restoreCooldownMs: 200,
  resetNodeThreshold: 6,
  resetDebounceMs: 900,
};

const state = {
  observer: null,
  restoreTimers: [],
  lastRestoreTs: 0,
  lastMutationTrigger: 0,
  lastSaved: null,
  observedTarget: null,
};

// ---- Telemetría muy simple (en consola) ----
const perf = {
  samples: [],
  push(name, dur) { this.samples.push({ t: Date.now(), name, dur }); },
  summarize() {
    const mine = this.samples.filter(s => /LT:/.test(s.name));
    const site = this.samples.filter(s => /SITE:/.test(s.name));
    const avg = arr => (arr.length ? (arr.reduce((a,b)=>a+b.dur,0)/arr.length).toFixed(2) : '0');
    console.group('%cLT perf (últimos ~10s)', 'color:#09f');
    console.log('Muestras LT:', mine.length, 'avg ms:', avg(mine));
    console.log('Muestras sitio:', site.length, 'avg ms:', avg(site));
    console.groupEnd();
    // limpia ventana para que no crezca
    this.samples = [];
  }
};
setInterval(()=>perf.summarize(), 10000);

// Helper para medir
function measure(label, fn) {
  const t0 = performance.now();
  const r = fn();
  const t1 = performance.now();
  perf.push(label, t1 - t0);
  return r;
}

// ---- Anchor (guardar/restaurar) ----
const ltDom = {
  saveAnchor(force=false) {
    return measure('LT:saveAnchor', () => {
      const key = LT.anchorKey();
      const y = window.scrollY || document.documentElement.scrollTop || 0;
      const vh = window.innerHeight || 0;
      const el = document.elementFromPoint(20, Math.min(200, Math.floor(vh*0.25)));
      let selector='', snippet='';
      if (el) {
        // busca bloque de texto padre
        const block = el.closest('p, h1, h2, h3, h4, li, blockquote, section, div');
        const target = block || el;
        selector = ltDom.getSelector(target);
        snippet = (target.textContent || '').trim().slice(0, 120);
      }
      const payload = { href: location.href, scrollY: y, vh, selector, snippet, ts: Date.now() };
      if (!force && state.lastSaved && state.lastSaved.scrollY === payload.scrollY && state.lastSaved.selector === payload.selector) {
        return state.lastSaved;
      }
      sessionStorage.setItem(key, JSON.stringify(payload));
      state.lastSaved = payload;
      return payload;
    });
  },
  restoreAnchor(force=false) {
    return measure('LT:restoreAnchor', () => {
      const now = Date.now();
      if (!force && now - state.lastRestoreTs < LT.restoreCooldownMs) return false;
      state.lastRestoreTs = now;
      const raw = sessionStorage.getItem(LT.anchorKey());
      if (!raw) return false;
      let data; try { data = JSON.parse(raw); } catch { return false; }
      if (data.href) {
        try {
          const savedUrl = new URL(data.href);
          if (savedUrl.origin !== location.origin || savedUrl.pathname !== location.pathname) return false;
        } catch (_) {
          // ignore parsing errors, seguimos con scroll fallback
        }
      }
      // prioridad: selector → fallback scrollY
      if (data.selector) {
        const node = document.querySelector(data.selector);
        if (node) {
          const top = node.getBoundingClientRect().top + window.scrollY - 80;
          window.scrollTo({ top, behavior: 'instant' });
          state.lastSaved = data;
          return true;
        }
      }
      if (typeof data.scrollY === 'number') {
        window.scrollTo({ top: data.scrollY, behavior: 'instant' });
        state.lastSaved = data;
        return true;
      }
      return false;
    });
  },
  getSelector(el) {
    if (!el || !el.tagName) return '';
    if (el.id) return `#${CSS.escape(el.id)}`;
    // construye selector simple
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && parts.length < 4) {
      const tag = node.tagName.toLowerCase();
      const cls = (node.className || '').toString().split(/\s+/).filter(Boolean).slice(0,2).map(c=>'.'+CSS.escape(c)).join('');
      parts.unshift(tag + cls);
      node = node.parentElement;
    }
    return parts.join(' > ');
  }
};
window.ltDom = ltDom; // para pruebas manuales

// ---- Restauración reactiva ----
function cancelScheduledRestores() {
  state.restoreTimers.forEach(id => clearTimeout(id));
  state.restoreTimers = [];
}

function scheduleRestore(_reason='generic') {
  cancelScheduledRestores();
  LT.restoreDelays.forEach((delay, idx) => {
    const id = setTimeout(() => {
      const restored = ltDom.restoreAnchor(true);
      if (restored) {
        cancelScheduledRestores();
      }
    }, delay);
    state.restoreTimers.push(id);
  });
}

function watchForResets() {
  const target = document.querySelector(LT.articleSelector) || document.body;
  if (!target) return;
  if (state.observer) state.observer.disconnect();
  state.observer = new MutationObserver(records => {
    let delta = 0;
    for (const record of records) {
      if (record.type !== 'childList') continue;
      delta += record.addedNodes.length + record.removedNodes.length;
      if (delta >= LT.resetNodeThreshold) break;
    }
    if (delta < LT.resetNodeThreshold) return;
    const now = Date.now();
    if (now - state.lastMutationTrigger < LT.resetDebounceMs) return;
    state.lastMutationTrigger = now;
    scheduleRestore('mutation');
    if (state.observedTarget && !document.contains(state.observedTarget)) {
      // contenedor reemplazado, volvemos a enganchar el observer
      watchForResets();
    }
  });
  state.observer.observe(target, { childList: true, subtree: true });
  state.observedTarget = target;
}

// ---- Arranque suave + restauraciones programadas ----
function boot() {
  measure('LT:boot', () => {
    watchForResets();
    scheduleRestore('boot');
  });
}

// Guardados “por las dudas”
window.addEventListener('beforeunload', () => ltDom.saveAnchor());
window.addEventListener('pagehide', () => {
  cancelScheduledRestores();
  if (state.observer) { state.observer.disconnect(); state.observer = null; }
  state.observedTarget = null;
  ltDom.saveAnchor();
});
window.addEventListener('scroll', () => {
  // throttle simple (cada ~120ms) para no recalentar
  if (boot._scrollLock) return;
  boot._scrollLock = true;
  setTimeout(()=>{ boot._scrollLock = false; ltDom.saveAnchor(); }, 120);
}, { passive: true });

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    ltDom.saveAnchor();
    cancelScheduledRestores();
  } else {
    scheduleRestore('visible');
  }
});

window.addEventListener('focus', () => scheduleRestore('focus'));

// pageshow (bfcache) + load diferido
window.addEventListener('pageshow', () => setTimeout(boot, LT.bootDelayMs));
if (document.readyState === 'complete') {
  setTimeout(boot, LT.bootDelayMs);
} else {
  window.addEventListener('load', () => setTimeout(boot, LT.bootDelayMs));
}

// ---- Botón manual opcional (por si querés probar) ----
(function ensurePanicButton(){
  if (document.getElementById('lt-control')) return;
  const btn = document.createElement('button');
  btn.id = 'lt-control';
  btn.textContent = 'LT save+restore';
  Object.assign(btn.style, { position:'fixed', right:'10px', bottom:'10px', zIndex: 999999, padding:'6px 8px', fontSize:'12px' });
  btn.addEventListener('click', () => {
    console.log('[LT] click -> save+restore anchor (manual)');
    ltDom.saveAnchor(true); ltDom.restoreAnchor(true);
  });
  document.body.appendChild(btn);
})();
