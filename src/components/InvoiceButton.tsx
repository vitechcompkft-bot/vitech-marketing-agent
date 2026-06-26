"use client";
import { useState } from "react";

type PreviewItem = { name: string; quantity: number; unitNet: number; unitGross: number; vat: string; lineGross: number };
type Preview = {
  ok: boolean;
  orderKey: string;
  alreadyInvoiced: boolean;
  existing?: { invoiceNumber: string; publicUrl?: string };
  buyer: { name: string; address: string; taxNumber?: string; email?: string };
  paymentMethod: string;
  items: PreviewItem[];
  sumGross: number;
  error?: string;
};

const ft = (n: number) => new Intl.NumberFormat("hu-HU").format(Math.round(n || 0)) + " Ft";
const PM: Record<string, string> = { cash_on_delivery: "Utánvét", wire_transfer: "Átutalás", bankcard: "Bankkártya", cash: "Készpénz" };

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
  const [done, setDone] = useState<{ number: string; url?: string } | null>(
    invoiced && invoiceNumber ? { number: invoiceNumber, url: publicUrl } : null
  );
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (done) {
    return done.url ? (
      <a className="badge bg-green-500/20 text-green-300 hover:bg-green-500/30" href={done.url} target="_blank" rel="noreferrer" title="Számla megnyitása">
        ✅ Számla: {done.number}
      </a>
    ) : (
      <span className="badge bg-green-500/20 text-green-300" title="Erről a rendelésről már készült számla">✅ Számlázva: {done.number}</span>
    );
  }

  async function openPreview() {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/invoice/preview", {
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
        setOpen(true);
      }
    } catch (e: any) {
      setErr(e?.message || "Hálózati hiba.");
    } finally {
      setLoading(false);
    }
  }

  async function confirmCreate() {
    setCreating(true);
    setErr(null);
    try {
      const r = await fetch("/api/invoice/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderKey }),
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

      {open && preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => !creating && setOpen(false)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl border border-white/10 bg-[#0f1c2e] p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-bold">🧾 Számla előnézet — #{preview.orderKey}</h3>
              <button className="text-white/50 hover:text-white" onClick={() => !creating && setOpen(false)}>✕</button>
            </div>

            <div className="mb-3 rounded-lg border border-white/10 bg-white/5 p-3 text-sm">
              <div className="font-semibold">{preview.buyer.name}</div>
              <div className="text-white/60">{preview.buyer.address}</div>
              {preview.buyer.taxNumber && <div className="text-white/60">Adószám: {preview.buyer.taxNumber}</div>}
              {preview.buyer.email && <div className="text-white/60">{preview.buyer.email}</div>}
              <div className="mt-1 text-white/50">Fizetés: {PM[preview.paymentMethod] || preview.paymentMethod}</div>
            </div>

            <table className="w-full text-sm">
              <thead className="text-left text-white/50">
                <tr><th className="py-1">Tétel</th><th className="text-right">Menny.</th><th className="text-right">Nettó egys.</th><th className="text-right">ÁFA</th><th className="text-right">Bruttó</th></tr>
              </thead>
              <tbody>
                {preview.items.map((it, i) => (
                  <tr key={i} className="border-t border-white/5 align-top">
                    <td className="py-1.5 pr-2">{it.name}</td>
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

            <div className="mt-2 text-xs text-white/40">A „Jóváhagyom és kiállítom" gombbal a számla VÉGLEGESEN létrejön a Billingóban (NAV-jelentéssel). Ez nem visszavonható (csak sztornózható).</div>
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
