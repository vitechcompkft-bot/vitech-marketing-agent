import { supabaseAdmin } from "./supabase";

/**
 * LinkedIn poszt-kliens — Vida László SZEMÉLYES profiljára (Share on LinkedIn, w_member_social).
 * OAuth 2.0 authorization code flow; a tokent + a person URN-t az app_state-ben tároljuk.
 * Env: LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET. Redirect URI: {PUBLIC_BASE_URL}/api/linkedin/callback.
 * Termékek a LinkedIn Developer App-ban: "Sign In with LinkedIn using OpenID Connect" + "Share on LinkedIn".
 */
const LI_AUTH = "https://www.linkedin.com/oauth/v2";
const LI_API = "https://api.linkedin.com";
const SCOPE = "openid profile w_member_social";

function baseUrl(): string {
  return process.env.PUBLIC_BASE_URL || "https://vitech-marketing-agent.vercel.app";
}
function redirectUri(): string {
  return baseUrl() + "/api/linkedin/callback";
}

export function linkedinConfigured(): boolean {
  return !!(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET);
}

export function linkedinAuthUrl(state: string): string {
  const p = new URLSearchParams({
    response_type: "code",
    client_id: process.env.LINKEDIN_CLIENT_ID || "",
    redirect_uri: redirectUri(),
    scope: SCOPE,
    state,
  });
  return `${LI_AUTH}/authorization?${p.toString()}`;
}

export interface LinkedInSession {
  accessToken: string;
  personUrn: string;
  name?: string;
  expiresAt: number; // ms epoch
}

/** A visszairányítás code-jából token + person URN; eltároljuk. */
export async function exchangeCode(code: string): Promise<LinkedInSession> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(),
    client_id: process.env.LINKEDIN_CLIENT_ID || "",
    client_secret: process.env.LINKEDIN_CLIENT_SECRET || "",
  });
  const res = await fetch(`${LI_AUTH}/accessToken`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) throw new Error("Token-csere hiba: " + JSON.stringify(j).slice(0, 200));
  const accessToken = j.access_token as string;
  const expiresAt = Date.now() + Number(j.expires_in || 5184000) * 1000; // ~60 nap

  const ui = await fetch(`${LI_API}/v2/userinfo`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const uj = await ui.json().catch(() => ({}));
  const sub = uj?.sub;
  if (!sub) throw new Error("Nem sikerült a profil-azonosító (userinfo): " + JSON.stringify(uj).slice(0, 160));

  const session: LinkedInSession = { accessToken, personUrn: `urn:li:person:${sub}`, name: uj?.name, expiresAt };
  const sb = supabaseAdmin();
  await sb.from("app_state").upsert({ key: "linkedin_session", value: JSON.stringify(session), updated_at: new Date().toISOString() });
  return session;
}

export async function getLinkedInSession(): Promise<LinkedInSession | null> {
  try {
    const sb = supabaseAdmin();
    const { data } = await sb.from("app_state").select("value").eq("key", "linkedin_session").maybeSingle();
    if (!data?.value) return null;
    return JSON.parse(data.value) as LinkedInSession;
  } catch {
    return null;
  }
}

export interface LinkedInStatus {
  configured: boolean;
  connected: boolean;
  name?: string;
  expiresAt?: number;
  expired?: boolean;
}
export async function getLinkedInStatus(): Promise<LinkedInStatus> {
  const configured = linkedinConfigured();
  const s = await getLinkedInSession();
  if (!s) return { configured, connected: false };
  return { configured, connected: true, name: s.name, expiresAt: s.expiresAt, expired: Date.now() > s.expiresAt };
}

/** Auto-poszt KI/BE: alapból BE, ha össze van kötve; LINKEDIN_AUTOPOST=0 kapcsolja ki. */
export function linkedinAutopostEnabled(): boolean {
  return process.env.LINKEDIN_AUTOPOST !== "0";
}

/** Szöveges poszt kiküldése a személyes profilra (ugcPosts). */
export async function postToLinkedIn(text: string): Promise<{ ok: boolean; url?: string; error?: string }> {
  const s = await getLinkedInSession();
  if (!s) return { ok: false, error: "A LinkedIn nincs összekötve." };
  if (Date.now() > s.expiresAt) return { ok: false, error: "A LinkedIn token lejárt — kösd újra (/api/linkedin/connect)." };
  const payload = {
    author: s.personUrn,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text: text.slice(0, 2900) },
        shareMediaCategory: "NONE",
      },
    },
    visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
  };
  try {
    const res = await fetch(`${LI_API}/v2/ugcPosts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${s.accessToken}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify(payload),
    });
    const txt = await res.text();
    if (!res.ok) return { ok: false, error: `LinkedIn ${res.status}: ${txt.slice(0, 200)}` };
    let id = "";
    try {
      id = JSON.parse(txt)?.id || "";
    } catch {
      id = res.headers.get("x-restli-id") || "";
    }
    const url = id ? `https://www.linkedin.com/feed/update/${id}` : undefined;
    return { ok: true, url };
  } catch (e: any) {
    return { ok: false, error: e?.message || "hiba" };
  }
}
