// content.js – Leer Tranquilo
// v0.3.9

(() => {
  const VERSION = "0.3.9";

  // Marcar versión en <html>
  document.documentElement.setAttribute("data-lt-version", VERSION);
  console.log(`[LT] content loaded v${VERSION} on ${location.hostname} (${window.top === window ? "top" : "iframe"})`);

  // Botón flotante
  if (!document.getElementById("lt-control")) {
    const btn = document.createElement("button");
    btn.id = "lt-control";
    btn.textContent = `LT • v${VERSION}`;
    Object.assign(btn.style, {
      position: "fixed",
      inset: "auto 16px 16px auto",
      zIndex: 2147483647,
      padding: "8px 12px",
      fontSize: "14px",
      borderRadius: "6px",
      border: "1px solid #444",
      background: "#000",
      color: "#fff",
      cursor: "pointer"
    });
    btn.onclick = () => {
      console.log("[LT] click -> startPersistentExpand");
      startPersistentExpand();
    };
    document.body.appendChild(btn);
  }

  // Persistent expand
  let loopRunning = false;
  function startPersistentExpand() {
    if (loopRunning) {
      console.log("[LT] loop already running; ignoring");
      return;
    }
    loopRunning = true;
    console.log("[LT] persistent loop starting");
    setInterval(tick, 3000);
    tick(true);
  }

  function tick(boot = false) {
    const actions = window.ltDom.expandAll();
    console.log(`[LT] tick on ${location.hostname} (${window.top === window ? "top" : "iframe"}): actions=${actions}`);
    if (boot) {
      console.log(`[LT] boot tick actions=${actions}`);
    }
  }

  // Panic button (tecla "p")
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "p") {
      console.log("[LT] panic expand triggered");
      window.ltDom.expandAll();
    }
  });
})();
