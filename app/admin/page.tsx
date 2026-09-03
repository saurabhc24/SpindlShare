import Link from "next/link";

import { requireAdmin } from "@/lib/admin";
import { getAdminMetrics } from "@/lib/admin-metrics";
import { prisma } from "@/lib/prisma";

import { ProfileRow, type AdminProfile } from "./profile-row";
import { StatTile } from "./stat-tile";

// Always live: an admin acting on stale moderation data is worse than a slow page.
export const dynamic = "force-dynamic";

/**
 * Deliberately small. Nobody moderates by scrolling -- they arrive knowing which
 * account they want and search for it -- so a long first page costs render time
 * and a wall of rows to find nothing faster. Each page is a bounded skip/take, so
 * this is the number of rows fetched, not just the number shown.
 */
const PAGE_SIZE = 10;

export default async function AdminPage(props: PageProps<"/admin">) {
  const adminUser = await requireAdmin();

  const searchParams = await props.searchParams;
  const rawQuery = searchParams.q;
  const query = (Array.isArray(rawQuery) ? rawQuery[0] : rawQuery)?.trim() ?? "";
  const rawPage = searchParams.page;
  const page = Math.max(
    1,
    Number(Array.isArray(rawPage) ? rawPage[0] : rawPage) || 1
  );

  const where = query
    ? {
        OR: [
          { usernameNormalized: { contains: query.toLowerCase() } },
          { displayName: { contains: query, mode: "insensitive" as const } },
          { user: { email: { contains: query, mode: "insensitive" as const } } },
        ],
      }
    : {};

  const [admin, metrics, matching, profiles] = await Promise.all([
    // The header shows whoever is moderating, the same as every other signed-in
    // page. An admin without a claimed username still gets a usable header.
    prisma.profile.findUnique({
      where: { userId: adminUser.id },
      select: { username: true, usernameNormalized: true, avatarUrl: true },
    }),
    getAdminMetrics(),
    prisma.profile.count({ where }),
    prisma.profile.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        userId: true,
        username: true,
        usernameNormalized: true,
        displayName: true,
        isPublic: true,
        suspendedAt: true,
        suspendedReason: true,
        createdAt: true,
        user: {
          select: { email: true, deletedEmail: true, deletedAt: true },
        },
      },
    }),
  ]);

  // Playlists and connections hang off User rather than Profile, so their counts
  // need a separate pass. Scoped to the userIds on this page so the query stays
  // bounded no matter how large the tables get.
  const pageUserIds = profiles.map((profile) => profile.userId);
  const [playlistCounts, connectionCounts] = await Promise.all([
    prisma.playlist.groupBy({
      by: ["userId"],
      where: { userId: { in: pageUserIds } },
      _count: { _all: true },
    }),
    prisma.connectedAccount.groupBy({
      by: ["userId"],
      where: { userId: { in: pageUserIds } },
      _count: { _all: true },
    }),
  ]);

  const playlistByUser = new Map(
    playlistCounts.map((row) => [row.userId, row._count._all])
  );
  const connectionByUser = new Map(
    connectionCounts.map((row) => [row.userId, row._count._all])
  );

  const rows: AdminProfile[] = profiles.map((profile) => ({
    id: profile.id,
    username: profile.username,
    usernameNormalized: profile.usernameNormalized,
    displayName: profile.displayName,
    // A deleted account has no `email` -- it was moved aside to free the unique
    // index. Falling back keeps the admin list able to say who this was.
    email: profile.user.email ?? profile.user.deletedEmail,
    isPublic: profile.isPublic,
    deletedAt: profile.user.deletedAt?.toISOString() ?? null,
    suspendedAt: profile.suspendedAt?.toISOString() ?? null,
    suspendedReason: profile.suspendedReason,
    playlistCount: playlistByUser.get(profile.userId) ?? 0,
    connectionCount: connectionByUser.get(profile.userId) ?? 0,
    createdAt: profile.createdAt.toISOString(),
  }));

  const totalPages = Math.max(1, Math.ceil(matching / PAGE_SIZE));

  return (
    <div className="flex flex-1 flex-col bg-[#150e07]">
      <div className="mx-auto flex w-full max-w-[430px] flex-1 flex-col gap-9 px-6 pt-8 pb-6">
        <header className="flex w-full items-center justify-between gap-4">
          <Link
            href={admin ? `/${admin.usernameNormalized}` : "/dashboard"}
            className="group flex min-w-0 items-center gap-2"
          >
            <span className="relative block size-8 shrink-0 overflow-hidden rounded-full bg-[var(--panel-solid)]">
              {admin?.avatarUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={admin.avatarUrl}
                  alt=""
                  width={32}
                  height={32}
                  className="size-full object-cover"
                />
              ) : (
                <span className="flex size-full items-center justify-center text-xs font-medium text-accent">
                  {(admin?.username ?? "A").charAt(0).toUpperCase()}
                </span>
              )}
            </span>
            <span className="truncate text-sm font-medium text-white transition-colors group-hover:text-accent">
              {admin?.username ?? "Admin"}
            </span>
          </Link>

          <Link
            href="/dashboard"
            aria-label="Back to your playlists"
            className="block size-[26px] shrink-0 transition-opacity hover:opacity-80"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/home_icon.svg" alt="" width={26} height={26} />
          </Link>
        </header>

        <main className="flex w-full flex-col gap-6">
          <div className="flex w-full flex-col gap-3">
            <h1 className="heading text-[20px] text-white">Admin</h1>
            <p className="text-sm text-[#c8c8c8]">Moderation and site overview</p>
          </div>

          {/* Five tiles into two columns leaves the last row half empty, which
              the design accepts -- visits and signups lead, the rest follow. */}
          <section className="grid grid-cols-2 gap-3">
            <StatTile
              label="Site visits"
              value={metrics.totalVisits}
              trend={metrics.visitTrend}
            />
            <StatTile
              label="Signed Up"
              value={metrics.totalUsers}
              trend={metrics.signupTrend}
            />
            <StatTile label="Active" value={metrics.activeUsers} />
            <StatTile label="Suspended" value={metrics.suspendedUsers} />
            <StatTile label="Deleted" value={metrics.deletedUsers} />
          </section>

          <section className="flex w-full flex-col gap-4">
            <div className="flex w-full flex-col gap-2">
              <p className="text-xs text-[#c8c8c8]">
                Search for user to suspend or delete their account
              </p>
              {/* A GET form, so a search is a URL: shareable, and the browser's
                  back button steps out of it. */}
              <form className="flex w-full items-start gap-2">
                <input
                  name="q"
                  defaultValue={query}
                  aria-label="Search using username, name or email"
                  placeholder="Search using username, name or email"
                  className="min-w-0 flex-1 rounded-[8px] border border-[#333] bg-transparent p-3 text-xs font-medium text-white outline-none transition-colors placeholder:text-[#68625a] focus:border-[var(--accent)]"
                />
                <button
                  type="submit"
                  className="shrink-0 cursor-pointer rounded-[8px] bg-surface-raised px-4 py-3 text-sm font-bold text-[#c8c8c8] transition-colors hover:text-white"
                >
                  Search
                </button>
              </form>
            </div>

            {/* The range, not just the total: with ten to a page the useful
                question is which ten these are. */}
            <p className="text-xs text-[#c8c8c8]">
              {matching === 0
                ? "No profiles"
                : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, matching)} of ${matching}`}
              {query ? ` matching "${query}"` : ""}
            </p>

            <ul className="flex w-full flex-col gap-4">
              {rows.map((profile) => (
                <ProfileRow key={profile.id} profile={profile} />
              ))}
              {rows.length === 0 && (
                <li className="rounded-[8px] border border-dashed border-[#333] px-6 py-10 text-center text-sm text-[#c8c8c8]">
                  No profiles found.
                </li>
              )}
            </ul>

            {totalPages > 1 && (
              <nav className="flex items-center justify-between text-sm">
                <PageLink page={page - 1} query={query} disabled={page <= 1}>
                  &larr; Previous
                </PageLink>
                <span className="text-xs text-[#c8c8c8]">
                  Page {page} of {totalPages}
                </span>
                <PageLink
                  page={page + 1}
                  query={query}
                  disabled={page >= totalPages}
                >
                  Next &rarr;
                </PageLink>
              </nav>
            )}
          </section>
        </main>

        <footer className="flex w-full items-center justify-center">
          <span className="wordmark text-white">SpindlShare</span>
        </footer>
      </div>
    </div>
  );
}

function PageLink({
  page,
  query,
  disabled,
  children,
}: {
  page: number;
  query: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return <span className="text-xs text-[#c8c8c8] opacity-50">{children}</span>;
  }
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  params.set("page", String(page));
  return (
    <Link
      href={`/admin?${params}`}
      className="text-xs text-[#c8c8c8] transition-colors hover:text-white"
    >
      {children}
    </Link>
  );
}
