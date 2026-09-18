"use client";

import { useEffect } from "react";

export function HydrationCleanup() {
  useEffect(() => {
    const removeBisAttribute = () => {
      const root = document.documentElement || document.body;
      if (!root) return;
      root.querySelectorAll("[bis_skin_checked]").forEach((node) => {
        node.removeAttribute("bis_skin_checked");
      });
    };

    removeBisAttribute();

    const observer = new MutationObserver(() => {
      removeBisAttribute();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["bis_skin_checked"],
    });

    return () => observer.disconnect();
  }, []);

  return null;
}
