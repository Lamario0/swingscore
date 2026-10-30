import React, { useState, useMemo } from "react";
import { Trophy, RefreshCw, ChevronDown, ChevronUp, BarChart3, ListOrdered, CheckCircle2, Filter, ArrowDownAZ, ArrowDownWideNarrow, EyeOff } from "lucide-react";
import { AppSettings, Competitor, ContestOptions, Heat, ScoreRecord, CompletedContestResult } from "../types";
import { getContestOptions, getContestOutcome, getCutGroup, isResultNameHidden } from "../utils/calculations";
import { getDisplayBib, isCouplesHeat } from "../utils/partners";

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
type SideFilter = "all" | "leaders" | "followers";

interface MatrixRow {
  bib: string;
  name: string;
  rank: number;
  cells: Record<string, string>;
  relativeResult: string;
  isAllNo: boolean;
  role: "Lead" | "Follow";
  outcome: "Callback" | "Tied" | "Alternate" | "Cut" | null;
  alternateRank?: number;
  isTieSettledByChief: boolean;
}

interface Matrix {
  judgeNames: string[];
  rows: MatrixRow[];
  resultColumnLabel: string;
  hasDistinctRoles: boolean;
  isFinals: boolean;
  chiefJudgeName: string;
  chiefSides: { leaders: ChiefSideState; followers: ChiefSideState };
  changedBibs: string[]; // dancers whose result differs from Complete Contest
  tieGroups: { bib: string; label: string; name: string }[][]; // dancers scores can't separate
}

interface ChiefSideState {
  hasScores: boolean;
  isShown: boolean;
}

function buildMatrix(
  contest: CompletedContestResult,
  heats: Heat[],
  competitors: Competitor[],
  scores: ScoreRecord[],
  settings: AppSettings
): Matrix | null {
  const heat = heats.find((h) => h.id === contest.heatId);
  if (!heat) return null;

  const options = getContestOptions(settings, heat.id);
  const sortMode: SortMode = options.sortMode || "score";
  const sideFilter: SideFilter = options.sideFilter || "all";
  const isFinals = contest.heatType === "Finals";

  // Every judge who actually submitted anything for this heat -- not the
  // currently-configured judge roster, which may have changed since this
  // contest ran.
  const outcome = getContestOutcome(heat, competitors, scores, settings);
  const { judgeIds: judgeNames, chiefJudgeName } = outcome;
  const heatScores = scores.filter((s) => s.heatId === heat.id);

  const recordLookup = new Map<string, ScoreRecord>();
  heatScores.forEach((s) => recordLookup.set(`${s.judgeId}::${s.competitorBib}`, s));

  // Reuse the same results engine everything else in the app uses, so the
  // per-judge placements/tallies/averages shown here always match what was
  // actually decided.
  let results = outcome.results;

  // Mixed, non-Finals heats are judged (and internally computed) as separate
  // Leader and Follower fields -- calculateHeatResults itself recurses into
  // that exact split, so r.competitor.role here is a real Lead/Follow role,
  // not the "Lead" placeholder used for couple units on Finals/Routine heats.
  // That lets this matrix group/filter by side using the real role, and skip
  // grouping entirely for heats judged as couples.
  const hasDistinctRoles = heat.role === "Mixed" && !isCouplesHeat(heat);

  const getChiefSide = (role: "Lead" | "Follow"): ChiefSideState => {
    const sideResults = results.filter((r) => r.competitor.role === role);
    return {
      hasScores: sideResults.some((r) => recordLookup.has(`${chiefJudgeName}::${r.competitor.bib}`)),
      isShown: sideResults.some((r) => r.isChiefCounted)
    };
  };
  const chiefSides = { leaders: getChiefSide("Lead"), followers: getChiefSide("Follow") };

  // Flag anyone whose result differs from what Complete Contest recorded,
  // since any next round was built from that record.
  const changedBibs = results
    .filter((r) => {
      const recorded = contest.rankings.find((entry) => entry.bib === r.competitor.bib);
      if (!recorded) return false;
      return isFinals
        ? recorded.rank !== r.rank
        : !!recorded.qualified !== r.qualified || !!recorded.isAlternate !== !!r.isAlternate;
    })
    .map((r) => getDisplayBib(r.competitor.bib, heat.contestType));

  // Dancers the scores couldn't separate: on Finals any shared rank, otherwise
  // only a tie across a cut line matters.
  const tieGroupMap = new Map<string, { bib: string; label: string; name: string }[]>();
  results.forEach((r) => {
    const key = isFinals ? `rank:${r.rank}` : r.tieGroup !== undefined ? `${r.competitor.role}:${r.tieGroup}` : null;
    if (!key) return;
    const name = isResultNameHidden(r, options, isFinals, contest.judgingStyle) ? "" : r.competitor.name;
    tieGroupMap.set(key, [...(tieGroupMap.get(key) || []), { bib: r.competitor.bib, label: getDisplayBib(r.competitor.bib, heat.contestType), name }]);
  });
  const tieGroups = Array.from(tieGroupMap.values()).filter((group) => group.length > 1);

  if (hasDistinctRoles && sideFilter !== "all") {
    results = results.filter((r) =>
      sideFilter === "leaders" ? r.competitor.role === "Lead" : r.competitor.role === "Follow"
    );
  }

  const sortFn = (a: (typeof results)[number], b: (typeof results)[number]) => {
    if (sortMode === "bib") {
      return a.competitor.bib.localeCompare(b.competitor.bib, undefined, { numeric: true });
    }
    return a.rank - b.rank;
  };

  // Leaders first, then Followers -- each side sorted independently, so the
  // grouping survives regardless of sort mode. Heats without distinct sides
  // (single-role heats, and Finals/Routine couples heats) keep the previous
  // single flat sort.
  const sorted = hasDistinctRoles
    ? [
        ...results.filter((r) => r.competitor.role === "Lead").sort(sortFn),
        ...results.filter((r) => r.competitor.role === "Follow").sort(sortFn)
      ]
    : [...results].sort(sortFn);

  const rows: MatrixRow[] = sorted.map((r) => {
    const isAllNo = contest.judgingStyle === "callback" && r.yesCount === 0 && (r.altCount || 0) === 0;
    const cells: Record<string, string> = {};
    judgeNames.forEach((j) => {
      const rec = r.scoresByJudge[j] ? recordLookup.get(`${j}::${r.competitor.bib}`) : undefined;
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
      const placements = [...r.countedPlacements].sort((a, b) => a - b);
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
      bib: getDisplayBib(r.competitor.bib, heat.contestType),
      // Bib number and every judge's score/cell stay visible either way --
      // only the name itself is redacted, and only when an option is on.
      name: isResultNameHidden(r, options, isFinals, contest.judgingStyle) ? "" : r.competitor.name,
      rank: r.rank,
      cells,
      relativeResult,
      isAllNo,
      role: r.competitor.role === "Follow" ? ("Follow" as const) : ("Lead" as const),
      outcome: isFinals ? null : ([ "Callback", "Tied", "Alternate", "Cut" ] as const)[getCutGroup(r)],
      alternateRank: r.alternateRank,
      isTieSettledByChief: !!r.isTieSettledByChief
    };
  });

  const resultColumnLabel =
    contest.judgingStyle === "placement" ? "Placements" : contest.judgingStyle === "callback" ? "Callback Tally" : "Raw Avg";

  return { judgeNames, rows, resultColumnLabel, hasDistinctRoles, isFinals, chiefJudgeName, chiefSides, changedBibs, tieGroups };
}

export default function ScoringDashboard({ settings, competitors, heats, scores, isDarkMode, onRefresh, onUpdateSettings }: ScoringDashboardProps) {
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [divisionFilter, setDivisionFilter] = useState<string>("All");
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

  const updateContestOptions = (heatId: string, update: Partial<ContestOptions>) =>
    onUpdateSettings({
      contestOptions: {
        ...(settings.contestOptions || {}),
        [heatId]: { ...getContestOptions(settings, heatId), ...update }
      }
    });

  const optionButtonClass = (isActive: boolean) =>
    `flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all ${
      isActive
        ? "bg-indigo-600 border-indigo-600 text-white"
        : isDarkMode
          ? "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"
          : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
    }`;

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
              An archive of scored contests — a contest lands here once every judge has submitted and
              finalized their sheet, and its options below are set contest by contest. Cleared on the next
              full database reset.
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

      {/* Results ledger */}
      {visible.length === 0 ? (
        <div className={`py-16 text-center rounded-2xl border ${isDarkMode ? "bg-slate-900/40 border-slate-800 text-slate-500" : "bg-white border-slate-200 text-slate-400"} text-xs font-mono italic`}>
          No contests have been sent to Scoring yet. A contest lands here once the admin runs Complete Contest — which only becomes available after every assigned judge has submitted and finalized their sheet.
        </div>
      ) : (
        <div className="space-y-4">
          {visible.slice().reverse().map((contest) => {
            const isExpanded = !!expandedIds[contest.id];
            const matrix = isExpanded ? buildMatrix(contest, heats, competitors, scores, settings) : null;
            const options = getContestOptions(settings, contest.heatId);
            const sideFilter: SideFilter = options.sideFilter || "all";
            const chiefTieOrder = options.chiefTieOrder || [];
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
                    ) : (
                      <>
                      {/* Options for this contest. Name and Chief Judge options also apply to the public Results Terminal. */}
                      <div className="flex items-center gap-x-4 gap-y-2 mb-3 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Sort</span>
                          <button
                            id={`scoring-sort-score-btn-${contest.id}`}
                            onClick={() => updateContestOptions(contest.heatId, { sortMode: "score" })}
                            className={optionButtonClass((options.sortMode || "score") === "score")}
                          >
                            <ArrowDownWideNarrow className="w-3 h-3" /> Score (High to Low)
                          </button>
                          <button
                            id={`scoring-sort-bib-btn-${contest.id}`}
                            onClick={() => updateContestOptions(contest.heatId, { sortMode: "bib" })}
                            className={optionButtonClass(options.sortMode === "bib")}
                          >
                            <ArrowDownAZ className="w-3 h-3" /> Bib Number
                          </button>
                        </div>

                        {matrix.hasDistinctRoles && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-slate-400">
                              <Filter className="w-3 h-3" /> Side
                            </span>
                            {(
                              [
                                { key: "all", label: "All" },
                                { key: "leaders", label: "Leaders Only" },
                                { key: "followers", label: "Followers Only" }
                              ] as { key: SideFilter; label: string }[]
                            ).map((opt) => (
                              <button
                                key={opt.key}
                                id={`scoring-side-${opt.key}-btn-${contest.id}`}
                                onClick={() => updateContestOptions(contest.heatId, { sideFilter: opt.key })}
                                className={optionButtonClass(sideFilter === opt.key)}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        )}

                        {contest.judgingStyle === "callback" && (
                          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 cursor-pointer select-none">
                            <input
                              id={`scoring-hide-all-no-toggle-${contest.id}`}
                              type="checkbox"
                              checked={!!options.hideAllNoNames}
                              onChange={(e) => updateContestOptions(contest.heatId, { hideAllNoNames: e.target.checked })}
                              className="cursor-pointer"
                            />
                            <EyeOff className="w-3 h-3" />
                            Hide Names for All-No Competitors
                          </label>
                        )}

                        {!matrix.isFinals && (
                          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 cursor-pointer select-none">
                            <input
                              id={`scoring-hide-cut-toggle-${contest.id}`}
                              type="checkbox"
                              checked={!!options.hideCutNames}
                              onChange={(e) => updateContestOptions(contest.heatId, { hideCutNames: e.target.checked })}
                              className="cursor-pointer"
                            />
                            <EyeOff className="w-3 h-3" />
                            Hide Names of Cut Dancers
                          </label>
                        )}
                      </div>

                      <div className={`mb-3 p-3 rounded-xl border ${isDarkMode ? "bg-slate-950/40 border-slate-800" : "bg-slate-50 border-slate-200"}`}>
                        <div className="flex items-center gap-x-4 gap-y-2 flex-wrap">
                          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">{matrix.chiefJudgeName}</span>
                          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 cursor-pointer select-none">
                            <input
                              id={`scoring-chief-include-toggle-${contest.id}`}
                              type="checkbox"
                              checked={options.includeChiefScores !== false}
                              onChange={(e) => updateContestOptions(contest.heatId, { includeChiefScores: e.target.checked })}
                              className="cursor-pointer"
                            />
                            Include Chief Judge Scores
                          </label>
                          {(matrix.hasDistinctRoles
                            ? [
                                { key: "leaders", label: "Leaders", side: matrix.chiefSides.leaders, shownKeys: ["chiefShownLeaders"], weightKeys: ["chiefWeightLeaders"], weight: options.chiefWeightLeaders },
                                { key: "followers", label: "Followers", side: matrix.chiefSides.followers, shownKeys: ["chiefShownFollowers"], weightKeys: ["chiefWeightFollowers"], weight: options.chiefWeightFollowers }
                              ]
                            : [
                                {
                                  key: "all",
                                  label: "",
                                  side: matrix.chiefSides.leaders.hasScores ? matrix.chiefSides.leaders : matrix.chiefSides.followers,
                                  shownKeys: ["chiefShownLeaders", "chiefShownFollowers"],
                                  weightKeys: ["chiefWeightLeaders", "chiefWeightFollowers"],
                                  weight: options.chiefWeightLeaders
                                }
                              ]
                          ).map((row) => (
                            <div key={row.key} className={`flex items-center gap-3 ${row.side.hasScores && options.includeChiefScores !== false ? "" : "opacity-50"}`}>
                              {row.label && <span className="text-[11px] font-bold text-slate-400">{row.label}:</span>}
                              <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 cursor-pointer select-none">
                                <input
                                  id={`scoring-chief-shown-${row.key}-${contest.id}`}
                                  type="checkbox"
                                  disabled={!row.side.hasScores || options.includeChiefScores === false}
                                  checked={row.side.isShown}
                                  onChange={(e) => updateContestOptions(contest.heatId, Object.fromEntries(row.shownKeys.map((key) => [key, e.target.checked])))}
                                  className="cursor-pointer"
                                />
                                Show Scores
                              </label>
                              <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 cursor-pointer select-none">
                                <input
                                  id={`scoring-chief-weight-${row.key}-${contest.id}`}
                                  type="checkbox"
                                  disabled={!row.side.hasScores || options.includeChiefScores === false}
                                  checked={row.weight !== false}
                                  onChange={(e) => updateContestOptions(contest.heatId, Object.fromEntries(row.weightKeys.map((key) => [key, e.target.checked])))}
                                  className="cursor-pointer"
                                />
                                CJ Weighted Scores
                              </label>
                            </div>
                          ))}
                        </div>
                        <p className="text-[10px] text-slate-400 mt-2">CJ Weighted Scores lets their score settle a tie.</p>
                      </div>

                      {matrix.tieGroups.length > 0 && (
                        <div id={`scoring-tie-note-${contest.id}`} className="mb-3 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-[11px] text-rose-500 font-semibold space-y-2">
                          <p>Scores don't separate these dancers, so they're tied. Pick the Chief Judge's order, or change the toggles above.</p>
                          {matrix.tieGroups.map((group) => (
                            <div key={group[0].bib} className="flex items-center gap-2 flex-wrap">
                              {group.map((dancer) => (
                                <button
                                  key={dancer.bib}
                                  type="button"
                                  onClick={() => updateContestOptions(contest.heatId, { chiefTieOrder: [dancer.bib, ...chiefTieOrder.filter((bib) => bib !== dancer.bib)] })}
                                  className="px-2 py-1 rounded-lg border border-rose-500/30 hover:bg-rose-500/10 text-[10px] font-bold cursor-pointer transition-all"
                                >
                                  Put #{dancer.label}{dancer.name ? ` ${dancer.name}` : ""} ahead
                                </button>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}

                      {chiefTieOrder.length > 0 && (
                        <button
                          type="button"
                          onClick={() => updateContestOptions(contest.heatId, { chiefTieOrder: [] })}
                          className="mb-3 text-[10px] font-semibold text-slate-400 underline cursor-pointer"
                        >
                          Clear the Chief Judge's tie order ({chiefTieOrder.map((bib) => `#${bib}`).join(", ")})
                        </button>
                      )}

                      {matrix.changedBibs.length > 0 && (
                        <p id={`scoring-changed-note-${contest.id}`} className="mb-3 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-500 font-semibold">
                          This differs from the result recorded at Complete Contest for: {matrix.changedBibs.map((bib) => `#${bib}`).join(", ")}. Any next round already created keeps the dancers it was built with.
                        </p>
                      )}

                      {matrix.rows.length === 0 ? (
                      <p className="text-xs text-slate-400 italic py-4 text-center">
                        No competitors found for this contest.
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
                              {!matrix.isFinals && <th className="p-2 text-right font-bold">Outcome</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {matrix.rows.map((row, idx) => {
                              const isPodium = matrix.isFinals && row.rank <= 3;
                              const showDivider =
                                matrix.hasDistinctRoles &&
                                sideFilter === "all" &&
                                (idx === 0 || matrix.rows[idx - 1].role !== row.role);
                              return (
                                <React.Fragment key={row.bib}>
                                {showDivider && (
                                  <tr>
                                    <td
                                      colSpan={matrix.judgeNames.length + 4}
                                      className={`px-2 pt-3 pb-1 text-[9px] font-bold uppercase tracking-wider font-mono ${isDarkMode ? "text-slate-500" : "text-slate-400"}`}
                                    >
                                      {row.role === "Lead" ? "Leaders" : "Followers"}
                                    </td>
                                  </tr>
                                )}
                                <tr
                                  className={`border-b last:border-0 ${isDarkMode ? "border-slate-800/50" : "border-slate-100"} ${isPodium ? "bg-amber-500/[0.03]" : row.isAllNo || row.outcome === "Cut" ? "opacity-50" : ""}`}
                                >
                                  <td className="p-2 text-center font-mono font-bold text-slate-400">
                                    {row.bib}
                                  </td>
                                  <td className="p-2 font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                                    {isPodium && (row.rank === 1 ? "🥇 " : row.rank === 2 ? "🥈 " : "🥉 ")}
                                    {row.name ? row.name : <span className="italic text-slate-400">Name hidden</span>}
                                  </td>
                                  {matrix.judgeNames.map((j) => (
                                    <td key={j} className="p-2 text-center font-mono text-slate-600 dark:text-slate-300">
                                      {row.cells[j]}
                                    </td>
                                  ))}
                                  <td className="p-2 text-right font-mono font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                                    {row.relativeResult}
                                    {row.isTieSettledByChief && (
                                      <span title="Tie settled by the Chief Judge" className="ml-1.5 px-1 py-0.5 rounded bg-amber-500/10 text-amber-500 text-[9px] font-bold border border-amber-500/20">CJ</span>
                                    )}
                                  </td>
                                  {!matrix.isFinals && (
                                    <td className={`p-2 text-right font-semibold whitespace-nowrap ${
                                      row.outcome === "Callback" ? "text-green-500" : row.outcome === "Tied" ? "text-rose-500" : row.outcome === "Alternate" ? "text-amber-500" : "text-slate-400"
                                    }`}>
                                      {row.outcome === "Alternate" ? `Alt ${row.alternateRank}` : row.outcome}
                                    </td>
                                  )}
                                </tr>
                                </React.Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                        {matrix.rows.some((row) => row.isTieSettledByChief) && (
                          <p className="mt-2 text-[10px] text-slate-400">
                            <span className="px-1 py-0.5 mr-1 rounded bg-amber-500/10 text-amber-500 text-[9px] font-bold border border-amber-500/20">CJ</span>
                            Tie settled by the Chief Judge.
                          </p>
                        )}
                      </div>
                      )}
                      </>
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
