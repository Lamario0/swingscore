import React, { useState, useMemo } from "react";
import { Trophy, RefreshCw, ChevronDown, ChevronUp, BarChart3, ListOrdered, CheckCircle2, Filter, ArrowDownAZ, ArrowDownWideNarrow, EyeOff } from "lucide-react";
import { AppSettings, Competitor, Heat, ScoreRecord, CompletedContestResult } from "../types";
import { calculateHeatResults } from "../utils/calculations";

interface ScoringDashboardProps {
  settings: AppSettings;
  competitors: Competitor[];
  heats: Heat[];
  scores: ScoreRecord[];
  isDarkMode: boolean;
  onRefresh?: () => void;
  onUpdateSettings: (newSettings: Partial<AppSettings>) => Promise<void>;
}

type SortMode = "bib" | "score";

interface MatrixRow {
  bib: string;
  name: string;
  rank: number;
  cells: Record<string, string>;
  relativeResult: string;
  isAllNo: boolean;
}

interface Matrix {
  judgeNames: string[];
  rows: MatrixRow[];
  resultColumnLabel: string;
}

function buildMatrix(
  contest: CompletedContestResult,
  heats: Heat[],
  competitors: Competitor[],
  scores: ScoreRecord[],
  sortMode: SortMode,
  hideAllNo: boolean
): Matrix | null {
  const heat = heats.find((h) => h.id === contest.heatId);
  if (!heat) return null;

  // Every judge who actually submitted anything for this heat -- not the
  // currently-configured judge roster, which may have changed since this
  // contest ran.
  const heatScores = scores.filter((s) => s.heatId === heat.id);
  const judgeNames = Array.from(new Set(heatScores.map((s) => s.judgeId))).sort();

  const recordLookup = new Map<string, ScoreRecord>();
  heatScores.forEach((s) => recordLookup.set(`${s.judgeId}::${s.competitorBib}`, s));

  // Reuse the same results engine everything else in the app uses, so the
  // per-judge placements/tallies/averages shown here always match what was
  // actually decided. callbackCount/alternateCount are irrelevant to the
  // values this matrix displays (they only affect qualified/isAlternate
  // flags, which aren't used here), so 0 is passed for both.
  let results = calculateHeatResults(heat, competitors, scores, contest.judgingStyle, 0, 0);

  if (contest.judgingStyle === "callback" && hideAllNo) {
    results = results.filter((r) => r.yesCount > 0 || (r.altCount || 0) > 0);
  }

  const sorted = [...results].sort((a, b) => {
    if (sortMode === "bib") {
      return a.competitor.bib.localeCompare(b.competitor.bib, undefined, { numeric: true });
    }
    return a.rank - b.rank;
  });

  const rows: MatrixRow[] = sorted.map((r) => {
    const cells: Record<string, string> = {};
    judgeNames.forEach((j) => {
      const rec = recordLookup.get(`${j}::${r.competitor.bib}`);
      if (!rec) {
        cells[j] = "—";
      } else if (contest.judgingStyle === "callback") {
        cells[j] = rec.isCallback;
      } else {
        cells[j] = rec.score > 0 ? String(rec.score) : "—";
      }
    });

    let relativeResult = "—";
    if (contest.judgingStyle === "placement") {
      const placements = Object.values(r.scoresByJudge)
        .map((v) => v.placement)
        .filter((p) => p < 999)
        .sort((a, b) => a - b);
      relativeResult = placements.length > 0 ? placements.join("-") : "—";
    } else if (contest.judgingStyle === "callback") {
      let s = `Y(${r.yesCount})N(${r.noCount})`;
      if ((r.alt1Count || 0) > 0) s += `A1(${r.alt1Count})`;
      if ((r.alt2Count || 0) > 0) s += `A2(${r.alt2Count})`;
      if ((r.alt3Count || 0) > 0) s += `A3(${r.alt3Count})`;
      relativeResult = s;
    } else {
      relativeResult = r.averageScore > 0 ? r.averageScore.toFixed(1) : "—";
    }

    return {
      bib: r.competitor.bib,
      name: r.competitor.name,
      rank: r.rank,
      cells,
      relativeResult,
      isAllNo: contest.judgingStyle === "callback" && r.yesCount === 0 && (r.altCount || 0) === 0
    };
  });

  const resultColumnLabel =
    contest.judgingStyle === "placement" ? "Placements" : contest.judgingStyle === "callback" ? "Callback Tally" : "Raw Avg";

  return { judgeNames, rows, resultColumnLabel };
}

export default function ScoringDashboard({ settings, competitors, heats, scores, isDarkMode, onRefresh, onUpdateSettings }: ScoringDashboardProps) {
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [divisionFilter, setDivisionFilter] = useState<string>("All");
  const [sortMode, setSortMode] = useState<SortMode>("score");
  const [hideAllNo, setHideAllNo] = useState(false);
  const [publishBusyId, setPublishBusyId] = useState<string | null>(null);

  const completed = settings.completedResults || [];

  const divisions = useMemo(() => {
    const set = new Set<string>();
    completed.forEach((c) => set.add(c.division));
    return ["All", ...Array.from(set).sort()];
  }, [completed]);

  const visible = useMemo(() => {
    return divisionFilter === "All"
      ? completed
      : completed.filter((c) => c.division === divisionFilter);
  }, [completed, divisionFilter]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const styleLabel = (style: string) => {
    if (style === "raw") return "Raw Scoring (0-100)";
    if (style === "callback") return "Call-Back / Alternate";
    return "Relative Placement";
  };

  const styleIcon = (style: string) => {
    if (style === "raw") return <BarChart3 className="w-3 h-3" />;
    if (style === "callback") return <CheckCircle2 className="w-3 h-3" />;
    return <ListOrdered className="w-3 h-3" />;
  };

  const togglePublish = async (heatId: string) => {
    setPublishBusyId(heatId);
    try {
      const current = settings.publishedHeatIds || [];
      const isPub = current.includes(heatId);
      const updated = isPub ? current.filter((id) => id !== heatId) : [...current, heatId];
      await onUpdateSettings({ publishedHeatIds: updated });
    } finally {
      setPublishBusyId(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-500">
            <Trophy className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
              Virtual Domain: scoring.swingscore.com
            </span>
            <h1 className="text-2xl font-extrabold tracking-tight mt-1.5 text-slate-900 dark:text-slate-100">
              Scoring &amp; Results Ledger
            </h1>
            <p className="text-xs text-slate-400 mt-1 max-w-lg leading-relaxed">
              A static archive of scored contests only — a contest lands here once every judge has submitted
              and finalized their sheet, and it never changes again on its own. Cleared on the next full
              database reset.
            </p>
          </div>
        </div>

        {onRefresh && (
          <button
            onClick={onRefresh}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
              isDarkMode
                ? "bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
                : "bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 shadow-sm"
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        )}
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className={`p-4 rounded-xl border ${isDarkMode ? "bg-slate-900/60 border-slate-800" : "bg-white border-slate-200 shadow-sm"}`}>
          <p className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Contests Recorded</p>
          <p className="text-xl font-extrabold mt-1 text-slate-900 dark:text-slate-100">{completed.length}</p>
        </div>
        <div className={`p-4 rounded-xl border ${isDarkMode ? "bg-slate-900/60 border-slate-800" : "bg-white border-slate-200 shadow-sm"}`}>
          <p className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Divisions Represented</p>
          <p className="text-xl font-extrabold mt-1 text-slate-900 dark:text-slate-100">{Math.max(divisions.length - 1, 0)}</p>
        </div>
        <div className={`p-4 rounded-xl border ${isDarkMode ? "bg-slate-900/60 border-slate-800" : "bg-white border-slate-200 shadow-sm"}`}>
          <p className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Finals Recorded</p>
          <p className="text-xl font-extrabold mt-1 text-slate-900 dark:text-slate-100">
            {completed.filter((c) => c.heatType === "Finals").length}
          </p>
        </div>
        <div className={`p-4 rounded-xl border ${isDarkMode ? "bg-slate-900/60 border-slate-800" : "bg-white border-slate-200 shadow-sm"}`}>
          <p className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Competitors Scored</p>
          <p className="text-xl font-extrabold mt-1 text-slate-900 dark:text-slate-100">
            {completed.reduce((sum, c) => sum + c.rankings.length, 0)}
          </p>
        </div>
      </div>

      {/* Division filter */}
      {divisions.length > 1 && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-slate-400">
            <Filter className="w-3 h-3" /> Division
          </span>
          {divisions.map((d) => (
            <button
              key={d}
              onClick={() => setDivisionFilter(d)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all ${
                divisionFilter === d
                  ? "bg-indigo-600 border-indigo-600 text-white"
                  : isDarkMode
                    ? "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"
                    : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      )}

      {/* Sheet display controls (apply to every expanded scoring sheet below) */}
      <div className="flex items-center gap-4 mb-5 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-slate-400">
            Sort
          </span>
          <button
            id="scoring-sort-score-btn"
            onClick={() => setSortMode("score")}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all ${
              sortMode === "score"
                ? "bg-indigo-600 border-indigo-600 text-white"
                : isDarkMode
                  ? "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"
                  : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
            }`}
          >
            <ArrowDownWideNarrow className="w-3 h-3" /> Score (High to Low)
          </button>
          <button
            id="scoring-sort-bib-btn"
            onClick={() => setSortMode("bib")}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all ${
              sortMode === "bib"
                ? "bg-indigo-600 border-indigo-600 text-white"
                : isDarkMode
                  ? "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"
                  : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
            }`}
          >
            <ArrowDownAZ className="w-3 h-3" /> Bib Number
          </button>
        </div>

        <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 cursor-pointer select-none">
          <input
            id="scoring-hide-all-no-toggle"
            type="checkbox"
            checked={hideAllNo}
            onChange={(e) => setHideAllNo(e.target.checked)}
            className="cursor-pointer"
          />
          <EyeOff className="w-3 h-3" />
          Hide All-No Competitors
        </label>
      </div>

      {/* Results ledger */}
      {visible.length === 0 ? (
        <div className={`py-16 text-center rounded-2xl border ${isDarkMode ? "bg-slate-900/40 border-slate-800 text-slate-500" : "bg-white border-slate-200 text-slate-400"} text-xs font-mono italic`}>
          No contests have been sent to Scoring yet. A contest lands here once the admin runs Complete Contest — which only becomes available after every assigned judge has submitted and finalized their sheet.
        </div>
      ) : (
        <div className="space-y-4">
          {visible.slice().reverse().map((contest) => {
            const isExpanded = !!expandedIds[contest.id];
            const matrix = isExpanded ? buildMatrix(contest, heats, competitors, scores, sortMode, hideAllNo) : null;
            const isPublished = (settings.publishedHeatIds || []).includes(contest.heatId);
            return (
              <div
                key={contest.id}
                className={`border rounded-2xl overflow-hidden transition-all ${
                  isDarkMode ? "border-slate-800 bg-slate-900/40" : "border-slate-200 bg-white shadow-sm"
                }`}
              >
                <div
                  onClick={() => toggleExpand(contest.id)}
                  className="p-4 flex items-center justify-between cursor-pointer select-none gap-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 min-w-0">
                    <span className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate">
                      {contest.name}
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[9px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 font-semibold uppercase tracking-wider font-mono">
                        {contest.division}
                      </span>
                      <span className="text-[9px] px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 font-semibold uppercase tracking-wider font-mono">
                        {contest.heatType}
                      </span>
                      <span className="text-[9px] px-2 py-0.5 rounded-full bg-slate-500/10 text-slate-400 font-semibold font-mono flex items-center gap-1">
                        {styleIcon(contest.judgingStyle)} {styleLabel(contest.judgingStyle)}
                      </span>
                      <span className="text-[9px] px-2 py-0.5 rounded-full bg-slate-500/10 text-slate-400 font-semibold font-mono">
                        {contest.timestamp}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      type="button"
                      id={`scoring-publish-toggle-${contest.id}`}
                      disabled={publishBusyId === contest.heatId}
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePublish(contest.heatId);
                      }}
                      title={isPublished ? "Visible on the public Results Terminal — click to hide" : "Hidden from the public Results Terminal — click to publish"}
                      className={`px-2 py-1 text-[10px] font-bold rounded-lg border cursor-pointer transition-colors ${
                        isPublished
                          ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-500 hover:bg-emerald-500/20"
                          : isDarkMode
                            ? "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-750"
                            : "bg-slate-100 border-slate-200 text-slate-500 hover:bg-slate-200"
                      }`}
                    >
                      {isPublished ? "Published" : "Hidden"}
                    </button>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-slate-100 dark:border-slate-800/80 pt-3">
                    {!matrix ? (
                      <p className="text-xs text-slate-400 italic py-4 text-center">
                        The original heat record for this contest is no longer available (it may have been deleted), so the judge-by-judge scoring sheet can't be rebuilt.
                      </p>
                    ) : matrix.rows.length === 0 ? (
                      <p className="text-xs text-slate-400 italic py-4 text-center">
                        Every competitor in this contest received all "No" callbacks, and they're currently hidden. Turn off "Hide All-No Competitors" above to see the full sheet.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className={`text-[10px] font-mono text-slate-400 border-b ${isDarkMode ? "bg-slate-900/60 border-slate-800" : "bg-slate-50 border-slate-150"}`}>
                              <th className="p-2 w-16 text-center font-bold">Bib</th>
                              <th className="p-2 font-bold">Competitor / Couple</th>
                              {matrix.judgeNames.map((j) => (
                                <th key={j} className="p-2 text-center font-bold whitespace-nowrap">{j}</th>
                              ))}
                              <th className="p-2 text-right font-bold whitespace-nowrap">{matrix.resultColumnLabel}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {matrix.rows.map((row) => {
                              const isPodium = contest.heatType === "Finals" && row.rank <= 3;
                              return (
                                <tr
                                  key={row.bib}
                                  className={`border-b last:border-0 ${isDarkMode ? "border-slate-800/50" : "border-slate-100"} ${isPodium ? "bg-amber-500/[0.03]" : row.isAllNo ? "opacity-50" : ""}`}
                                >
                                  <td className="p-2 text-center font-mono font-bold text-slate-400">
                                    {row.bib}
                                  </td>
                                  <td className="p-2 font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                                    {isPodium && (row.rank === 1 ? "🥇 " : row.rank === 2 ? "🥈 " : "🥉 ")}
                                    {row.name}
                                  </td>
                                  {matrix.judgeNames.map((j) => (
                                    <td key={j} className="p-2 text-center font-mono text-slate-600 dark:text-slate-300">
                                      {row.cells[j]}
                                    </td>
                                  ))}
                                  <td className="p-2 text-right font-mono font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                                    {row.relativeResult}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className={`mt-8 p-4 rounded-xl border text-center ${isDarkMode ? "bg-slate-900/30 border-slate-800/60 text-slate-400" : "bg-white border-slate-200 text-slate-500"} text-[11px] leading-relaxed max-w-2xl mx-auto`}>
        💡 Scoring is the internal system of record. Use the Published/Hidden toggle above to control what appears on
        the separate public Results Terminal — this ledger itself is where finalized judge decisions are archived,
        contest by contest, and never updates on its own.
      </div>
    </div>
  );
}
