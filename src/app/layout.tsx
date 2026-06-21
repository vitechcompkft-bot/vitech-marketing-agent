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
            <div className="flex items-center gap-3">
              <div className="mono h-11 w-11 shrink-0 text-xl" style={{ background: "linear-gradient(135deg,#1A73E8,#0a2a5e)" }}>
                V
              </div>
              <div>
                <div className="text-lg font-bold leading-tight">
                  Vitech <span className="text-brand">Marketing</span>
                </div>
                <div className="text-xs text-white/55">{persona.name} & csapata · AI marketing · Vitech Comp Kft.</div>
              </div>
            </div>
            <nav className="flex flex-wrap gap-1 text-sm">
              <Link className="btn btn-ghost" href="/">Áttekintés</Link>
              <Link className="btn btn-ghost" href="/creatives">Kreatívok</Link>
              <Link className="btn btn-ghost" href="/chat">Chat</Link>
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
