import * as React from "react";
import { createPortal } from "react-dom";

const PRINT_ROOT_ID = "print-root";

function getPrintRoot(): HTMLElement {
  let root = document.getElementById(PRINT_ROOT_ID);
  if (!root) {
    root = document.createElement("div");
    root.id = PRINT_ROOT_ID;
    document.body.appendChild(root);
  }
  return root;
}

/**
 * What `window.print()` prints. Rendered straight under <body>, outside the
 * app and any dialog, so a scrolling or transformed container can't clip
 * the printout. Hidden on screen; see the print rules in styles/globals.css.
 * Mount one at a time.
 */
export function PrintArea({ children }: { children: React.ReactNode }) {
  const [root] = React.useState(getPrintRoot);
  return createPortal(children, root);
}
