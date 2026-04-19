import { supabase } from "@/lib/supabase";

export type EmailStatus = "not_sent" | "sent" | "opened" | "replied" | "bounced";

export type SimulatedEmail = {
  dm_id: string;
  dm_name: string;
  dm_title: string | null;
  dm_email: string | null;
  status: EmailStatus;
  open_count: number;
  sent_at: string | null;
  opened_at: string | null;
  replied_at: string | null;
  reply_subject: string | null;
  reply_body: string | null;
};

export type CompanyDashboardRow = {
  id: string;
  name: string;
  domain: string | null;
  funding_stage: string | null;
  headcount: number | null;
  emails: SimulatedEmail[];
  sent: number;
  delivered: number;
  opened: number;
  replied: number;
  bounced: number;
  open_rate: number | null;
  response_rate: number | null;
};

export type DashboardOverview = {
  total_companies: number;
  sent: number;
  delivered: number;
  opened: number;
  replied: number;
  bounced: number;
  open_rate: number | null;
  response_rate: number | null;
};

export type DashboardData = {
  overview: DashboardOverview;
  companies: CompanyDashboardRow[];
};

type DbDecisionMaker = {
  id: string;
  company_id: string;
  name: string | null;
  title: string | null;
  verified_email: string | null;
};

function fnv1a32(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const REPLY_TEMPLATES = [
  {
    subject: "Re: designers — yes, let's talk",
    body: "Thanks for reaching out. We're definitely thinking about design help as we scale. Could you share a few times next week for a quick call?\n\n—",
  },
  {
    subject: "Re: intros",
    body: "Appreciate the note. Happy to meet 1–2 of the folks you suggested. Please intro me to the first two on your list and we'll go from there.",
  },
  {
    subject: "Re: your note",
    body: "Not the right timing for us — we're heads-down on infra for another quarter. Circle back in Q3?",
  },
  {
    subject: "Re: hiring",
    body: "We actually just brought on a founding designer, so we're set for now. Thanks though.",
  },
  {
    subject: "Re: candidates",
    body: "Interesting list. Send over portfolios for the top two and I'll take a look this weekend.",
  },
] as const;

function simulateEmail(dm: DbDecisionMaker): SimulatedEmail {
  const rand = mulberry32(fnv1a32(dm.id));

  const bounced = rand() < 0.06;
  const now = Date.now();
  const daysAgo = 1 + Math.floor(rand() * 14);
  const sentAt = new Date(now - daysAgo * 86_400_000);

  if (bounced) {
    return {
      dm_id: dm.id,
      dm_name: dm.name ?? "Unknown",
      dm_title: dm.title,
      dm_email: dm.verified_email,
      status: "bounced",
      open_count: 0,
      sent_at: sentAt.toISOString(),
      opened_at: null,
      replied_at: null,
      reply_subject: null,
      reply_body: null,
    };
  }

  const opened = rand() < 0.58;
  const openCount = opened ? 1 + Math.floor(rand() * 5) : 0;
  const openDelayMs = opened ? rand() * 36 * 3_600_000 : 0;
  const openedAt = opened
    ? new Date(sentAt.getTime() + openDelayMs)
    : null;

  const replied = opened && rand() < 0.34;
  const replyDelayMs = replied
    ? (2 + rand() * (96 - 2)) * 3_600_000
    : 0;
  const repliedAt =
    replied && openedAt
      ? new Date(openedAt.getTime() + replyDelayMs)
      : null;

  const tplIndex = Math.floor(rand() * REPLY_TEMPLATES.length);
  const tpl = REPLY_TEMPLATES[tplIndex]!;

  if (replied && repliedAt) {
    return {
      dm_id: dm.id,
      dm_name: dm.name ?? "Unknown",
      dm_title: dm.title,
      dm_email: dm.verified_email,
      status: "replied",
      open_count: openCount,
      sent_at: sentAt.toISOString(),
      opened_at: openedAt!.toISOString(),
      replied_at: repliedAt.toISOString(),
      reply_subject: tpl.subject,
      reply_body: `${tpl.body}\n${dm.name?.split(" ")[0] ?? "Team"}`,
    };
  }

  if (opened && openedAt) {
    return {
      dm_id: dm.id,
      dm_name: dm.name ?? "Unknown",
      dm_title: dm.title,
      dm_email: dm.verified_email,
      status: "opened",
      open_count: openCount,
      sent_at: sentAt.toISOString(),
      opened_at: openedAt.toISOString(),
      replied_at: null,
      reply_subject: null,
      reply_body: null,
    };
  }

  return {
    dm_id: dm.id,
    dm_name: dm.name ?? "Unknown",
    dm_title: dm.title,
    dm_email: dm.verified_email,
    status: "sent",
    open_count: 0,
    sent_at: sentAt.toISOString(),
    opened_at: null,
    replied_at: null,
    reply_subject: null,
    reply_body: null,
  };
}

function aggregateEmails(emails: SimulatedEmail[]): {
  sent: number;
  delivered: number;
  opened: number;
  replied: number;
  bounced: number;
  open_rate: number | null;
  response_rate: number | null;
} {
  const sent = emails.length;
  const bounced = emails.filter((e) => e.status === "bounced").length;
  const delivered = sent - bounced;
  const opened = emails.filter(
    (e) => e.status === "opened" || e.status === "replied"
  ).length;
  const replied = emails.filter((e) => e.status === "replied").length;

  const open_rate =
    delivered > 0 ? opened / delivered : null;
  const response_rate =
    delivered > 0 ? replied / delivered : null;

  return {
    sent,
    delivered,
    opened,
    replied,
    bounced,
    open_rate,
    response_rate,
  };
}

export async function getDashboardData(): Promise<DashboardData> {
  const db = supabase();

  const { data: companies, error: cErr } = await db
    .from("companies")
    .select("id, name, domain, funding_stage, headcount")
    .eq("on_watchlist", true)
    .order("name", { ascending: true });

  if (cErr) throw new Error(`dashboard companies: ${cErr.message}`);

  const companyRows = companies ?? [];
  const companyIds = companyRows.map((c) => c.id);

  let dms: DbDecisionMaker[] = [];
  if (companyIds.length > 0) {
    const { data: dmRows, error: dErr } = await db
      .from("decision_makers")
      .select("id, company_id, name, title, verified_email")
      .in("company_id", companyIds);

    if (dErr) throw new Error(`dashboard decision_makers: ${dErr.message}`);
    dms = (dmRows ?? []) as DbDecisionMaker[];
  }

  const byCompany = new Map<string, DbDecisionMaker[]>();
  for (const dm of dms) {
    const list = byCompany.get(dm.company_id) ?? [];
    list.push(dm);
    byCompany.set(dm.company_id, list);
  }

  const companiesOut: CompanyDashboardRow[] = companyRows.map((c) => {
    const list = byCompany.get(c.id) ?? [];
    const emails = list.map(simulateEmail);
    const agg = aggregateEmails(emails);

    return {
      id: c.id,
      name: c.name ?? c.id,
      domain: c.domain,
      funding_stage: c.funding_stage,
      headcount: c.headcount,
      emails,
      sent: agg.sent,
      delivered: agg.delivered,
      opened: agg.opened,
      replied: agg.replied,
      bounced: agg.bounced,
      open_rate: emails.length === 0 ? null : agg.open_rate,
      response_rate: emails.length === 0 ? null : agg.response_rate,
    };
  });

  let totalSent = 0;
  let totalDelivered = 0;
  let totalOpened = 0;
  let totalReplied = 0;
  let totalBounced = 0;

  for (const row of companiesOut) {
    totalSent += row.sent;
    totalDelivered += row.delivered;
    totalOpened += row.opened;
    totalReplied += row.replied;
    totalBounced += row.bounced;
  }

  const overviewOpenRate =
    totalDelivered > 0 ? totalOpened / totalDelivered : null;
  const overviewResponseRate =
    totalDelivered > 0 ? totalReplied / totalDelivered : null;

  const overview: DashboardOverview = {
    total_companies: companiesOut.length,
    sent: totalSent,
    delivered: totalDelivered,
    opened: totalOpened,
    replied: totalReplied,
    bounced: totalBounced,
    open_rate: totalSent === 0 || totalDelivered === 0 ? null : overviewOpenRate,
    response_rate:
      totalSent === 0 || totalDelivered === 0 ? null : overviewResponseRate,
  };

  return { overview, companies: companiesOut };
}

export type RecentResponse = {
  company_id: string;
  company_name: string;
  dm_name: string;
  replied_at: string;
  reply_body: string;
  preview: string;
};

export function getRecentResponses(
  companies: CompanyDashboardRow[],
  limit = 3
): RecentResponse[] {
  const items: RecentResponse[] = [];

  for (const c of companies) {
    for (const e of c.emails) {
      if (e.status !== "replied" || !e.replied_at || !e.reply_body) continue;
      const firstLine = e.reply_body.split("\n")[0]?.trim() ?? e.reply_body;
      const preview =
        firstLine.length > 120 ? `${firstLine.slice(0, 117)}…` : firstLine;
      items.push({
        company_id: c.id,
        company_name: c.name,
        dm_name: e.dm_name,
        replied_at: e.replied_at,
        reply_body: e.reply_body,
        preview,
      });
    }
  }

  items.sort(
    (a, b) =>
      new Date(b.replied_at).getTime() - new Date(a.replied_at).getTime()
  );

  return items.slice(0, limit);
}
