"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Áttekintés" },
  { href: "/iroda", label: "Titkárság" },
  { href: "/feladatok", label: "Feladatok" },
  { href: "/csapat", label: "Csapat" },
  { href: "/creatives", label: "Kreatívok" },
  { href: "/naplo", label: "Napló" },
  { href: "/settings", label: "Beállítások" },
];

/** Felso menü — a jelenlegi oldal gombja kiemelve (btn-primary), a többi btn-ghost. */
export default function Nav() {
  const path = usePathname() || "/";
  const active = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));
  return (
    <nav className="flex flex-wrap gap-1 text-sm">
      {LINKS.map((l) => (
        <Link key={l.href} className={`btn ${active(l.href) ? "btn-primary" : "btn-ghost"}`} href={l.href}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
