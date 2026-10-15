import type { ReactNode } from "react";
import config from "../../shared/config.json";
import { EVENT } from "@/lib/event";

/** Concert-ticket look: main body, perforation, stub. Purely presentational. */
export function TicketCard({ tokenId, badge, main, stub, tone = "default" }: {
  tokenId: string;
  badge?: ReactNode;
  main?: ReactNode;
  stub: ReactNode;
  tone?: "default" | "listed";
}) {
  return (
    <article className={`ticket rise ${tone === "listed" ? "!border-brand/50" : ""}`}>
      <div className="poster relative px-5 py-4">
        <div className="absolute inset-0 bg-black/35" />
        <div className="relative flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-widest text-white/80">{EVENT.tier}</div>
            <h3 className="mt-0.5 font-display text-lg font-bold leading-tight text-white">{config.eventName}</h3>
            <div className="mt-1 text-xs text-white/80">{EVENT.date} · {EVENT.venue}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-widest text-white/70">Ticket</div>
            <div className="font-display text-2xl font-bold leading-none text-white">#{tokenId}</div>
          </div>
        </div>
      </div>
      <div className="space-y-3 px-5 py-4">
        {badge && <div className="flex flex-wrap items-center gap-2 text-xs">{badge}</div>}
        {main}
      </div>
      <div className="perf" aria-hidden />
      <div className="px-5 py-4">{stub}</div>
    </article>
  );
}

export function Badge({ children, tone = "gray" }: { children: ReactNode; tone?: "gray" | "brand" | "amber" | "mint" }) {
  const c = {
    gray: "bg-white/10 text-slate-300",
    brand: "bg-brand/15 text-brand",
    amber: "bg-amber-500/15 text-amber-200",
    mint: "bg-mint/15 text-mint",
  }[tone];
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${c}`}>{children}</span>;
}
