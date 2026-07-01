"use client";
import { useState } from "react";

type PreviewItem = { name: string; quantity: number; unitNet: number; unitGross: number; vat: string; lineGross: number };
type Preview = {
  ok: boolean;
  orderKey: string;
  alreadyInvoiced: boolean;
  existing?: { invoiceNumber: string; publicUrl?: string };
  buyer: { name: string; address: string; taxNumber?: string; email?: string; zip?: string; city?: string; street?: string; countryCode?: string };
  paymentMethod: string;
  items: PreviewItem[];
  sumGross: number;
  error?: string;
};
type Edit = { name: string; taxNumber: string; email: string; zip: string; city: string; street: string; countryCode: string; itemNames: string[] };

const ft = (n: number) => new Intl.NumberFormat("hu-HU").format(Math.round(n || 0)) + " Ft";
const PM: Record<string, string> = { cash_on_delivery: "Utánvét", wire_transfer: "Átutalás", bankcard: "Bankkártya", cash: "Készpénz" };
const inputCls =
  "w-full rounded-md border border-white/10 bg-white/10 px-2 py-1 text-sm text-white placeholder-white/30 focus:border-sky-400 focus:outline-none";

export default function InvoiceButton({
  orderKey,
  invoiced,
  invoiceNumber,
  publicUrl,
}: {
  orderKey: string;
  invoiced: boolean;
  invoiceNumber?: string;
  publicUrl?: string;
}) {
  const [done, setDone] = useState<{ number?: string; url?: string } | null>(
    invoiced ? { number: invoiceNumber, url: publicUrl } : null
  );
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [edit, setEdit] = useState<Edit | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (done) {
    const label = done.number ? `Számla: ${done.number}` : "Számlázva";
    return done.url ? (
      <a className="badge bg-green-500/20 text-green-300 hover:bg-green-500/30" href={done.url} target="_blank" rel="noreferrer" title="Számla megnyitása">
        ✅ {label}
      </a>
    ) : (
      <span className="badge bg-green-500/20 text-green-300" title="Erről a rendelésről már készült számla">✅ {label}</span>
    );
  }

  async function openPreview() {
    setLoading(true);
    setErr(null);
    try {
      const r: Preview = await fetch("/api/invoice/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderKey }),
      }).then((x) => x.json());
      if (!r.ok) {
        setErr(r.error || "Az előnézet nem készült el.");
      } else if (r.alreadyInvoiced && r.existing) {
        setDone({ number: r.existing.invoiceNumber, url: r.existing.publicUrl });
      } else {
        setPreview(r);
        setEdit({
          name: r.buyer.name || "",
          taxNumber: r.buyer.taxNumber || "",
          email: r.buyer.email || "",
          zip: r.buyer.zip || "",
          city: r.buyer.city || "",
          street: r.buyer.street || "",
          countryCode: r.buyer.countryCode || "HU",
          itemNames: (r.items || []).map((it) => it.name),
        });
        setOpen(true);
      }
    } catch (e: any) {
      setErr(e?.message || "Hálózati hiba.");
    } finally {
      setLoading(false);
    }
  }

  function setE<K extends keyof Edit>(k: K, v: Edit[K]) {
    setEdit((e) => (e ? { ...e, [k]: v } : e));
  }
  function setItemName(i: number, v: string) {
    setEdit((e) => {
      if (!e) return e;
      const arr = [...e.itemNames];
      arr[i] = v;
      return { ...e, itemNames: arr };
    });
  }

  async function confirmCreate() {
    if (!edit) return;
    if (!edit.name.trim()) {
      setErr("A vevő neve kötelező.");
      return;
    }
    setCreating(true);
    setErr(null);
    try {
      const r = await fetch("/api/invoice/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderKey, edits: edit }),
      }).then((x) => x.json());
      if (!r.ok) {
        setErr(r.error || "A számla kiállítása nem sikerült.");
      } else {
        setDone({ number: r.invoiceNumber, url: r.publicUrl });
        setOpen(false);
      }
    } catch (e: any) {
      setErr(e?.message || "Hálózati hiba.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <button className="btn btn-ghost text-xs" onClick={openPreview} disabled={loading} title="Számla kiállítása a Billingóban">
        {loading ? "…" : "🧾 Számlázás"}
      </button>
      {err && !open && <span className="ml-2 text-xs text-red-300">{err}</span>}

      {open && preview && edit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => !creating && setOpen(false)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl border border-white/10 bg-[#0f1c2e] p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-bold">🧾 Számla — #{preview.orderKey}</h3>
              <button className="text-white/50 hover:text-white" onClick={() => !creating && setOpen(false)}>✕</button>
            </div>

            <div className="mb-2 rounded-lg border border-amber-400/30 bg-amber-400/10 p-2 text-xs text-amber-200">
              ✏️ Ellenőrizd/javítsd a vevő adatait a kiállítás előtt — a rendelést gyakran hiányosan/tévesen adják le.
              Céges vevőnél az <b>adószám</b> a lényeg (abból lesz a Billingo-partner).
            </div>

            <div className="mb-3 grid grid-cols-2 gap-2 rounded-lg border border-white/10 bg-white/5 p-3">
              <label className="col-span-2 text-xs text-white/60">Vevő neve
                <input className={inputCls} value={edit.name} onChange={(e) => setE("name", e.target.value)} />
              </label>
              <label className="text-xs text-white/60">Adószám (cégnél)
                <input className={inputCls} value={edit.taxNumber} placeholder="magánszemélynél üres" onChange={(e) => setE("taxNumber", e.target.value)} />
              </label>
              <label className="text-xs text-white/60">E-mail
                <input className={inputCls} value={edit.email} onChange={(e) => setE("email", e.target.value)} />
              </label>
              <label className="text-xs text-white/60">Irányítószám
                <input className={inputCls} value={edit.zip} onChange={(e) => setE("zip", e.target.value)} />
              </label>
              <label className="text-xs text-white/60">Város
                <input className={inputCls} value={edit.city} onChange={(e) => setE("city", e.target.value)} />
              </label>
              <label className="col-span-2 text-xs text-white/60">Utca, házszám
                <input className={inputCls} value={edit.street} onChange={(e) => setE("street", e.target.value)} />
              </label>
              <div className="col-span-2 mt-1 text-white/50">Fizetés: {PM[preview.paymentMethod] || preview.paymentMethod}</div>
            </div>

            <table className="w-full text-sm">
              <thead className="text-left text-white/50">
                <tr><th className="py-1">Tétel (javítható)</th><th className="text-right">Menny.</th><th className="text-right">Nettó egys.</th><th className="text-right">ÁFA</th><th className="text-right">Bruttó</th></tr>
              </thead>
              <tbody>
                {preview.items.map((it, i) => (
                  <tr key={i} className="border-t border-white/5 align-top">
                    <td className="py-1.5 pr-2"><input className={inputCls} value={edit.itemNames[i] ?? ""} onChange={(e) => setItemName(i, e.target.value)} /></td>
                    <td className="text-right">{it.quantity}</td>
                    <td className="text-right">{ft(it.unitNet)}</td>
                    <td className="text-right">{it.vat}</td>
                    <td className="text-right font-medium">{ft(it.lineGross)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-white/10"><td colSpan={4} className="py-2 text-right font-semibold">Végösszeg (bruttó):</td><td className="py-2 text-right text-base font-bold text-emerald-300">{ft(preview.sumGross)}</td></tr>
              </tfoot>
            </table>

            <div className="mt-2 text-xs text-white/40">A „Jóváhagyom és kiállítom" gombbal a számla VÉGLEGESEN létrejön a Billingóban (NAV-jelentéssel), a fenti (javított) adatokkal. Ez nem visszavonható (csak sztornózható).</div>
            {err && <div className="mt-2 text-sm text-red-300">{err}</div>}

            <div className="mt-4 flex justify-end gap-2">
              <button className="btn btn-ghost" onClick={() => setOpen(false)} disabled={creating}>Mégse</button>
              <button className="btn btn-primary" onClick={confirmCreate} disabled={creating}>{creating ? "Kiállítás…" : "✅ Jóváhagyom és kiállítom"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
