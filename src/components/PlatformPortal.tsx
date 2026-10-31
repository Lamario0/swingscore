import React from "react";
import { ShieldAlert, Award, UserCheck, Users, Landmark, ExternalLink, KeyRound, Trophy, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { AppSettings, Competitor, CompletedContestResult, Heat, ScoreRecord } from "../types";
import { getPublicHeatIds } from "../hooks/useCommunityState";
import { formatPlacement, getContestOptions, getContestOutcome, getCutGroup, isResultNameHidden } from "../utils/calculations";
import { getDisplayBib, isCouplesHeat, showsBibs } from "../utils/partners";

interface PlatformPortalProps {
  isDarkMode: boolean;
  settings?: AppSettings;
  competitors?: Competitor[];
  heats?: Heat[];
  scores?: ScoreRecord[];
  // Staff devices hold every contest's scores; public devices only Published ones.
  canReadAllScores?: boolean;
  communityName?: string;
}

interface RecordedRow {
  bib: string;
  name: string;
  rank: number;
  qualified?: boolean;
  isAlternate?: boolean;
  alternateRank?: number;
  tieGroup?: number;
  side: "Lead" | "Follow" | null;
  isNameHidden: boolean;
}

export default function PlatformPortal({ isDarkMode, settings, competitors = [], heats = [], scores = [], canReadAllScores = false, communityName }: PlatformPortalProps) {
  const [expandedHeatIds, setExpandedHeatIds] = React.useState<Record<string, boolean>>({});

  const toggleHeatExpand = (id: string) => {
    setExpandedHeatIds(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  // A contest's lines as the Results Terminal shows them: the Scoring Ledger's
  // options applied, ranked for Finals, otherwise each side in bib order with
  // alternates after the callbacks and cuts last. A contest whose heat has been
  // deleted, or whose scores this device can't read, shows what was recorded.
  const getRecordedRows = (contest: CompletedContestResult): RecordedRow[] => {
    const isFinals = contest.heatType === "Finals";
    const heat = heats.find((h) => h.id === contest.heatId);
    let rows: RecordedRow[] = contest.rankings.map((r) => ({ ...r, side: null, isNameHidden: false }));
    const canRecalculate = canReadAllScores || (!!settings && getPublicHeatIds(settings).includes(contest.heatId));
    if (heat && settings && canRecalculate) {
      const { results, judgingStyle } = getContestOutcome(heat, competitors, scores, settings);
      const options = getContestOptions(settings, heat.id);
      const hasSides = heat.role === "Mixed" && !isCouplesHeat(heat);
      rows = results.map((r) => ({
        bib: r.competitor.bib,
        name: r.competitor.name,
        rank: r.rank,
        qualified: r.qualified,
        isAlternate: r.isAlternate,
        alternateRank: r.alternateRank,
        tieGroup: r.tieGroup,
        side: hasSides ? r.competitor.role : null,
        isNameHidden: isResultNameHidden(r, options, isFinals, judgingStyle)
      }));
    }
    if (isFinals) return rows.sort((a, b) => a.rank - b.rank);
    const getSideOrder = (row: RecordedRow) => (row.side === "Follow" ? 1 : 0);
    return rows.sort((a, b) =>
      getSideOrder(a) - getSideOrder(b) ||
      getCutGroup(a) - getCutGroup(b) ||
      a.bib.localeCompare(b.bib, undefined, { numeric: true })
    );
  };

  const systems = [
    {
      title: "Admin Control Panel",
      path: "/admin",
      query: "?role=admin",
      access: "Gateway code + passcode",
      description: "Manage competitor databases, activate division heats, configure relative placement options, and toggle simulation modules.",
      icon: <ShieldAlert className="w-5 h-5 text-rose-500" />,
      color: "border-rose-500/20 hover:border-rose-500/40 bg-rose-500/[0.02]"
    },
    {
      title: "Judge Station Portal",
      path: "/judge",
      query: "?role=judge",
      access: "Gateway code + passcode",
      description: "Dedicated real-time digital sheet for registered adjudicators. Record scores or sequential placement rankings securely.",
      icon: <Award className="w-5 h-5 text-amber-500" />,
      color: "border-amber-500/20 hover:border-amber-500/40 bg-amber-500/[0.02]"
    },
    {
      title: "Floor Coordinator Panel",
      path: "/floorcord",
      query: "?role=coordinator",
      access: "Gateway code + passcode",
      description: "Dancer check-in dashboard and queue staging. Verify competitors as they report for their scheduled heats.",
      icon: <UserCheck className="w-5 h-5 text-emerald-500" />,
      color: "border-emerald-500/20 hover:border-emerald-500/40 bg-emerald-500/[0.02]"
    },
    {
      title: "Registration",
      path: "/registration",
      query: "?role=competitor",
      access: "Gateway code + passcode",
      description: "Register dancers, assign bib numbers and enter them into divisions and contests. Only approved staff can add or edit a registration.",
      icon: <Users className="w-5 h-5 text-blue-500" />,
      color: "border-blue-500/20 hover:border-blue-500/40 bg-blue-500/[0.02]"
    },
    {
      title: "Public Results Terminal",
      path: "/results",
      query: "?role=results",
      access: "Gateway code",
      description: "Spectator scoreboard displaying relative placement rankings, judge vote matrices, callback cuts, and live score synchronization.",
      icon: <Landmark className="w-5 h-5 text-violet-500" />,
      color: "border-violet-500/20 hover:border-violet-500/40 bg-violet-500/[0.02]"
    },
    {
      title: "Scoring & Results Ledger",
      path: "/scoring",
      query: "?role=scoring",
      access: "Gateway code + passcode",
      description: "Internal system of record for completed contests — every heat closed out by the admin's Complete Contest action lands here.",
      icon: <Sparkles className="w-5 h-5 text-indigo-500" />,
      color: "border-indigo-500/20 hover:border-indigo-500/40 bg-indigo-500/[0.02]"
    }
  ];

  const handleNavigate = (path: string, query: string) => {
    // Modify URL path or query params to simulate navigating to the segregated subdomain slug
    // Using window.location.pathname or window.location.search forces a clean app reload matching the slug context
    window.location.search = query;
  };

  return (
    <div className="max-w-4xl mx-auto py-8">
      {/* Visual Header */}
      <div className="text-center mb-10">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
          {communityName || "SwingScore"}
        </h1>
        <p className="text-xs text-slate-400 mt-2 max-w-lg mx-auto leading-relaxed">
          Choose your portal. Dancers, coordinators, judges, and administrators each have their own workspace.
        </p>
      </div>

      {/* Grid of separate systems */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {systems.map((sys) => (
          <div
            key={sys.title}
            className={`p-6 rounded-2xl border transition-all duration-300 flex flex-col justify-between ${sys.color} ${
              isDarkMode ? "bg-slate-900/40" : "bg-white"
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  {sys.icon}
                </div>
                <span className="text-[10px] font-mono text-slate-500 bg-slate-500/5 px-2 py-0.5 rounded border border-slate-500/10 flex items-center gap-1">
                  <KeyRound className="w-3 h-3 text-slate-400" />
                  {sys.access}
                </span>
              </div>

              <h3 className="text-base font-bold tracking-tight text-slate-900 dark:text-slate-100">{sys.title}</h3>
              <p className="text-xs text-slate-400 mt-2.5 leading-relaxed font-normal">
                {sys.description}
              </p>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-end">
              <button
                onClick={() => handleNavigate(sys.path, sys.query)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  isDarkMode
                    ? "bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
                    : "bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 shadow-sm"
                }`}
              >
                Go to Portal
                <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Official Results Panel */}
      <div className={`mt-10 p-6 rounded-2xl border transition-all ${
        isDarkMode ? "bg-slate-900/60 border-slate-800 text-slate-100" : "bg-white border-slate-200 shadow-sm text-slate-800"
      }`}>
        <div className="flex items-center gap-2 mb-4 border-b border-slate-100 dark:border-slate-850 pb-3">
          <Trophy className="w-5 h-5 text-amber-500" />
          <div>
            <h2 className="text-base font-bold tracking-tight">Official Recorded Results</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">Signed off and finalized by the Chief Adjudicator</p>
          </div>
        </div>

        {!settings?.completedResults || settings.completedResults.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-xs font-mono italic">
            No official results have been finalized or recorded yet.
          </div>
        ) : (
          <div className="space-y-4">
            {settings.completedResults.map((contest) => {
              const isExpanded = !!expandedHeatIds[contest.id];
              const isFinals = contest.heatType === "Finals";
              const rows = isExpanded ? getRecordedRows(contest) : [];
              const contestType = heats.find((h) => h.id === contest.heatId)?.contestType;
              return (
                <div
                  key={contest.id}
                  className={`border rounded-xl transition-all ${
                    isDarkMode ? "border-slate-800 bg-slate-900/30" : "border-slate-150 bg-slate-50/50"
                  }`}
                >
                  {/* Accordion Trigger Header */}
                  <div
                    onClick={() => toggleHeatExpand(contest.id)}
                    className="p-4 flex items-center justify-between cursor-pointer select-none"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <span className="font-bold text-xs text-slate-900 dark:text-slate-100 font-mono">
                        {contest.name}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 font-semibold uppercase tracking-wider font-mono">
                          {contest.heatType}
                        </span>
                        <span className="text-[9px] px-2 py-0.5 rounded-full bg-slate-500/10 text-slate-400 font-semibold font-mono">
                          {contest.timestamp}
                        </span>
                      </div>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    )}
                  </div>

                  {/* Accordion Content */}
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-slate-100 dark:border-slate-800/80 pt-3">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-100/50 dark:bg-slate-900/40 text-[10px] font-mono text-slate-400 border-b border-slate-150 dark:border-slate-800">
                              {isFinals && <th className="p-2 w-12 text-center font-bold">Rank</th>}
                              {showsBibs(contestType) && <th className="p-2 w-16 text-center font-bold">Bib</th>}
                              <th className="p-2 font-bold">Competitor / Couple Name</th>
                              <th className="p-2 text-right font-bold">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((ranking, index) => {
                              const isPodium = isFinals && ranking.rank <= 3;
                              const showSideHeading = !!ranking.side && (index === 0 || rows[index - 1].side !== ranking.side);
                              return (
                                <React.Fragment key={ranking.bib}>
                                {showSideHeading && (
                                  <tr>
                                    <td colSpan={3} className="px-2 pt-3 pb-1 text-[9px] font-bold uppercase tracking-wider font-mono text-slate-400">
                                      {ranking.side === "Lead" ? "Leaders" : "Followers"}
                                    </td>
                                  </tr>
                                )}
                                <tr
                                  className={`border-b border-slate-100 dark:border-slate-800/50 last:border-0 ${
                                    isPodium ? "bg-amber-500/[0.01]" : ""
                                  }`}
                                >
                                  {isFinals && (
                                    <td className="p-2 text-center font-bold font-mono">
                                      {ranking.rank === 1 ? (
                                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500/10 text-amber-500 text-[11px]">🥇</span>
                                      ) : ranking.rank === 2 ? (
                                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-300/20 text-slate-400 text-[11px]">🥈</span>
                                      ) : ranking.rank === 3 ? (
                                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-700/15 text-amber-700 text-[11px]">🥉</span>
                                      ) : (
                                        ranking.rank
                                      )}
                                    </td>
                                  )}
                                  {showsBibs(contestType) && (
                                    <td className="p-2 text-center font-mono font-bold text-slate-400">
                                      {getDisplayBib(ranking.bib, contestType)}
                                    </td>
                                  )}
                                  <td className="p-2 font-medium text-slate-300">
                                    {ranking.isNameHidden ? <span className="italic text-slate-400">Name hidden</span> : ranking.name}
                                  </td>
                                  <td className="p-2 text-right">
                                    {isFinals ? (
                                      <span className="text-[10px] font-bold font-mono text-amber-500">
                                        {formatPlacement(ranking.rank)} Place
                                      </span>
                                    ) : ranking.qualified ? (
                                      <span className="text-[10px] font-bold font-mono text-emerald-500">
                                        Qualified Callback
                                      </span>
                                    ) : ranking.tieGroup !== undefined ? (
                                      <span className="text-[10px] font-bold font-mono text-rose-500">
                                        Tied
                                      </span>
                                    ) : ranking.isAlternate ? (
                                      <span className="text-[10px] font-bold font-mono text-violet-400">
                                        Alt {ranking.alternateRank}
                                      </span>
                                    ) : (
                                      <span className="text-[10px] font-mono text-slate-500">
                                        Cut
                                      </span>
                                    )}
                                  </td>
                                </tr>
                                </React.Fragment>
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
      </div>
    </div>
  );
}
