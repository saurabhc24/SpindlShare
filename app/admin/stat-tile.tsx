import type { SignupTrend } from "@/lib/admin-metrics";

/**
 * One number from the admin header, with its 30-day change where that means
 * something. Renders from plain values, so it can be put on screen without an
 * admin session to check the layout against.
 */

/**
 * Only visits and signups carry a trend. "Active up 15%" would need a snapshot
 * of who was active 30 days ago, which is not stored -- so those tiles show the
 * count alone rather than an invented arrow.
 */
export function StatTile({
  label,
  value,
  trend,
}: {
  label: string;
  value: number;
  trend?: SignupTrend;
}) {
  return (
    <div className="flex flex-col justify-center gap-5 rounded-[8px] border border-[#333] bg-[rgba(115,115,115,0.21)] p-5">
      <p className="text-sm font-medium text-[#c8c8c8]">{label}</p>
      <div className="flex items-end gap-4">
        <p className="text-[36px] leading-none font-bold text-white">
          {compact(value)}
        </p>
        {trend?.changePercent != null && trend.changePercent !== 0 && (
          <TrendArrow percent={trend.changePercent} />
        )}
      </div>
    </div>
  );
}

function TrendArrow({ percent }: { percent: number }) {
  const rising = percent > 0;
  return (
    <span
      className="flex items-end gap-0.5"
      style={{ color: rising ? "var(--ok)" : "var(--danger)" }}
    >
      <svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden="true" className="mb-[3px]">
        <path
          d={rising ? "M4.5 8V1M4.5 1L1 4.5M4.5 1L8 4.5" : "M4.5 1V8M4.5 8L1 4.5M4.5 8L8 4.5"}
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="text-base leading-none font-medium">
        {Math.abs(percent)}%
      </span>
      <span className="sr-only">
        {rising ? "up" : "down"} from the previous 30 days
      </span>
    </span>
  );
}

/** 2000 reads as "2K" in the design. Below 1000 the exact number is more useful. */
function compact(value: number): string {
  if (value < 1000) return String(value);
  const thousands = value / 1000;
  return `${thousands >= 10 ? Math.round(thousands) : thousands.toFixed(1).replace(/\.0$/, "")}K`;
}
