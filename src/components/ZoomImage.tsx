"use client";

import { useState } from "react";

/** Kattintható kép: teljes méretben megnyílik egy sötét overlay-en, újra kattintva bezárul (ESC is). */
export default function ZoomImage({ src, alt, className }: { src: string; alt?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <img
        src={src}
        alt={alt || ""}
        className={`${className || ""} cursor-zoom-in`}
        onClick={() => setOpen(true)}
        title="Kattints a nagyításhoz"
      />
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 cursor-zoom-out"
          onClick={() => setOpen(false)}
          role="button"
          aria-label="Bezárás"
        >
          <img src={src} alt={alt || ""} className="max-h-[92vh] max-w-[96vw] rounded-lg shadow-2xl" />
          <button
            className="absolute right-4 top-4 rounded-full bg-white/15 px-3 py-1 text-lg text-white hover:bg-white/25"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
            aria-label="Bezárás"
          >
            ✕
          </button>
        </div>
      )}
    </>
  );
}
