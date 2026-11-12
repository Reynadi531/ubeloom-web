(() => {
  const pending = [];
  const tracker = document.getElementById("umami-tracker");
  let failed = false;

  function safeUrl(value) {
    if (!value) return value;
    const url = new URL(value, window.location.origin);
    url.search = "";
    url.hash = "";
    url.pathname = url.pathname.replace(/\/invoice\/[^/]+/g, "/invoice/:token");
    return url.toString();
  }

  window.umamiBeforeSend = (_type, payload) => ({
    ...payload,
    url: safeUrl(payload.url),
    referrer: safeUrl(payload.referrer),
    // Invoice titles can contain customer/order details.
    title: new URL(safeUrl(payload.url), window.location.origin).pathname,
  });

  function send(name, data) {
    if (failed) return;
    if (window.umami) {
      void window.umami.track(name, data);
    } else {
      pending.push({ name, data });
    }
  }

  tracker?.addEventListener(
    "load",
    () => {
      if (!window.umami) {
        failed = true;
        pending.length = 0;
        return;
      }
      for (const event of pending) send(event.name, event.data);
      pending.length = 0;
    },
    { once: true },
  );
  tracker?.addEventListener(
    "error",
    () => {
      failed = true;
      pending.length = 0;
    },
    { once: true },
  );

  function capture(event) {
    if (!(event.target instanceof Element)) return;
    // Umami already handles explicitly annotated clicks.
    if (event.type === "click" && event.target.closest("[data-umami-event]")) return;
    if (event.target.closest('[data-analytics-ignore], [contenteditable="true"]')) return;

    const target =
      event.target.closest(
        "a, button, input, select, textarea, form, summary, dialog, [role=button], [role=tab], [role=menuitem]",
      ) || event.target;
    const path = [];
    for (
      let element = target;
      element && element !== document.body;
      element = element.parentElement
    ) {
      let index = 1;
      for (
        let sibling = element.previousElementSibling;
        sibling;
        sibling = sibling.previousElementSibling
      ) {
        if (sibling.localName === element.localName) index += 1;
      }
      path.unshift(`${element.localName}:nth-of-type(${index})`);
    }
    // Structural selectors identify controls without sending text, IDs, or field values.
    send(event.type, { target: path.join(" > ") });
  }

  for (const name of ["click", "change", "submit", "reset", "toggle", "invalid"]) {
    document.addEventListener(name, capture, true);
  }
})();
