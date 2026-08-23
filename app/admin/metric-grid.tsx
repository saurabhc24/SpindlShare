import type { AdminMetrics, SignupTrend } from "@/lib/admin-metrics";

/**
 * The numbers at the head of the admin page.
 *
 * Laid out two-up from the narrowest screen rather than stacking. Ten metrics
 * one-per-row is four screens of scrolling to read ten small integers, and the
 * tiles were mostly padding -- a stat block should be scannable in one look,
 * which means it has to fit in one look.
 *
 * Its own module because it renders from plain numbers and nothing else, so it
 * can be put on screen without an admin session to check the layout against.
 */

export type MetricGridProps = {
  metrics: AdminMetrics;
  profileCount: number;
  playlistCount: number;
  connectionCount: number;
};

export function MetricGrid({
  metrics,
  profileCount,
  playlistCount,
  connectionCount,
}: MetricGridProps) {
  return (
    <>
      {/* Five tiles into two columns leaves the last row half empty, so visits --
          the largest number and the top of the funnel -- takes the full row until
          there is room for all five abreast. */}
      <section className="mt-6 grid grid-cols-2 gap-2 sm:mt-8 sm:gap-3 md:grid-cols-5">
        <Stat
          label="Visits"
          value={metrics.totalVisits}
          className="col-span-2 md:col-span-1"
        />
        <Stat label="Signed up" value={metrics.totalUsers} />
        <Stat label="Active" value={metrics.activeUsers} />
        <Stat
          label="Suspended"
          value={metrics.suspendedUsers}
          tone={metrics.suspendedUsers > 0 ? "warn" : undefined}
        />
        <Stat label="Deleted" value={metrics.deletedUsers} />
      </section>

      <GroupLabel>Signups</GroupLabel>
      <section className="mt-2 grid grid-cols-2 gap-2 sm:gap-3">
        <TrendStat label="This week" trend={metrics.week} />
        <TrendStat label="This month" trend={metrics.month} />
      </section>

      {/* Inventory rather than health: worth having, but not what the page is
          opened to find out, so it is smaller and greyer. */}
      <GroupLabel>Content</GroupLabel>
      <section className="mt-2 grid grid-cols-3 gap-2 sm:gap-3">
        <Stat label="Profiles" value={profileCount} muted />
        <Stat label="Playlists" value={playlistCount} muted />
        <Stat label="Connections" value={connectionCount} muted />
      </section>
    </>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
      {children}
    </h2>
  );
}

function Stat({
  label,
  value,
  tone,
  muted,
  className = "",
}: {
  label: string;
  value: number;
  tone?: "warn";
  muted?: boolean;
  className?: string;
}) {
  return (
    <div className={`panel px-3 py-2.5 sm:px-4 sm:py-3 ${className}`}>
      {/* Truncating rather than wrapping: "Connections" in a third of a 360px
          screen is the tightest label here, and a two-line label would push the
          number out of alignment with its neighbours. */}
      <p className="truncate text-[11px] text-ink-dim sm:text-xs">{label}</p>
      <p
        className={`mt-0.5 font-semibold tabular-nums ${
          muted ? "text-base text-ink-dim" : "text-lg text-ink sm:text-xl"
        } ${tone === "warn" ? "text-[var(--warn)]" : ""}`}
      >
        {value.toLocaleString()}
      </p>
    </div>
  );
}

/**
 * A period's signups against the one before it. The comparison is the point --
 * a bare "11 this week" says nothing without last week beside it.
 */
function TrendStat({ label, trend }: { label: string; trend: SignupTrend }) {
  const { current, previous, changePercent } = trend;
  const colour =
    changePercent === null || changePercent === 0
      ? "var(--ink-faint)"
      : changePercent > 0
        ? "var(--ok)"
        : "var(--danger)";

  return (
    <div className="panel px-3 py-2.5 sm:px-4 sm:py-3">
      <p className="truncate text-[11px] text-ink-dim sm:text-xs">{label}</p>
      <div className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5">
        <p className="text-lg font-semibold tabular-nums sm:text-xl">
          {current.toLocaleString()}
        </p>
        {/* Withheld when the previous period was zero: every percentage from
            nothing is a lie. The line below still gives the honest comparison. */}
        {changePercent !== null && (
          <span
            className="text-[11px] font-semibold tabular-nums"
            style={{ color: colour }}
          >
            {changePercent > 0 ? "+" : ""}
            {changePercent}%
          </span>
        )}
      </div>
      <p className="mt-0.5 truncate text-[11px] text-ink-faint tabular-nums">
        vs {previous.toLocaleString()} before
      </p>
    </div>
  );
}
