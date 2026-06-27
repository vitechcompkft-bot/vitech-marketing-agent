"use client";
import { useState } from "react";

export default function CopyButton({ text, label = "Szöveg másolása" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1800);
    } catch {
      /* clipboard nem elérheto */
    }
  }
  return (
    <button className="btn btn-primary text-xs" onClick={copy}>
      {done ? "✓ Másolva" : label}
    </button>
  );
}
