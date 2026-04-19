"use client";

import { useState } from "react";
import type { CompanyDashboardRow, EmailStatus, SimulatedEmail } from "@/lib/dashboard-data";

function formatPct(rate: number | null): string {
  if (rate == null) return "—";
  return `${Math.round(rate * 100)}%`;
}

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const days = Math.floor(diff / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

function StatusBadge({ status }: { status: EmailStatus }) {
  const styles: Record<EmailStatus, string> = {
    bounced:
      "bg-amber-950/60 text-amber-300 border-amber-800/50",
    sent: "bg-neutral-800 text-neutral-400 border-neutral-700",
    opened: "bg-blue-950/60 text-blue-300 border-blue-800/50",
    replied:
      "bg-emerald-950/60 text-emerald-300 border-emerald-800/50",
    not_sent: "bg-neutral-800 text-neutral-500 border-neutral-700",
  };

  const labels: Record<EmailStatus, string> = {
    bounced: "Bounced",
    sent: "Sent",
    opened: "Opened",
    replied: "Replied",
    not_sent: "Not sent",
  };

  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}

function OpenedLabel({ email }: { email: SimulatedEmail }) {
  if (email.status === "replied" || email.status === "opened") {
    return (
      <span className="text-neutral-500">
        · opened {relativeTime(email.opened_at)}
        {email.open_count > 1 ? ` ×${email.open_count}` : ""}
      </span>
    );
  }
  return null;
}

function EmailRow({ email }: { email: SimulatedEmail }) {
  return (
    <li className="rounded-md border border-neutral-800 bg-neutral-900/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-neutral-200">{email.dm_name}</span>
        {email.dm_title && (
          <span className="text-sm text-neutral-500">{email.dm_title}</span>
        )}
        <StatusBadge status={email.status} />
      </div>
      {email.dm_email && (
        <p className="mt-1 truncate text-xs text-neutral-500">{email.dm_email}</p>
      )}
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-500">
        <span>Sent {relativeTime(email.sent_at)}</span>
        <OpenedLabel email={email} />
        {email.status === "replied" && email.replied_at && (
          <span className="text-emerald-500/90">
            Replied {relativeTime(email.replied_at)}
          </span>
        )}
      </div>
      {email.status === "replied" && email.reply_subject && email.reply_body && (
        <div className="mt-3 rounded border border-neutral-800 bg-neutral-950/80 p-3 text-sm">
          <p className="text-xs font-medium text-neutral-400">
            {email.reply_subject}
          </p>
          <pre className="mt-2 whitespace-pre-wrap font-sans text-neutral-300">
            {email.reply_body}
          </pre>
        </div>
      )}
    </li>
  );
}

function RateBar({ label, pct }: { label: string; pct: number | null }) {
  const width = pct != null ? Math.min(100, Math.round(pct * 100)) : 0;
  return (
    <div className="min-w-[100px] flex-1">
      <div className="mb-0.5 flex justify-between text-[10px] uppercase tracking-wider text-neutral-500">
        <span>{label}</span>
        <span>{formatPct(pct)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-neutral-800">
        <div
          className={`h-full rounded-full ${
            label === "Open" ? "bg-blue-500/70" : "bg-emerald-500/70"
          }`}
          style={{ width: pct != null ? `${width}%` : "0%" }}
        />
      </div>
    </div>
  );
}

export default function DashboardCompanies({
  rows,
}: {
  rows: CompanyDashboardRow[];
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      {rows.map((row) => {
        const expanded = openId === row.id;
        const hasPipeline = row.emails.length > 0;
        const toggle = () =>
          setOpenId((id) => (id === row.id ? null : row.id));

        return (
          <div
            key={row.id}
            className="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950"
          >
            <button
              type="button"
              onClick={toggle}
              className="flex w-full items-start gap-4 px-4 py-4 text-left hover:bg-neutral-900/50"
            >
              <span
                className={`mt-0.5 text-neutral-500 transition-transform ${
                  expanded ? "rotate-90" : ""
                }`}
                aria-hidden
              >
                ▸
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <h3 className="font-medium text-neutral-100">{row.name}</h3>
                  {row.domain && (
                    <span className="text-sm text-neutral-500">{row.domain}</span>
                  )}
                </div>
                {!hasPipeline ? (
                  <p className="mt-1 text-sm text-amber-200/80">
                    Run pipeline first — no decision makers yet.
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-neutral-500">
                    {row.sent} sent · {row.delivered} delivered · {row.opened}{" "}
                    opened · {row.replied} replied
                    {row.bounced > 0 ? ` · ${row.bounced} bounced` : ""}
                  </p>
                )}
                {hasPipeline && (
                  <div className="mt-3 flex flex-wrap gap-4">
                    <RateBar label="Open" pct={row.open_rate} />
                    <RateBar label="Response" pct={row.response_rate} />
                  </div>
                )}
              </div>
            </button>
            {expanded && (
              <div className="border-t border-neutral-900 px-4 pb-4 pt-2">
                {!hasPipeline ? null : (
                  <ul className="space-y-3">
                    {row.emails.map((e) => (
                      <EmailRow key={e.dm_id} email={e} />
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
