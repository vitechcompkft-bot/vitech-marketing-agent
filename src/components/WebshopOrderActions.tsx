"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Sor-muveletek a Webshop rendelés-táblázatban: fizetettre állítás (készpénz) + törlés (elrejtés). */
export default function WebshopOrderActions({
  orderKey,
  paid,
  paymentStatus,
}: {
  orderKey: string;
  paid: boolean | null;
  paymentStatus?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState("");

  async function act(action: string, confirmMsg?: string) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(action);
    try {
      const r = await fetch("/api/webshop/order", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, key: orderKey }),
      });
      if (r.ok) router.refresh();
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="flex items-center gap-1">
      {paid !== true && (
        <button
          className="btn btn-ghost px-2 py-1 text-xs"
          title="Fizetettre állítom (pl. készpénzes fizetés)"
          disabled={!!busy}
          onClick={() => act("markPaid")}
        >
          💵 Fizetve
        </button>
      )}
      {paid === true && paymentStatus === "kézi" && (
        <button
          className="btn btn-ghost px-2 py-1 text-xs"
          title="Kézi fizetettség visszavonása"
          disabled={!!busy}
          onClick={() => act("unmarkPaid")}
        >
          ↩︎
        </button>
      )}
      <button
        className="btn btn-ghost px-2 py-1 text-xs"
        title="Törlés a dashboardról (pl. próba rendelés) — a valódi Unas-rendelést NEM törli"
        disabled={!!busy}
        onClick={() => act("delete", "Biztosan törlöd ezt a rendelést a dashboardról? (A valódi webshop-rendelést nem törli, csak innen rejti el.)")}
      >
        🗑️
      </button>
    </div>
  );
}
