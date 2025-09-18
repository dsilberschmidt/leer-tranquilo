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
  textRe: /(see|read|show|view)\s*more|ver\s*m[aá]s|mostrar\s*m[aá]s|leer\s*m[aá]s/i
};

async function runAgent() {
  try {
    await autoScroll({ maxSteps: 24, stepPx: 1200, pauseMs: 400 });
    await expandAllDeep({ passes: 8, pauseMs: 250 });
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
      ...deepQueryAriaExpanders()
    ];
    if (!btns.length && p > 1) break;
    btns.forEach(simulatedClick);
    await sleep(pauseMs);
  }
}

// detecta elementos con aria que suelen togglear contenido
function deepQueryAriaExpanders() {
  const res = new Set();
  walkDeep(document.documentElement, (node)=>{
    if (!(node instanceof Element)) return;
    const aria = node.getAttribute?.('aria-label') || "";
    const exp = node.getAttribute?.('aria-expanded');
    const ctrl = node.getAttribute?.('aria-controls');
    const role = node.getAttribute?.('role') || "";
    const label = (node.innerText || node.textContent || "").trim();
    if (
      /expand|more|toggle|ver m[aá]s|mostrar/i.test(aria+label) ||
      (role === "button" && (LT.textRe.test(label) || /expand|toggle/i.test(aria)))
    ) {
      res.add(closestClickable(node));
    }
    // Viafoura suele usar clases vf-* sin texto → intentemos por data-attrs
    if ([...node.classList||[]].some(c=>/^vf-/.test(c)) && /more|expand|toggle/i.test(aria)) {
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
    '[id*="comment"], [class*="comment"]',
    '[class*="vf-comments"], [data-vf-widget-type="comments"]',
    '[id*="coral"], [class*="coral"]',
    '#disqus_thread'
  ];
  for (const sel of sels) {
    const el = deepQuerySelector(sel);
    if (el) return el;
  }
  return null;
}

function deepQuerySelector(selector) {
  let found = null;
  walkDeep(document.documentElement, (node)=>{
    if (found) return;
    if (node instanceof Element && node.matches?.(selector)) found = node;
  });
  return found;
}

function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }
