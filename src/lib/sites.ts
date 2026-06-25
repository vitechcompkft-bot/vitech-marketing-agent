export interface MonitoredSite {
  id: string;
  name: string;
  url: string;
  scope: "public" | "lan"; // public = felhobol pingelheto; lan = belso agent jelenti
}

/**
 * Gyula által felügyelt oldalak. A 'public' oldalakat a felhobol (Vercel) pingeljük;
 * a 'lan' (10.49.8.x) oldalakat egy belso agent jelenti (/api/health/report).
 */
export const MONITORED_SITES: MonitoredSite[] = [
  { id: "unas-sync", name: "UNAS Sync Manager", url: "https://api-driven-website-m-z69o.bolt.host/", scope: "public" },
  { id: "hunor-intranet", name: "Hunor Coop Intranet", url: "https://intranet.hunorcoop.hu/", scope: "public" },
  { id: "hunor-vez-dashboard", name: "Hunor Boltok – Vezetoi Dashboard", url: "https://hunor-dashboard.pages.dev/", scope: "public" },
  { id: "drs-dashboard", name: "DRS göngyöleg dashboard", url: "https://drs-dashboard-seven.vercel.app/", scope: "public" },
  { id: "hr-doksi", name: "HR Dokumentumkezelo", url: "http://10.49.8.43:3002/admin", scope: "lan" },
  { id: "ugyviteli", name: "Ügyviteli dashboard", url: "http://10.49.8.43:3000/", scope: "lan" },
  { id: "kereskedelmi", name: "Kereskedelmi dashboard", url: "http://10.49.8.2:3000/", scope: "lan" },
  { id: "munkaugyi", name: "Munkaügyi dashboard", url: "http://10.49.8.43:3001/", scope: "lan" },
  { id: "nyomtato", name: "Nyomtató dashboard", url: "http://10.49.8.2:3300/nyomtatok/allasok", scope: "lan" },
  { id: "garancia", name: "Garancia-készíto (helyi)", url: "http://localhost:8000/", scope: "lan" },
];
