
// lt-dom.js – utilidades DOM para expandir
// v0.3.9

window.ltDom = (() => {
  function expandAll() {
    let actions = 0;

    // Botones "See More"
    document.querySelectorAll("button, a").forEach((el) => {
      if (/see more/i.test(el.textContent) && el.offsetParent) {
        el.click();
        actions++;
      }
    });

    // Botones "Reply"
    document.querySelectorAll("button, a").forEach((el) => {
      if (/reply/i.test(el.textContent) && el.offsetParent) {
        el.click();
        actions++;
      }
    });

    return actions;
  }

  return { expandAll };
})();
