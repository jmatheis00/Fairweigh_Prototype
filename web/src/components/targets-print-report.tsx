import type { TargetOverview, TargetRow, TargetStatus } from "@scc/shared";
import { formatDateTime, formatNumber } from "@/lib/labels";

/**
 * "Export report" on the CO₂ targets page (16 Nov 2026): a print-only report with plain tables. The screen layout is
 * hidden when printing, because the browser lays the page out at paper width and the app would switch to its phone
 * cards. Status is always a word with a symbol, never colour alone.
 */

const STATUS_LABEL: Record<TargetStatus, string> = { achieved: "✓ Achieved", "on track": "◷ On track", "at risk": "⚠ At risk" };
const t = (n: number) => `${formatNumber(n, 1)} t`;

interface Props {
  overview: TargetOverview;
  /** False when the company hides achievement per buyer; buyer targets are still listed. */
  showBuyers: boolean;
  source: string;
}

function ReportTable({ rows, first, second, showAchievement }: { rows: TargetRow[]; first: string; second: string; showAchievement: boolean }) {
  return (
    <table className="report-table">
      {/* Same column widths in both tables, so the report reads as one grid. */}
      <colgroup>
        <col style={{ width: showAchievement ? "27%" : "25%" }} />
        <col style={{ width: showAchievement ? "26%" : "60%" }} />
        <col style={{ width: showAchievement ? "8%" : "15%" }} />
        {showAchievement && (
          <>
            <col style={{ width: "9%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "11%" }} />
          </>
        )}
      </colgroup>
      <thead>
        <tr>
          <th>{first}</th>
          <th>{second}</th>
          <th className="num">Target</th>
          {showAchievement && (
            <>
              <th className="num">Achieved</th>
              <th className="num">Remaining</th>
              <th className="num">Progress</th>
              <th className="nowrap">Status</th>
            </>
          )}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            <td className="strong">{r.key}</td>
            <td className="muted">{r.related.join(", ") || "none"}</td>
            <td className="num">{formatNumber(r.targetTonnes, 0)} t</td>
            {showAchievement && (
              <>
                <td className="num">{t(r.achievedTonnes)}</td>
                <td className="num">{t(r.remainingTonnes)}</td>
                <td className="num">{r.percent} %</td>
                <td className="nowrap">{STATUS_LABEL[r.status]}</td>
              </>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function TargetsPrintReport({ overview, showBuyers, source }: Props) {
  const c = overview.company;
  const elapsed = Math.round(overview.yearElapsed * 100);
  return (
    <div className="print-only print-report">
      <div className="report-brand">Fairweigh · CO₂ targets report</div>
      <h1>CO₂ targets {overview.year}</h1>
      <div className="muted">
        As of {formatDateTime(new Date().toISOString())} · {source}
      </div>

      <section className="report-company">
        <div className="report-company-figure">
          <strong>{t(c.achievedTonnes)}</strong> of {formatNumber(c.targetTonnes, 0)} t CO₂e avoided ({c.percent} %)
        </div>
        <div>
          {t(c.remainingTonnes)} remaining · {STATUS_LABEL[c.status]}
        </div>
        <div className="muted small">
          {elapsed} % of {overview.year} has passed. “On track” means at least {elapsed} % of the target is achieved.
        </div>
      </section>

      <h2>By buyer</h2>
      <ReportTable rows={overview.byBuyer} first="Buyer" second="Commodity groups" showAchievement={showBuyers} />
      {!showBuyers && <div className="muted small">Achievement per buyer is not shown (company setting); only the targets are listed.</div>}

      <h2>By commodity group</h2>
      <ReportTable rows={overview.byGroup} first="Commodity group" second="Buyer" showAchievement />

      <div className="muted small report-note">
        Avoided CO₂ = CO₂ of the replaced supplier minus CO₂ of the chosen one, times the quantity: from orders after Fairweigh decisions this
        year, plus decisions not ordered yet. Achievement per buyer counts the commodity groups the buyer is responsible for.
      </div>
      <div className="report-footer">Prototype with sample data</div>
    </div>
  );
}
