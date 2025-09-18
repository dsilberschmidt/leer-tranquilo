// ====== UI: floating button ======
(function injectControl() {
  if (document.getElementById("lt-control")) return;
  const btn = document.createElement("button");
  btn.id = "lt-control";
  btn.textContent = "Expand & Freeze";
  Object.assign(btn.style, {
    position: "fixed", inset: "auto 16px 16px auto", zIndex: 2147483647,
    padding: "10px 14px", fontSize: "14px", borderRadius: "10px",
    border: "1px solid #ccc", background: "#fff", boxShadow: "0 2px 12px rgba(0,0,0,.2)",
    cursor: "pointer"
  });
  btn.onclick = runAgent;
  document.documentElement.appendChild(btn);
})();

const LT = {
  textRe: /(see|read|show|view)\s*more|ver\s*m[aá]s|mostrar\s*m[aá]s|leer\s*m[aá]s/i,
  spotAttr: '[data-spot-im-class],[data-ow-class],[data-openweb-class]' // Spot.IM / OpenWeb
};

async function runAgent() {
  try {
    await autoScroll({ maxSteps: 24, stepPx: 1200, pauseMs: 400 });
    await expandAllDeep({ passes: 10, pauseMs: 280 });
    const container = findCommentsContainerDeep();
    if (!container) {
      toast("No comment container found (still expanded).");
      return;
    }
    freeze(container);
    toast("Comments frozen ✅");
  } catch (e) {
    console.error(e);
    toast("Error");
  }
}

function toast(msg) {
  const t = document.createElement("div");
  t.textContent = msg;
  Object.assign(t.style, {
    position:"fixed", left:"50%", bottom:"60px", transform:"translateX(-50%)",
    background:"#111", color:"#fff", padding:"10px 14px", borderRadius:"8px",
    zIndex:2147483647, fontSize:"13px"
  });
  document.body.appendChild(t);
  setTimeout(()=>t.remove(), 1800);
}

// ====== Deep DOM utilities (pierce Shadow DOM & same-origin iframes) ======
function walkDeep(root, cb) {
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    cb(node);
    // Shadow root
    if (node.shadowRoot) stack.push(node.shadowRoot);
    // Children
    if (node.firstElementChild) {
      let el = node.firstElementChild;
      while (el) { stack.push(el); el = el.nextElementSibling; }
    }
    // Same-origin iframes
    if (node.tagName === "IFRAME") {
      try {
        const doc = node.contentDocument;
        if (doc) stack.push(doc.documentElement);
      } catch {} // cross-origin -> ignorar
    }
  }
}

function closestClickable(el) {
  return el.closest('button, a, [role="button"], [tabindex]:not([tabindex="-1"])') || el;
}

function deepQuery(selector, limit = Infinity) {
  const out = [];
  walkDeep(document.documentElement, (n)=>{
    if (out.length >= limit) return;
    if (n instanceof Element && n.matches?.(selector)) out.push(n);
  });
  return out;
}

function deepQueryButtonsByText(re) {
  const results = new Set();
  walkDeep(document.documentElement, (node)=>{
    if (!(node instanceof Element)) return;
    const label = (node.innerText || node.textContent || node.getAttribute?.('aria-label') || "").trim();
    if (!label) return;
    if (re.test(label)) results.add(closestClickable(node));
  });
  return Array.from(results);
}

// ====== Actions ======
async function autoScroll({ maxSteps=20, stepPx=1000, pauseMs=400 } = {}) {
  let lastY = -1, stable = 0;
  for (let i=0; i<maxSteps; i++) {
    window.scrollBy(0, stepPx);
    await sleep(pauseMs);
    if (window.scrollY === lastY) {
      if (++stable >= 2) break;
    } else { stable = 0; lastY = window.scrollY; }
  }
  window.scrollTo({ top: 0 });
}

async function expandAllDeep({ passes=6, pauseMs=250 } = {}) {
  for (let p=0; p<passes; p++) {
    const btns = [
      ...deepQueryButtonsByText(LT.textRe),
      ...deepSpotImExpanders(),
      ...deepGenericExpanders()
    ];
    const unique = [...new Set(btns)].filter(Boolean);
    if (!unique.length && p > 1) break;
    unique.forEach(simulatedClick);
    await sleep(pauseMs);
  }
}

// Heurísticas específicas Spot.IM / OpenWeb
function deepSpotImExpanders() {
  const res = new Set();
  // nodos con atributos Spot.IM
  const nodes = deepQuery(LT.spotAttr);
  for (const n of nodes) {
    if (!(n instanceof Element)) continue;
    const txt = (n.innerText || n.textContent || n.getAttribute('aria-label') || "").trim();
    const role = n.getAttribute('role') || "";
    // Botones “See more” con data-spot-im-class o role button
    if (LT.textRe.test(txt) || /expand|toggle|more/i.test(n.getAttribute('aria-label')||"")) {
      res.add(closestClickable(n));
    }
    if (role === "button" && /more|expand/i.test(txt)) {
      res.add(n);
    }
  }
  // algunos usan clases utilitarias
  const classBtns = deepQuery('[class*="ReadMore"],[class*="readMore"],[class*="ShowMore"],[class*="seeMore"],[class*="moreButton"]');
  classBtns.forEach(el => res.add(closestClickable(el)));
  return Array.from(res);
}

// Genérico por aria/roles
function deepGenericExpanders() {
  const res = new Set();
  walkDeep(document.documentElement, (node)=>{
    if (!(node instanceof Element)) return;
    const aria = node.getAttribute?.('aria-label') || "";
    const role = node.getAttribute?.('role') || "";
    const label = (node.innerText || node.textContent || "").trim();
    if (role === "button" && (LT.textRe.test(label) || /expand|toggle/i.test(aria))) {
      res.add(closestClickable(node));
    }
  });
  return Array.from(res);
}

function simulatedClick(el) {
  try {
    el.dispatchEvent(new MouseEvent('pointerdown', {bubbles:true}));
    el.dispatchEvent(new MouseEvent('mousedown', {bubbles:true}));
    el.click();
    el.dispatchEvent(new MouseEvent('mouseup', {bubbles:true}));
    el.dispatchEvent(new MouseEvent('pointerup', {bubbles:true}));
  } catch {}
}

// ====== Freeze ======
function freeze(container) {
  const clone = container.cloneNode(true);
  clone.querySelectorAll("button, a, input, textarea, select").forEach(el => {
    el.replaceWith(staticNode(el));
  });
  const frozen = document.createElement("div");
  frozen.id = "lt-frozen";
  frozen.setAttribute("inert", "");
  frozen.style.opacity = "0.9999";
  frozen.appendChild(clone);
  container.replaceWith(frozen);
  try { frozen.querySelectorAll("iframe").forEach(ifr => ifr.remove()); } catch {}
}

function staticNode(el) {
  const span = document.createElement("span");
  span.textContent = (el.innerText || el.value || "").trim();
  span.style.whiteSpace = "pre-wrap";
  return span;
}

function findCommentsContainerDeep() {
  const sels = [
    // genéricos
    '[id*="comment"], [class*="comment"]',
    // Spot.IM / OpenWeb a veces marca el contenedor con data-spot-im-class en ancestros
    `${LT.spotAttr}`,
    // Coral / Disqus por si acaso
    '[id*="coral"], [class*="coral"]',
    '#disqus_thread'
  ];
  for (const sel of sels) {
    const el = deepQuery(sel, 1)[0];
    if (el) return el;
  }
  return null;
}

function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }
