import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { supabaseAdmin } from "@/lib/supabase";

export const metadata: Metadata = {
  title: "Vitech AI Marketinges",
  description: "Önálló (korlátozott) Google Ads + Meta marketing agent",
};

async function getPersona(): Promise<{ name: string; avatar: string }> {
  try {
    const sb = supabaseAdmin();
    const { data } = await sb.from("agent_config").select("agent_name, agent_avatar").eq("id", 1).single();
    if (data?.agent_name) return { name: data.agent_name, avatar: data.agent_avatar || "/avatars/luca-1.svg" };
  } catch {}
  return { name: "Luca", avatar: "/avatars/luca-1.svg" };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const persona = await getPersona();
  return (
    <html lang="hu">
      <body>
        <div className="mx-auto max-w-6xl px-4 py-6">
          <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-20 items-center rounded-2xl bg-white px-5 shadow-xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/avatars/vitech-logo.png" alt="Vitech Comp Kft." className="h-16 w-auto" />
              </div>
              <div>
                <div className="text-2xl font-extrabold leading-tight text-white">
                  AI <span className="text-brand">Marketing</span>
                </div>
                <div className="text-sm text-white/65">{persona.name} & csapata · Vitech Comp Kft.</div>
              </div>
            </div>
            <nav className="flex flex-wrap gap-1 text-sm">
              <Link className="btn btn-ghost" href="/">Áttekintés</Link>
              <Link className="btn btn-primary" href="/iroda">Titkárság</Link>
              <Link className="btn btn-ghost" href="/creatives">Kreatívok</Link>
              <Link className="btn btn-ghost" href="/naplo">Napló</Link>
              <Link className="btn btn-ghost" href="/settings">Beállítások</Link>
            </nav>
          </header>
          {children}
          <footer className="mt-12 text-center text-xs text-white/40">
            {persona.name} & csapata · csak korlátok között avatkozik be · minden lépés naplózva
          </footer>
        </div>
      </body>
    </html>
  );
}
