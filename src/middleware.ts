import { NextRequest, NextResponse } from "next/server";

/**
 * Egyszerű, ingyenes HTTP Basic Auth zár az egész dashboardra.
 * A Vercel Hobby csomag nem védi a fő (production) URL-t, ezért itt, app-szinten zárunk.
 *
 * - A jelszó env változókból jön (DASHBOARD_USER / DASHBOARD_PASSWORD) — sose kerül kódba.
 * - Ha DASHBOARD_PASSWORD nincs beállítva, a zár KIKAPCSOL (hogy ne lehessen kizárni magunkat).
 * - A cron és a Telegram végpontok KI VANNAK véve: azoknak saját titkuk van
 *   (CRON_SECRET ill. TELEGRAM_WEBHOOK_SECRET), és külső szolgáltatás hívja őket.
 */
export const config = {
  // Mindenre fut, kivéve a statikus dolgokat és az avatarokat.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|avatars/).*)"],
};

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Automatizált végpontok kihagyása — saját titkos kulcsuk védi őket.
  if (
    pathname.startsWith("/api/cron") ||
    pathname.startsWith("/api/telegram") ||
    pathname.startsWith("/api/ingest") ||
    pathname.startsWith("/api/commands") ||
    pathname.startsWith("/api/seo") ||
    pathname.startsWith("/api/klari/") ||
    pathname.startsWith("/api/orders") ||
    pathname.startsWith("/api/poster-bg") ||
    pathname.startsWith("/api/email") ||
    pathname.startsWith("/api/finance") ||
    pathname.startsWith("/api/luca")
  ) {
    return NextResponse.next();
  }

  const expectedUser = process.env.DASHBOARD_USER || "vitech";
  const expectedPass = process.env.DASHBOARD_PASSWORD;

  // Ha nincs jelszó beállítva, ne zárjunk (elkerüljük az önkizárást).
  if (!expectedPass) return NextResponse.next();

  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Basic ")) {
    try {
      const decoded = atob(auth.slice(6));
      const sep = decoded.indexOf(":");
      const user = decoded.slice(0, sep);
      const pass = decoded.slice(sep + 1);
      if (user === expectedUser && pass === expectedPass) {
        return NextResponse.next();
      }
    } catch {
      // hibás fejléc → kérünk újra
    }
  }

  return new NextResponse("Bejelentkezés szükséges.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Vitech Marketing", charset="UTF-8"',
    },
  });
}
