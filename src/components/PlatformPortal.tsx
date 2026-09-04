import React from "react";
import { ShieldAlert, Award, UserCheck, Users, Landmark, ExternalLink, Globe, KeyRound, Trophy, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { AppSettings } from "../types";

interface PlatformPortalProps {
  isDarkMode: boolean;
  settings?: AppSettings;
  onUpdateSettings?: (newSettings: Partial<AppSettings>) => Promise<void>;
}

export default function PlatformPortal({ isDarkMode, settings, onUpdateSettings }: PlatformPortalProps) {
  const [expandedHeatIds, setExpandedHeatIds] = React.useState<Record<string, boolean>>({});

  const toggleHeatExpand = (id: string) => {
    setExpandedHeatIds(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const systems = [
    {
      title: "Admin Control Panel",
      domain: "admin.swingscore.com",
      path: "/admin",
      query: "?role=admin",
      passcode: "admin",
      description: "Manage competitor databases, activate division heats, configure relative placement options, and toggle simulation modules.",
      icon: <ShieldAlert className="w-5 h-5 text-rose-500" />,
      color: "border-rose-500/20 hover:border-rose-500/40 bg-rose-500/[0.02]"
    },
    {
      title: "Judge Station Portal",
      domain: "judge.swingscore.com",
      path: "/judge",
      query: "?role=judge",
      passcode: "judge",
      description: "Dedicated real-time digital sheet for registered adjudicators. Record scores or sequential placement rankings securely.",
      icon: <Award className="w-5 h-5 text-amber-500" />,
      color: "border-amber-500/20 hover:border-amber-500/40 bg-amber-500/[0.02]"
    },
    {
      title: "Floor Coordinator Panel",
      domain: "floorcord.swingscore.com",
      path: "/floorcord",
      query: "?role=coordinator",
      passcode: "floor",
      description: "Dancer check-in dashboard and queue staging. Verify competitors as they report for their scheduled heats.",
      icon: <UserCheck className="w-5 h-5 text-emerald-500" />,
      color: "border-emerald-500/20 hover:border-emerald-500/40 bg-emerald-500/[0.02]"
    },
    {
      title: "Dancer Self-Registration",
      domain: "registration.swingscore.com",
      path: "/registration",
      query: "?role=competitor",
      passcode: "register",
      description: "Autonomous registrar kiosk. Competitors can request a bib number and sign up directly into novice, intermediate, or advanced divisions.",
      icon: <Users className="w-5 h-5 text-blue-500" />,
      color: "border-blue-500/20 hover:border-blue-500/40 bg-blue-500/[0.02]"
    },
    {
      title: "Public Results Terminal",
      domain: "results.swingscore.com",
      path: "/results",
      query: "?role=results",
      passcode: "Open Access",
      description: "Spectator scoreboard displaying relative placement rankings, judge vote matrices, callback cuts, and live score synchronization.",
      icon: <Landmark className="w-5 h-5 text-violet-500" />,
      color: "border-violet-500/20 hover:border-violet-500/40 bg-violet-500/[0.02]"
    },
    {
      title: "Scoring & Results Ledger",
      domain: "scoring.swingscore.com",
      path: "/scoring",
      query: "?role=scoring",
      passcode: "scoring",
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
        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-violet-600/10 text-violet-500 rounded-full font-mono font-bold text-[10px] uppercase border border-violet-500/20">
          <Globe className="w-3.5 h-3.5 animate-spin-slow" /> Isolated Virtual Domains Enabled
        </span>
        <h1 className="text-3xl font-extrabold tracking-tight mt-3 text-slate-900 dark:text-slate-100">
          SwingScore Distributed Network
        </h1>
        <p className="text-xs text-slate-400 mt-2 max-w-lg mx-auto leading-relaxed">
          In alignment with modern security architectures, our sub-systems are hosted on fully segregated custom domains.
          Dancers, coordinators, judges, and administrators operate on separate virtual environments with independent access keys.
        </p>
      </div>

      {/* Registration Toggle Hub */}
      <div className={`p-6 rounded-2xl border mb-10 transition-all ${
        isDarkMode ? "bg-slate-900/60 border-slate-800" : "bg-white border-slate-200 shadow-sm"
      }`}>
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-xl border ${
              settings?.registrationEnabled !== false
                ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-500"
                : "bg-amber-500/10 border-amber-500/25 text-amber-500"
            }`}>
              <Users className="w-6 h-6" />
            </div>
            <div className="text-left">
              <h2 className="text-sm font-extrabold tracking-tight">Competitor Registration Control</h2>
              <p className="text-xs text-slate-400 mt-1">
                {settings?.registrationEnabled !== false
                  ? "Status: OPEN — Competitors can self-register into rosters."
                  : "Status: CLOSED — Dancer self-registration is suspended."}
              </p>
            </div>
          </div>
          {onUpdateSettings && (
            <button
              onClick={() => onUpdateSettings({ registrationEnabled: settings?.registrationEnabled === false ? true : false })}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
                settings?.registrationEnabled !== false
                  ? "bg-rose-600 hover:bg-rose-700 text-white shadow-md shadow-rose-600/10"
                  : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/10"
              }`}
            >
              {settings?.registrationEnabled !== false ? "Close Registration" : "Open Registration"}
            </button>
          )}
        </div>
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
                  Passcode: <strong className="text-slate-300">{sys.passcode}</strong>
                </span>
              </div>

              <h3 className="text-base font-bold tracking-tight text-slate-900 dark:text-slate-100">{sys.title}</h3>
              <p className="text-[10px] text-violet-400 font-mono mt-0.5">{sys.domain}</p>
              
              <p className="text-xs text-slate-400 mt-2.5 leading-relaxed font-normal">
                {sys.description}
              </p>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
              <span className="text-[10px] font-mono text-slate-500">Slug: {sys.query}</span>
              
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
                              <th className="p-2 w-12 text-center font-bold">Rank</th>
                              <th className="p-2 w-16 text-center font-bold">Bib</th>
                              <th className="p-2 font-bold">Competitor / Couple Name</th>
                              <th className="p-2 text-right font-bold">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {contest.rankings.map((ranking) => {
                              const isPodium = ranking.rank <= 3;
                              return (
                                <tr
                                  key={ranking.bib}
                                  className={`border-b border-slate-100 dark:border-slate-800/50 last:border-0 ${
                                    isPodium ? "bg-amber-500/[0.01]" : ""
                                  }`}
                                >
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
                                  <td className="p-2 text-center font-mono font-bold text-slate-400">
                                    {ranking.bib}
                                  </td>
                                  <td className="p-2 font-medium text-slate-300">
                                    {ranking.name}
                                  </td>
                                  <td className="p-2 text-right">
                                    {contest.heatType === "Finals" ? (
                                      <span className="text-[10px] font-bold font-mono text-amber-500">
                                        Podium Winner
                                      </span>
                                    ) : ranking.qualified ? (
                                      <span className="text-[10px] font-bold font-mono text-emerald-500">
                                        Qualified Callback
                                      </span>
                                    ) : ranking.isAlternate ? (
                                      <span className="text-[10px] font-bold font-mono text-violet-400">
                                        Alternate
                                      </span>
                                    ) : (
                                      <span className="text-[10px] font-mono text-slate-500">
                                        Completed
                                      </span>
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
      </div>

      {/* Production Domain Note */}
      <div className={`mt-8 p-4 rounded-xl border text-center ${
        isDarkMode ? "bg-slate-900/30 border-slate-800/60 text-slate-400" : "bg-white border-slate-200 text-slate-500"
      } text-[11px] leading-relaxed max-w-2xl mx-auto`}>
        💡 <strong>Multi-Tenant Architecture Note:</strong> When deployed to production, these endpoints map seamlessly to their respective DNS zones (e.g., <code className="text-violet-400 bg-violet-400/10 px-1 py-0.5 rounded">judge.swingscore.com</code>). For testing and debugging, selecting a portal above configures the virtual runtime instantly.
      </div>
    </div>
  );
}
