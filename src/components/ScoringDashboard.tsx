import React, { useState, useMemo } from "react";
import { Trophy, RefreshCw, ChevronDown, ChevronUp, BarChart3, ListOrdered, CheckCircle2, Filter } from "lucide-react";
import { AppSettings } from "../types";

interface ScoringDashboardProps {
  settings: AppSettings;
  isDarkMode: boolean;
  onRefresh?: () => void;
}

export default function ScoringDashboard({ settings, isDarkMode, onRefresh }: ScoringDashboardProps) {
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [divisionFilter, setDivisionFilter] = useState<string>("All");

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
              Every contest completed by the admin's Complete Contest action lands here — the permanent
              record judges' submitted score sheets are compiled into once a heat is closed out.
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
        <div className="flex items-center gap-2 mb-4 flex-wrap">
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
          No contests have been sent to Scoring yet. Complete a contest from the Live Contest tab in Admin to populate this ledger.
        </div>
      ) : (
        <div className="space-y-4">
          {visible.slice().reverse().map((contest) => {
            const isExpanded = !!expandedIds[contest.id];
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
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />}
                </div>

                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-slate-100 dark:border-slate-800/80 pt-3">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className={`text-[10px] font-mono text-slate-400 border-b ${isDarkMode ? "bg-slate-900/60 border-slate-800" : "bg-slate-50 border-slate-150"}`}>
                            <th className="p-2 w-12 text-center font-bold">Rank</th>
                            <th className="p-2 w-16 text-center font-bold">Bib</th>
                            <th className="p-2 font-bold">Competitor / Couple</th>
                            {contest.judgingStyle === "raw" && <th className="p-2 text-right font-bold">Avg Score</th>}
                            {contest.judgingStyle === "placement" && <th className="p-2 text-right font-bold">Avg Placement</th>}
                            <th className="p-2 text-right font-bold">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {contest.rankings.map((ranking) => {
                            const isPodium = contest.heatType === "Finals" && ranking.rank <= 3;
                            return (
                              <tr
                                key={ranking.bib}
                                className={`border-b last:border-0 ${isDarkMode ? "border-slate-800/50" : "border-slate-100"} ${isPodium ? "bg-amber-500/[0.03]" : ""}`}
                              >
                                <td className="p-2 text-center font-bold font-mono">
                                  {ranking.rank === 1 ? "🥇" : ranking.rank === 2 ? "🥈" : ranking.rank === 3 ? "🥉" : ranking.rank}
                                </td>
                                <td className="p-2 text-center font-mono font-bold text-slate-400">{ranking.bib}</td>
                                <td className="p-2 font-medium text-slate-700 dark:text-slate-300">{ranking.name}</td>
                                {contest.judgingStyle === "raw" && (
                                  <td className="p-2 text-right font-mono font-semibold text-slate-600 dark:text-slate-300">
                                    {ranking.averageScore !== undefined ? ranking.averageScore.toFixed(1) : "—"}
                                  </td>
                                )}
                                {contest.judgingStyle === "placement" && (
                                  <td className="p-2 text-right font-mono font-semibold text-slate-600 dark:text-slate-300">
                                    {ranking.averagePlacement !== undefined ? ranking.averagePlacement.toFixed(2) : "—"}
                                  </td>
                                )}
                                <td className="p-2 text-right">
                                  {isPodium ? (
                                    <span className="text-[10px] font-bold font-mono text-amber-500">Podium Winner</span>
                                  ) : ranking.qualified ? (
                                    <span className="text-[10px] font-bold font-mono text-emerald-500">Qualified / Callback</span>
                                  ) : ranking.isAlternate ? (
                                    <span className="text-[10px] font-bold font-mono text-violet-400">Alternate</span>
                                  ) : (
                                    <span className="text-[10px] font-mono text-slate-500">Recorded</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className={`mt-8 p-4 rounded-xl border text-center ${isDarkMode ? "bg-slate-900/30 border-slate-800/60 text-slate-400" : "bg-white border-slate-200 text-slate-500"} text-[11px] leading-relaxed max-w-2xl mx-auto`}>
        💡 Scoring is the internal system of record. Publicly-facing standings and callback boards live on the
        separate Results terminal — this ledger is where finalized judge decisions are archived contest by contest.
      </div>
    </div>
  );
}
