"use client";

import { useState, useEffect } from "react";

export function AnimatedEllipsis() {
  const [dots, setDots] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setDots((d) => (d + 1) % 4);
    }, 400);
    return () => clearInterval(id);
  }, []);

  // Fixed-width span so the text before it doesn't shift as dots change.
  return <span style={{ display: "inline-block", width: "1.2em", textAlign: "left" }}>{".".repeat(dots)}</span>;
}
