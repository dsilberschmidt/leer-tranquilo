// Floating button
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

// --- Core agent ---
async function runAgent() {
  const log = (...a)=>console.log("[LeerTranquilo]", ...a);
  try {
    log("Start");
    await autoScroll({ maxSteps: 30, stepPx: 1200, pauseMs: 500 });
    await expandAll({ passes: 6, pauseMs: 300 });

    const container = findCommentsContainer();
    if (!container) {
      alert("No comment container found. Expansion attempted anyway.");
      return;
    }

    freeze(container);
    toast("Comments frozen ✅");
    log("Done");
  } catch (e) {
    console.error(e);
    toast("Error running the agent");
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
  setTimeout(()=>t.remove(), 2000);
}

// 1) Auto-scroll to load lazy comments
async function autoScroll({ maxSteps=20, stepPx=1000, pauseMs=400 } = {}) {
  let lastY = -1, stableCount = 0;
  for (let i=0; i<maxSteps; i++) {
    window.scrollBy(0, stepPx);
    await sleep(pauseMs);
    if (window.scrollY === lastY) {
      stableCount++;
      if (stableCount >= 2) break;
    } else {
      stableCount = 0;
      lastY = window.scrollY;
    }
  }
  window.scrollTo({ top: 0 });
}

// 2) Expand all “read more”
async function expandAll({ passes=5, pauseMs=250 } = {}) {
  for (let p=0; p<passes; p++) {
    const btns = getReadMoreButtons();
    if (!btns.length) break;
    btns.forEach(b => safeClick(b));
    await sleep(pauseMs);
  }
}

function getReadMoreButtons() {
  const candidates = Array.from(document.querySelectorAll("button, a, span"))
    .filter(el => {
      const txt = (el.innerText || el.ariaLabel || "").trim().toLowerCase();
      return /read more|show more|view more|see more|ver más|mostrar más|leer más/.test(txt);
    });
  const viafoura = Array.from(document.querySelectorAll('[class*="vf-"], [data-vf], [aria-controls*="vf-"]'))
    .filter(el => /more|expand|toggle/i.test(el.getAttribute("aria-label") || ""));
  return [...new Set([...candidates, ...viafoura])];
}

function safeClick(el) { try { el.click(); } catch {} }

// 3) Freeze: clone and replace
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
  try {
    frozen.querySelectorAll("iframe").forEach(ifr => ifr.remove());
  } catch {}
}

function staticNode(el) {
  const span = document.createElement("span");
  span.textContent = (el.innerText || el.value || "").trim();
  span.style.whiteSpace = "pre-wrap";
  return span;
}

function findCommentsContainer() {
  const selectors = [
    '[id*="comment"], [class*="comment"]',
    '[class*="vf-comments"], [data-vf-widget-type="comments"]',
    '[id*="coral"], [class*="coral"]',
    '#disqus_thread',
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  const blocks = Array.from(document.querySelectorAll("section, div"))
    .filter(d => d.querySelectorAll("p").length > 10)
    .sort((a,b)=> b.querySelectorAll("p").length - a.querySelectorAll("p").length);
  return blocks[0] || null;
}

function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }
