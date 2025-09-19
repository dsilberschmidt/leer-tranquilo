// Leer Tranquilo – content.js
// v0.3.11 (hotfix: cubrir "Show more comments" y click más robusto)

(() => {
  const VERSION = "0.3.11";
  document.documentElement.setAttribute("data-lt-version", VERSION);
  const where = window.top === window ? "top" : "iframe";
  console.log(`[LT] content loaded v${VERSION} on ${location.hostname} (${where})`);

  function ensureControl() {
    if (document.getElementById("lt-control")) return;
    const btn = document.createElement("button");
    btn.id = "lt-control";
    btn.textContent = `LT • v${VERSION}`;
    Object.assign(btn.style, {
      position: "fixed",
      inset: "auto 14px 14px auto",
      zIndex: 2147483647,
      padding: "8px 12px",
      fontSize: "12px",
      borderRadius: "8px",
      border: "1px solid #333",
      background: "#1f2937",
      color: "#fff",
      cursor: "pointer",
      opacity: "0.9",
    });
    btn.addEventListener("click", () => {
      console.log("[LT] click -> startPersistentExpand");
      startPersistentExpand();
    });
    (document.body || document.documentElement).appendChild(btn);
  }

  let loop = null;
  function startPersistentExpand() {
    if (loop) {
      console.log("[LT] loop already running; ignoring");
      return;
    }
    console.log("[LT] persistent loop starting");
    const tick = (boot = false) => {
      const n = (window.ltDom && window.ltDom.expandAll) ? window.ltDom.expandAll(40) : 0;
      console.log(`[LT] tick on ${location.hostname} (${where}): actions=${n}`);
      if (boot) console.log(`[LT] boot tick actions=${n}`);
    };
    tick(true);
    loop = setInterval(tick, 1200);
  }

  // Panic: tecla P -> expandir una vez fuerte
  document.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "p" && window.ltDom?.expandAll) {
      console.log("[LT] panic expand triggered");
      window.ltDom.expandAll(80);
    }
  });

  try {
    ensureControl();
    const priming = () => {
      document.removeEventListener("click", priming, true);
      startPersistentExpand();
    };
    document.addEventListener("click", priming, true);
  } catch (e) {
    console.warn("[LT] boot error:", e);
  }
})();
