import { useEffect, useRef } from "react";
import { prepareSampleCounters } from "./sample-counters";

/** Wait for page assets/fonts, then give the settled page a painted frame before entering. */
export function useAuthEntrance() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const motion = window.matchMedia("(min-width: 761px) and (prefers-reduced-motion: no-preference)");
    if (!motion.matches) return;

    const counters = prepareSampleCounters(root);
    const onAnimationStart = (event: AnimationEvent) => {
      if (event.animationName === "storbit-chart" && event.target instanceof Element && event.target.matches(".chart-line")) counters.start();
    };
    root.addEventListener("animationstart", onAnimationStart);

    let frame = 0;
    let timer = 0;
    let cancelled = false;
    root.dataset.authEntrance = "pending";
    const start = () => {
      // A single bounded pause makes the entrance observable after initial loading.
      // No form element is hidden, moved or disabled while decorations wait.
      const fontsReady = document.fonts?.ready ?? Promise.resolve();
      void fontsReady.catch(() => {}).then(() => {
        if (cancelled) return;
        timer = window.setTimeout(() => {
          frame = requestAnimationFrame(() => {
            frame = requestAnimationFrame(() => {
              if (!cancelled) root.dataset.authEntrance = "running";
            });
          });
        }, 200);
      });
    };
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });

    // Stop immediately if reduced motion is enabled or decorations become hidden.
    const stop = () => {
      if (!motion.matches) {
        cancelled = true;
        counters.cancel();
        window.clearTimeout(timer);
        cancelAnimationFrame(frame);
        window.removeEventListener("load", start);
        delete root.dataset.authEntrance;
      }
    };
    motion.addEventListener("change", stop);
    return () => {
      cancelled = true;
      counters.cancel();
      root.removeEventListener("animationstart", onAnimationStart);
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
      window.removeEventListener("load", start);
      motion.removeEventListener("change", stop);
      delete root.dataset.authEntrance;
    };
  }, []);
  return ref;
}
