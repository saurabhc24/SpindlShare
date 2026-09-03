import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * A count for a period next to the one before it, which is the only way a
 * signup number means anything -- eleven this week is good or bad entirely
 * depending on last week.
 */
export type SignupTrend = {
  current: number;
  previous: number;
  /**
   * Null when the previous period was zero. A percentage change from nothing is
   * either undefined or infinite depending on how you squint, and rendering it
   * as "+100%" or "+∞%" would both be lies -- the UI shows the pair of raw
   * counts instead.
   */
  changePercent: number | null;
};

export type AdminMetrics = {
  /**
   * Every visit since the beacon shipped, not every page view: the beacon fires
   * once per browser session, so opening five pages is one visit.
   */
  totalVisits: number;
  /**
   * Everyone who has ever signed up, whether or not they claimed a username,
   * and including accounts since deleted -- they still signed up.
   */
  totalUsers: number;
  /** Signed up, not suspended, not deleted. */
  activeUsers: number;
  suspendedUsers: number;
  deletedUsers: number;
  /** Visits over 30 days against the 30 before, for the stat tile's arrow. */
  visitTrend: SignupTrend;
  /** Signups over the same pair of windows, so the two tiles are comparable. */
  signupTrend: SignupTrend;
  week: SignupTrend;
  month: SignupTrend;
};

type VisitBuckets = { current: number; previous: number };

type Buckets = {
  weekCurrent: number;
  weekPrevious: number;
  monthCurrent: number;
  monthPrevious: number;
};

function trend(current: number, previous: number): SignupTrend {
  return {
    current,
    previous,
    changePercent:
      previous === 0 ? null : Math.round(((current - previous) / previous) * 100),
  };
}

export async function getAdminMetrics(): Promise<AdminMetrics> {
  const [
    totalVisits,
    visitBuckets,
    totalUsers,
    activeUsers,
    suspendedUsers,
    deletedUsers,
    buckets,
  ] = await Promise.all([
    prisma
      .$queryRaw<{ n: number }[]>`
        SELECT coalesce(sum("views"), 0)::int AS n FROM "DailyVisit"
      `
      .then((rows) => rows[0]?.n ?? 0),
    // Same two windows as signups, so the two tiles' arrows mean the same thing.
    prisma.$queryRaw<VisitBuckets[]>`
      SELECT
        coalesce(sum("views") FILTER (
          WHERE "day" >= (now() - interval '30 days')::date
        ), 0)::int AS "current",
        coalesce(sum("views") FILTER (
          WHERE "day" >= (now() - interval '60 days')::date
            AND "day" <  (now() - interval '30 days')::date
        ), 0)::int AS "previous"
      FROM "DailyVisit"
    `,
    prisma.user.count(),
    // Counted directly rather than as total minus suspended minus deleted: an
    // account can be both suspended and deleted, and that arithmetic would
    // subtract it twice and quietly under-report active users.
    prisma.user.count({
      where: {
        deletedAt: null,
        // Someone still mid-signup has no Profile and so cannot be suspended.
        // They are active; a filter on profile.suspendedAt alone would drop them.
        OR: [{ profile: { is: null } }, { profile: { suspendedAt: null } }],
      },
    }),
    prisma.profile.count({
      where: { suspendedAt: { not: null }, user: { deletedAt: null } },
    }),
    prisma.user.count({ where: { deletedAt: { not: null } } }),
    // All four windows in one pass, off the database's clock rather than
    // Date.now(): reading the clock during render is impure, and four separate
    // queries could each land on a different second and fail to add up. The
    // ::int casts matter -- count() is bigint, which arrives as a BigInt that
    // JSON and React both refuse to render.
    prisma.$queryRaw<Buckets[]>`
      SELECT
        count(*) FILTER (
          WHERE "createdAt" >= now() - interval '7 days'
        )::int AS "weekCurrent",
        count(*) FILTER (
          WHERE "createdAt" >= now() - interval '14 days'
            AND "createdAt" <  now() - interval '7 days'
        )::int AS "weekPrevious",
        count(*) FILTER (
          WHERE "createdAt" >= now() - interval '30 days'
        )::int AS "monthCurrent",
        count(*) FILTER (
          WHERE "createdAt" >= now() - interval '60 days'
            AND "createdAt" <  now() - interval '30 days'
        )::int AS "monthPrevious"
      FROM "User"
    `,
  ]);

  const row = buckets[0];
  const visits = visitBuckets[0];

  return {
    totalVisits,
    totalUsers,
    activeUsers,
    suspendedUsers,
    deletedUsers,
    visitTrend: trend(visits?.current ?? 0, visits?.previous ?? 0),
    signupTrend: trend(row?.monthCurrent ?? 0, row?.monthPrevious ?? 0),
    week: trend(row?.weekCurrent ?? 0, row?.weekPrevious ?? 0),
    month: trend(row?.monthCurrent ?? 0, row?.monthPrevious ?? 0),
  };
}
