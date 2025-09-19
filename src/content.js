// Leer Tranquilo – content.js
// v0.4.0 (anchor persistente; anti-reset; sin expansión automática)

(() => {
  const VERSION = "0.4.0";
  const where = window.top === window ? "top" : "iframe";

  // Sello de versión para inspección rápida
  document.documentElement.setAttribute("data-lt-version", VERSION);
  if (!window.__LT_VERSION) window.__LT_VERSION = VERSION;
  console.log(`[LT] content loaded v${VERSION} on ${location.hostname} (${where})`);

  // Botón opcional (no expandimos por defecto; queda como “panic util”)
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
      console.log("[LT] click -> save+restore anchor (manual)");
      try { window.ltDom?.saveAnchor(true); window.ltDom?.restoreAnchor(true); } catch {}
    });
    (document.body || document.documentElement).appendChild(btn);
  }

  // Tecla P: util rápido para forzar un ciclo de save+restore
  document.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "p") {
      console.log("[LT] manual save+restore");
      try { window.ltDom?.saveAnchor(true); window.ltDom?.restoreAnchor(true); } catch {}
    }
  });

  try {
    ensureControl();

    // Anti-reset básico: eliminar meta refresh si existe
    const killMetaRefresh = () => {
      const metas = document.querySelectorAll('meta[http-equiv="refresh" i]');
      metas.forEach(m => m.parentNode && m.parentNode.removeChild(m));
    };
    killMetaRefresh();

    // Scroll restoration manual
    try { if ("scrollRestoration" in history) history.scrollRestoration = "manual"; } catch {}

    // Guardar anchor:
    // - periódicamente mientras el usuario se desplaza/lee (con throttle)
    // - al ocultarse la página / antes de descargar / pagehide
    // - justo antes de posibles resets (visibilidad cambia)
    window.ltDom?.armAnchorPersistence?.();

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") window.ltDom?.saveAnchor();
    });

    window.addEventListener("beforeunload", () => window.ltDom?.saveAnchor());
    window.addEventListener("pagehide", () => window.ltDom?.saveAnchor());

    // Restaurar anchor:
    // - al `pageshow` (incluye bfcache)
    // - tras grandes mutaciones del DOM
    window.addEventListener("pageshow", () => {
      setTimeout(() => window.ltDom?.restoreAnchor(), 60);
      setTimeout(() => window.ltDom?.restoreAnchor(), 350); // 2º intento tras hidratar anuncios/widgets
    }, { once: true });

    // Restaurar también después de la primera interacción (cuando el sitio termina de asentar layout)
    const onceAfterFirstClick = () => {
      document.removeEventListener("click", onceAfterFirstClick, true);
      setTimeout(() => window.ltDom?.restoreAnchor(), 200);
    };
    document.addEventListener("click", onceAfterFirstClick, true);
  } catch (e) {
    console.warn("[LT] boot error:", e);
  }
})();
