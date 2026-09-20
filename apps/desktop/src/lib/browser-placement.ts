/** Runtime geometry owner: native webviews use logical client coordinates. */
export function placeBrowser(
  node: HTMLElement,
  options: {
    tabId: string;
    visible: boolean;
    place(
      tabId: string,
      bounds: { x: number; y: number; width: number; height: number },
      visible: boolean,
    ): Promise<void>;
  },
) {
  let current = options,
    frame = 0,
    last = "",
    disposed = false;
  let chain = Promise.resolve();
  const measure = () => {
    frame = 0;
    if (disposed || !current.tabId) return;
    const rect = node.getBoundingClientRect();
    const overlay = document.querySelector(
      '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"], [role="listbox"], [data-sidebar="sidebar"][data-mobile="true"]',
    );
    const bounds = {
      x: Math.max(0, rect.x),
      y: Math.max(0, rect.y),
      width: Math.max(1, rect.width),
      height: Math.max(1, rect.height),
    };
    const visible = current.visible && rect.width > 0 && rect.height > 0 && !overlay;
    const key = JSON.stringify([current.tabId, bounds, visible]);
    if (key === last) return;
    last = key;
    const captured = current;
    chain = chain.then(() =>
      disposed ? undefined : captured.place(captured.tabId, bounds, visible),
    );
  };
  const schedule = () => {
    if (!frame && !disposed) frame = requestAnimationFrame(measure);
  };
  const size = new ResizeObserver(schedule);
  size.observe(node);
  const overlays = new MutationObserver(schedule);
  overlays.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["data-state", "role", "class", "style"],
  });
  window.addEventListener("resize", schedule);
  window.addEventListener("scroll", schedule, true);
  schedule();
  return {
    update(options: typeof current) {
      if (current.tabId && current.tabId !== options.tabId) {
        const previous = current;
        chain = chain.then(() =>
          previous.place(previous.tabId, { x: 0, y: 0, width: 1, height: 1 }, false),
        );
      }
      current = options;
      schedule();
    },
    destroy() {
      disposed = true;
      cancelAnimationFrame(frame);
      size.disconnect();
      overlays.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      const captured = current;
      if (captured.tabId)
        void chain.then(() =>
          captured.place(captured.tabId, { x: 0, y: 0, width: 1, height: 1 }, false),
        );
    },
  };
}
