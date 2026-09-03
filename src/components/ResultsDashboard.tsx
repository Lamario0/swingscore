import React, { useState } from "react";
import { Award, Medal, Landmark, Check, AlertCircle, TrendingUp, Users, RefreshCw, Lock, Key } from "lucide-react";
import { Competitor, Heat, ScoreRecord, AppSettings } from "../types";
import { calculateHeatResults, CompetitorResult } from "../utils/calculations";

interface ResultsDashboardProps {
  competitors: Competitor[];
  heats: Heat[];
  scores: ScoreRecord[];
  settings: AppSettings;
  isDarkMode: boolean;
  onRefresh: () => Promise<void>;
}

export default function ResultsDashboard({
  competitors,
  heats,
  scores,
  settings,
  isDarkMode,
  onRefresh
}: ResultsDashboardProps) {
  const [selectedHeatId, setSelectedHeatId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [bypassCode, setBypassCode] = useState("");
  const [bypassError, setBypassError] = useState("");
  const [bypassSuccess, setBypassSuccess] = useState(false);

  const visibleHeats = bypassSuccess 
    ? heats 
    : heats.filter(h => 
        (h.id === settings.currentHeatId && settings.isPublished) || 
        (settings.publishedHeatIds && settings.publishedHeatIds.includes(h.id))
      );

  const activeHeatId = selectedHeatId || (visibleHeats.find(h => h.id === settings.currentHeatId)?.id) || (visibleHeats[0]?.id || null);
  const currentHeat = visibleHeats.find((h) => h.id === activeHeatId);

  const handleManualRefresh = async () => {
    setSyncing(true);
    try {
      await onRefresh();
    } finally {
      setTimeout(() => setSyncing(false), 500);
    }
  };

  if (heats.length === 0) {
    return (
      <div className={`p-8 rounded-2xl border text-center transition-all ${isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 text-slate-800 shadow-sm"}`}>
        <Landmark className="w-12 h-12 mx-auto text-violet-500 mb-4" />
        <h3 className="text-lg font-bold tracking-tight">No Heats Configured Yet</h3>
        <p className="text-xs text-slate-400 mt-2 max-w-sm mx-auto">
          Please navigate to the Admin Panel to create competition heats and assign dancers.
        </p>
      </div>
    );
  }

  // Publication Status Check for Public View
  if (visibleHeats.length === 0 && !bypassSuccess) {
    return (
      <div className="max-w-md w-full mx-auto my-12">
        <div className={`p-8 rounded-3xl border transition-all ${
          isDarkMode 
            ? "bg-slate-900 border-slate-800 text-slate-100 shadow-2xl" 
            : "bg-white border-slate-200 text-slate-800 shadow-xl"
        }`}>
          <div className="flex flex-col items-center text-center">
            <div className="p-4 rounded-2xl mb-4 border border-violet-500/20 text-violet-500 bg-violet-500/5 animate-pulse">
              <Lock className="w-10 h-10" />
            </div>
            
            <h2 className="text-xl font-bold tracking-tight mt-2 text-slate-900 dark:text-slate-100">Results Under Audit</h2>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              The competition coordinators are currently auditing and validating scoresheets. Official results will be published here as soon as they are signed off.
            </p>
          </div>

          <form 
            onSubmit={(e) => {
              e.preventDefault();
              if (bypassCode === "admin") {
                setBypassSuccess(true);
                setBypassError("");
              } else {
                setBypassError("Invalid audit passcode.");
              }
            }}
            className="mt-6 space-y-4 border-t border-slate-100 dark:border-slate-800 pt-5"
          >
            <div>
              <label className="block text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-2 text-center">
                Auditor & Staff Access Bypass
              </label>
              <div className="relative">
                <input
                  id="bypass-passcode-input"
                  type="password"
                  value={bypassCode}
                  onChange={(e) => setBypassCode(e.target.value)}
                  placeholder="Enter bypass passcode"
                  className={`w-full text-xs pl-10 pr-4 py-2.5 rounded-xl border focus:outline-none focus:ring-1 focus:ring-violet-500 font-mono transition-all text-center ${
                    isDarkMode
                      ? "bg-slate-800 border-slate-700 text-slate-100 placeholder-slate-500"
                      : "bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400"
                  }`}
                />
                <Key className="w-3.5 h-3.5 text-slate-500 absolute left-3.5 top-3.5" />
              </div>
            </div>

            {bypassError && (
              <p className="text-[10px] text-rose-500 text-center font-semibold">{bypassError}</p>
            )}

            <button
              id="bypass-submit-btn"
              type="submit"
              className="w-full py-2 bg-violet-600 hover:bg-violet-500 text-white font-semibold text-xs rounded-xl tracking-wider uppercase transition-all cursor-pointer"
            >
              Verify & Preview Draft
            </button>
          </form>

          <div className="mt-6 border-t border-slate-100 dark:border-slate-800 pt-4 text-center">
            <p className="text-[10px] font-mono text-slate-500">
              Local simulated event directors may use passcode <strong className="text-violet-400">"admin"</strong> to preview scores prior to official publishing.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!currentHeat) {
    return (
      <div className={`p-8 rounded-2xl border text-center transition-all ${isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 text-slate-800 shadow-sm"}`}>
        <Landmark className="w-12 h-12 mx-auto text-violet-500 mb-4" />
        <h3 className="text-lg font-bold tracking-tight">No Published Heats</h3>
        <p className="text-xs text-slate-400 mt-2 max-w-sm mx-auto">
          No official results have been published yet for your current search.
        </p>
      </div>
    );
  }

  // Define role-specific callback and alternate counts
  const hCallbackCount = currentHeat.role === "Lead"
    ? (settings.callbackCountLeaders !== undefined ? settings.callbackCountLeaders : settings.callbackCount)
    : currentHeat.role === "Follow"
      ? (settings.callbackCountFollowers !== undefined ? settings.callbackCountFollowers : settings.callbackCount)
      : settings.callbackCount;

  const hAlternateCount = currentHeat.role === "Lead"
    ? (settings.alternateCountLeaders !== undefined ? settings.alternateCountLeaders : (settings.alternateCount || 0))
    : currentHeat.role === "Follow"
      ? (settings.alternateCountFollowers !== undefined ? settings.alternateCountFollowers : (settings.alternateCount || 0))
      : (settings.alternateCount || 0);

  // Calculate results
  const results: CompetitorResult[] = calculateHeatResults(
    currentHeat,
    competitors,
    scores,
    settings.judgingStyle,
    hCallbackCount,
    hAlternateCount,
    settings.callbackCountLeaders,
    settings.callbackCountFollowers,
    settings.alternateCountLeaders,
    settings.alternateCountFollowers,
    settings
  );

  // Find all judges who have scored in this heat
  const heatScores = scores.filter((s) => s.heatId === currentHeat.id);
  const judges = Array.from(new Set(heatScores.map((s) => s.judgeId))).sort();

  // Callback mode vs Finals mode
  const isCallbackHeat = currentHeat.role !== "Mixed" || settings.judgingStyle === "callback";

  return (
    <div className="space-y-6">
      {settings.isPublished === false && bypassSuccess && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 text-xs font-semibold flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <span><strong>UNPUBLISHED AUDIT DRAFT PREVIEW</strong>: This scoresheet is currently saved in draft mode and is hidden from the public Results dashboard.</span>
          </div>
          <button
            id="lock-preview-draft-btn"
            onClick={() => setBypassSuccess(false)}
            className="px-2.5 py-1 bg-amber-500 text-slate-950 font-bold font-mono uppercase text-[9px] rounded hover:bg-amber-400 transition-all cursor-pointer whitespace-nowrap"
          >
            Lock Preview
          </button>
        </div>
      )}

      {/* Selector & Actions row */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-1.5 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <label className="text-xs font-semibold text-slate-400 font-mono uppercase tracking-wider">Viewing Results For:</label>
          <select
            id="results-heat-selector"
            value={activeHeatId || ""}
            onChange={(e) => setSelectedHeatId(e.target.value || null)}
            className={`text-xs px-3 py-2 rounded-xl border focus:outline-none focus:ring-1 focus:ring-violet-500 font-mono w-full sm:w-64 ${
              isDarkMode
                ? "bg-slate-800 border-slate-700 text-slate-100"
                : "bg-white border-slate-200 text-slate-800 shadow-sm"
            }`}
          >
            {visibleHeats.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name} ({h.division})
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
          <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400">
            <span>Style:</span>
            <span className="font-bold text-violet-500 bg-violet-600/10 px-2 py-0.5 rounded uppercase">
              {settings.judgingStyle === "raw" ? "Raw Average" : settings.judgingStyle === "placement" ? "Placement Rank" : "Callback Select"}
            </span>
          </div>

          <button
            id="results-refresh-btn"
            onClick={handleManualRefresh}
            className={`p-2 rounded-xl border flex items-center justify-center gap-1.5 text-xs font-semibold transition-all ${
              isDarkMode
                ? "bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
                : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm"
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
            Sync Scores
          </button>
        </div>
      </div>

      {/* Heat Meta Details Card */}
      <div className={`p-5 rounded-2xl border transition-all ${isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 shadow-sm text-slate-800"}`}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <span className="text-[10px] font-semibold text-slate-400 font-mono uppercase tracking-wider block">Currently Auditing</span>
            <h2 className="text-xl font-bold tracking-tight text-violet-500 mt-0.5">{currentHeat.name}</h2>
            <p className="text-xs text-slate-400 mt-1">{currentHeat.division} • {currentHeat.role === "Mixed" ? "Couples" : `${currentHeat.role}s`} • {currentHeat.competitorBibs.length} total dancers</p>
          </div>

          <div className="flex flex-col justify-center border-t md:border-t-0 md:border-l border-slate-100 dark:border-slate-800 pt-4 md:pt-0 md:pl-6">
            <span className="text-[10px] font-semibold text-slate-400 font-mono uppercase tracking-wider block">Judges Reporting</span>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {judges.map((jId) => (
                <span key={jId} className="px-2 py-0.5 bg-violet-600/10 text-violet-500 rounded font-mono font-bold text-[10px] border border-violet-500/10">
                  {jId}
                </span>
              ))}
              {judges.length === 0 && (
                <span className="text-xs text-amber-500 font-mono animate-pulse">Waiting for first judge score card...</span>
              )}
            </div>
          </div>

          <div className="flex flex-col justify-center border-t md:border-t-0 md:border-l border-slate-100 dark:border-slate-800 pt-4 md:pt-0 md:pl-6">
            <span className="text-[10px] font-semibold text-slate-400 font-mono uppercase tracking-wider block">Heat Outcome Metric</span>
            <span className="text-sm font-bold text-slate-300 mt-1">
              {isCallbackHeat ? (
                <span className="text-emerald-500">
                  Callback Audits: Top {hCallbackCount}
                  {hAlternateCount > 0 ? ` (+ ${hAlternateCount} Alt)` : ""}
                </span>
              ) : (
                <span className="text-amber-500">Final Placements (Rank 1-N)</span>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Main Results Table Card */}
      <div className={`p-6 rounded-2xl border transition-all ${isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 shadow-sm text-slate-800"}`}>
        <h3 className="text-lg font-bold tracking-tight mb-4 flex items-center gap-2">
          <Medal className="w-5 h-5 text-violet-500" />
          Scoring Matrix
        </h3>

        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className={`${isDarkMode ? "bg-slate-800/50 text-slate-300" : "bg-slate-50 text-slate-500"} text-xs font-semibold font-mono border-b border-slate-200 dark:border-slate-800`}>
                <th className="p-3 w-16">Rank</th>
                <th className="p-3 w-16">Bib</th>
                <th className="p-3">Dancer Name</th>
                
                {/* Individual Judge columns */}
                {judges.map((jId) => (
                  <th key={jId} className="p-3 text-center">{jId}</th>
                ))}
                
                {/* Score stats depending on mode */}
                {settings.judgingStyle === "raw" ? (
                  <th className="p-3 text-right">Avg Score</th>
                ) : settings.judgingStyle === "placement" ? (
                  <th className="p-3 text-right">Avg Placement</th>
                ) : (
                  <th className="p-3 text-right">Prelim Points</th>
                )}

                {isCallbackHeat && (
                  <>
                    <th className="p-3 text-center">Yes / Alt / No</th>
                    <th className="p-3 text-right">Qualify Cut</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
              {results.map((res, index) => {
                const isWinner = res.rank === 1 && !isCallbackHeat;
                const isSecond = res.rank === 2 && !isCallbackHeat;
                const isThird = res.rank === 3 && !isCallbackHeat;

                return (
                  <tr
                    key={res.competitor.bib}
                    className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-all ${
                      res.qualified && isCallbackHeat ? "bg-green-500/5 dark:bg-green-500/[0.02]" :
                      res.isAlternate && isCallbackHeat ? "bg-amber-500/5 dark:bg-amber-500/[0.02]" : ""
                    }`}
                  >
                    <td className="p-3 font-mono font-bold">
                      {isWinner ? (
                        <span className="flex items-center gap-1 text-amber-500">
                          🏆 1st
                        </span>
                      ) : isSecond ? (
                        <span className="text-slate-400">🥈 2nd</span>
                      ) : isThird ? (
                        <span className="text-amber-700">🥉 3rd</span>
                      ) : (
                        <span className="text-slate-500 pl-6">{res.rank}th</span>
                      )}
                    </td>
                    <td className="p-3 font-mono font-bold text-violet-500">#{res.competitor.bib}</td>
                    <td className="p-3 font-medium">
                      <div>
                        <span>{res.competitor.name}</span>
                        <span className="text-[10px] text-slate-400 font-mono block sm:inline sm:ml-2">({res.competitor.division})</span>
                      </div>
                    </td>

                    {/* Judge scores */}
                    {judges.map((jId) => {
                      const details = res.scoresByJudge[jId];
                      return (
                        <td key={jId} className="p-3 text-center font-mono border-l border-slate-200 dark:border-slate-800">
                          {details ? (
                            <div className="flex flex-col items-center justify-center">
                              {settings.judgingStyle === "raw" && details.score > 0 && (
                                <span className="font-bold text-slate-800 dark:text-slate-100 text-xs">
                                  {details.score.toFixed(1)}
                                </span>
                              )}
                              {settings.judgingStyle === "placement" && details.placement < 999 && (
                                <span className="text-[10px] text-violet-500 bg-violet-500/10 dark:bg-violet-500/20 px-1 py-0.5 rounded font-bold">
                                  {details.placement === 1 ? "1st" : details.placement === 2 ? "2nd" : details.placement === 3 ? "3rd" : `${details.placement}th`}
                                </span>
                              )}
                              {settings.judgingStyle === "callback" && details.isCallback !== "-" && (
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                  details.isCallback === "Yes" ? "bg-green-500/10 text-green-500" :
                                  details.isCallback.startsWith("Alt") ? "bg-amber-500/10 text-amber-500" :
                                  "bg-slate-500/10 text-slate-500"
                                }`}>
                                  {details.isCallback}
                                </span>
                              )}
                              {settings.judgingStyle !== "callback" && details.isCallback !== "-" && (
                                <span className={`text-[9px] font-bold mt-1 ${
                                  details.isCallback === "Yes" ? "text-green-500" :
                                  details.isCallback.startsWith("Alt") ? "text-amber-500" : "text-slate-500"
                                }`}>
                                  {details.isCallback === "Yes" ? "Yes" : details.isCallback.startsWith("Alt") ? details.isCallback : "No"}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-600 dark:text-slate-600">—</span>
                          )}
                        </td>
                      );
                    })}

                    {/* Final Average */}
                    <td className="p-3 text-right font-mono font-bold">
                      {settings.judgingStyle === "raw" ? (
                        <span className="text-violet-500">{res.averageScore.toFixed(2)}</span>
                      ) : settings.judgingStyle === "placement" ? (
                        <span className="text-violet-500">{res.averagePlacement === 999 ? "—" : res.averagePlacement.toFixed(2)}</span>
                      ) : (
                        <span className="text-emerald-500">{res.prelimPoints !== undefined ? `${res.prelimPoints.toFixed(1)} pts` : `${res.yesCount} Yes`}</span>
                      )}
                    </td>

                    {/* Callback metrics if applicable */}
                    {isCallbackHeat && (
                      <>
                        <td className="p-3 text-center font-mono font-semibold">
                          <span className="text-green-500">{res.yesCount}Y</span>
                          <span className="text-slate-400 mx-1">/</span>
                          <span className="text-amber-500">{res.altCount}A</span>
                          <span className="text-slate-400 mx-1">/</span>
                          <span className="text-rose-500">{res.noCount}N</span>
                        </td>
                        <td className="p-3 text-right">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            res.qualified
                              ? "bg-green-500/10 text-green-500"
                              : res.isAlternate
                                ? "bg-amber-500/10 text-amber-500"
                                : "bg-slate-500/10 text-slate-500"
                          }`}>
                            {res.qualified ? (
                              <>
                                <Check className="w-3 h-3" />
                                Callback Cut
                              </>
                            ) : res.isAlternate ? (
                              <>
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                Alt {res.alternateRank}
                              </>
                            ) : (
                              "Cut"
                            )}
                          </span>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
              {results.length === 0 && (
                <tr>
                  <td colSpan={10} className="p-6 text-center text-slate-500">
                    No competitor entries found in this heat directory.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Callback Division Boundary visual indicator */}
        {isCallbackHeat && results.length > 0 && (
          <div className="mt-4 p-4 rounded-xl bg-green-500/[0.03] border border-green-500/10 text-slate-400 text-xs flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
              <span>
                The callback threshold is currently set to <strong>{hCallbackCount}</strong>. Dancers listed as <strong>"Callback Cut"</strong> have qualified for the next rounds.
              </span>
            </div>
            {hAlternateCount > 0 && (
              <div className="flex items-center gap-2 pl-6">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                <span>
                  The alternate threshold is set to <strong>{hAlternateCount}</strong>. Dancers listed as <strong>"Alt 1-{hAlternateCount}"</strong> are designated alternates in order of ranking.
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
