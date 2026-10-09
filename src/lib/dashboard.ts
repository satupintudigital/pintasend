import { query, queryOne } from "@/lib/db";
import { getTenantQuota, monthStartWib } from "@/lib/quota";

export interface DashboardMetrics {
  readyDevices: number;
  totalDevices: number;
  todayMessages: number;
  yesterdayMessages: number;
  monthMessages: number;
  maxMessagesPerMonth: number | null;
  maxDevices: number | null;
  totalContacts: number;
  activeBotRules: number;
  runningCampaigns: number;
  balance: number;
  planName: string;
}

export interface DayTrend {
  date: string;
  isoDate: string;
  incoming: number;
  outgoing: number;
  total: number;
}

export interface RecentMessageItem {
  id: string;
  direction: "incoming" | "outgoing";
  chatId: string;
  body: string;
  status: string;
  triggeredAt: string;
  deviceLabel: string | null;
}

export interface DeviceHealthItem {
  id: string;
  label: string;
  phone: string | null;
  status: string;
  updatedAt: string;
}

export interface DashboardOverviewData {
  metrics: DashboardMetrics;
  trend7Days: DayTrend[];
  recentMessages: RecentMessageItem[];
  devices: DeviceHealthItem[];
}

function getStartOfTodayWib(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T00:00:00+07:00`;
}

function getStartOfYesterdayWib(): string {
  const yesterday = new Date(Date.now() - 86_400_000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(yesterday);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T00:00:00+07:00`;
}

export async function getTenantDashboardOverview(tenantId: string): Promise<DashboardOverviewData> {
  const todayStart = getStartOfTodayWib();
  const yesterdayStart = getStartOfYesterdayWib();
  const startMonth = monthStartWib();

  const [
    quota,
    devicesSummary,
    todayCountRow,
    yesterdayCountRow,
    monthCountRow,
    contactsCountRow,
    botRulesCountRow,
    campaignsCountRow,
    balanceAndPlanRow,
    recentMessagesRows,
    trendRows,
    devicesList,
  ] = await Promise.all([
    getTenantQuota(tenantId).catch(() => null),

    queryOne<{ ready: number; total: number }>(
      `SELECT
         COALESCE(COUNT(CASE WHEN status = 'ready' THEN 1 END), 0)::int as ready,
         COUNT(*)::int as total
       FROM "Device"
       WHERE "tenantId" = $1`,
      [tenantId]
    ),

    queryOne<{ count: number }>(
      `SELECT COUNT(*)::int as count FROM "MessageLog"
       WHERE "tenantId" = $1 AND "triggeredAt" >= $2`,
      [tenantId, todayStart]
    ),

    queryOne<{ count: number }>(
      `SELECT COUNT(*)::int as count FROM "MessageLog"
       WHERE "tenantId" = $1 AND "triggeredAt" >= $2 AND "triggeredAt" < $3`,
      [tenantId, yesterdayStart, todayStart]
    ),

    queryOne<{ count: number }>(
      `SELECT COUNT(*)::int as count FROM "MessageLog"
       WHERE "tenantId" = $1 AND "triggeredAt" >= $2`,
      [tenantId, startMonth]
    ),

    queryOne<{ count: number }>(
      `SELECT COUNT(*)::int as count FROM "Contact" WHERE "tenantId" = $1`,
      [tenantId]
    ),

    queryOne<{ count: number }>(
      `SELECT COUNT(*)::int as count FROM "BotRule" WHERE "tenantId" = $1 AND "isActive" = true`,
      [tenantId]
    ),

    queryOne<{ count: number }>(
      `SELECT COUNT(*)::int as count FROM "Campaign" WHERE "tenantId" = $1 AND status IN ('running', 'scheduled')`,
      [tenantId]
    ),

    queryOne<{ balance: number; planName: string }>(
      `SELECT
         COALESCE(b.balance, 0)::int as balance,
         COALESCE(p.name, 'Custom') as "planName"
       FROM "Tenant" t
       LEFT JOIN "TenantBalance" b ON b."tenantId" = t.id
       LEFT JOIN "Plan" p ON p.id = t."planId"
       WHERE t.id = $1`,
      [tenantId]
    ),

    query<RecentMessageItem>(
      `SELECT id, direction, "chatId", body, status, "triggeredAt", "deviceLabel"
       FROM "MessageLog"
       WHERE "tenantId" = $1
       ORDER BY "triggeredAt" DESC
       LIMIT 8`,
      [tenantId]
    ),

    query<{ dateStr: string; direction: string; count: number }>(
      `SELECT
         TO_CHAR(("triggeredAt" AT TIME ZONE 'Asia/Jakarta'), 'YYYY-MM-DD') as "dateStr",
         direction,
         COUNT(*)::int as count
       FROM "MessageLog"
       WHERE "tenantId" = $1
         AND "triggeredAt" >= (NOW() AT TIME ZONE 'Asia/Jakarta' - INTERVAL '6 days')::date
       GROUP BY 1, 2
       ORDER BY 1 ASC`,
      [tenantId]
    ),

    query<DeviceHealthItem>(
      `SELECT id, label, phone, status, "updatedAt"
       FROM "Device"
       WHERE "tenantId" = $1
       ORDER BY "updatedAt" DESC
       LIMIT 6`,
      [tenantId]
    ),
  ]);

  // Format 7 days timeline
  const dayMap = new Map<string, { incoming: number; outgoing: number }>();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000);
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    const key = `${get("year")}-${get("month")}-${get("day")}`;
    dayMap.set(key, { incoming: 0, outgoing: 0 });
  }

  if (trendRows) {
    for (const r of trendRows) {
      const entry = dayMap.get(r.dateStr);
      if (entry) {
        if (r.direction === "incoming") entry.incoming += Number(r.count) || 0;
        else entry.outgoing += Number(r.count) || 0;
      }
    }
  }

  const trend7Days: DayTrend[] = Array.from(dayMap.entries()).map(([isoDate, counts]) => {
    const [, m, d] = isoDate.split("-");
    const monthNames = ["", "Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agt", "Sep", "Okt", "Nov", "Des"];
    const monthLabel = monthNames[Number(m)] ?? m;
    return {
      isoDate,
      date: `${Number(d)} ${monthLabel}`,
      incoming: counts.incoming,
      outgoing: counts.outgoing,
      total: counts.incoming + counts.outgoing,
    };
  });

  return {
    metrics: {
      readyDevices: devicesSummary?.ready ?? 0,
      totalDevices: devicesSummary?.total ?? 0,
      todayMessages: todayCountRow?.count ?? 0,
      yesterdayMessages: yesterdayCountRow?.count ?? 0,
      monthMessages: monthCountRow?.count ?? 0,
      maxMessagesPerMonth: quota?.maxMessagesPerMonth ?? null,
      maxDevices: quota?.maxDevices ?? null,
      totalContacts: contactsCountRow?.count ?? 0,
      activeBotRules: botRulesCountRow?.count ?? 0,
      runningCampaigns: campaignsCountRow?.count ?? 0,
      balance: balanceAndPlanRow?.balance ?? 0,
      planName: balanceAndPlanRow?.planName ?? "Gratis",
    },
    trend7Days,
    recentMessages: recentMessagesRows ?? [],
    devices: devicesList ?? [],
  };
}
