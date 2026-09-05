import React, { useState } from "react";
import { UserCheck, Search, Users, ShieldAlert, CheckSquare, Square, Trash2, Award, Slash, Ban, Lock, X, Edit } from "lucide-react";
import { Competitor, AppSettings, Heat } from "../types";

interface CoordinatorCheckInProps {
  competitors: Competitor[];
  heats?: Heat[];
  onCheckInToggle: (bib: string, currentStatus: boolean, scratched?: boolean, registryPoints?: number) => Promise<void>;
  isDarkMode: boolean;
  settings: AppSettings;
  onUpdateSettings?: (newSettings: Partial<AppSettings>) => Promise<void>;
  onUpdateCompetitor?: (oldBib: string, updates: { bib: string; name: string; email?: string; division: string; role: "Lead" | "Follow"; checkedIn?: boolean; scratched?: boolean }) => Promise<void>;
}

type CheckInTab = "master" | "leaders" | "followers" | "activeHeat";

export default function CoordinatorCheckIn({
  competitors,
  heats = [],
  onCheckInToggle,
  isDarkMode,
  settings,
  onUpdateSettings,
  onUpdateCompetitor
}: CoordinatorCheckInProps) {
  const [activeTab, setActiveTab] = useState<CheckInTab>("master");
  const [search, setSearch] = useState("");
  const [loadingBib, setLoadingBib] = useState<string | null>(null);
  const [finalizeState, setFinalizeState] = useState<"idle" | "success" | "warning">("idle");

  // Competitor editing state
  const [editingCompetitor, setEditingCompetitor] = useState<Competitor | null>(null);
  const [editBib, setEditBib] = useState("");
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState<"Lead" | "Follow">("Lead");
  const [editDivision, setEditDivision] = useState("");
  const [editCheckedIn, setEditCheckedIn] = useState(false);
  const [editScratched, setEditScratched] = useState(false);
  const [editError, setEditError] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const handleOpenEditModal = (c: Competitor) => {
    setEditingCompetitor(c);
    setEditBib(c.bib);
    setEditName(c.name);
    setEditEmail(c.email || "");
    setEditRole(c.role);
    setEditDivision(c.division);
    setEditCheckedIn(c.checkedIn);
    setEditScratched(!!c.scratched);
    setEditError("");
  };

  const handleSaveEdit = async () => {
    if (!editBib.trim()) {
      setEditError("Bib number is required.");
      return;
    }
    if (!editName.trim()) {
      setEditError("Dancer name is required.");
      return;
    }
    if (!editEmail.trim()) {
      setEditError("Email address is required.");
      return;
    }
    if (!editDivision) {
      setEditError("Division is required.");
      return;
    }
    
    setIsSavingEdit(true);
    setEditError("");
    try {
      if (editingCompetitor && onUpdateCompetitor) {
        await onUpdateCompetitor(editingCompetitor.bib, {
          bib: editBib.trim(),
          name: editName.trim(),
          email: editEmail.trim(),
          division: editDivision,
          role: editRole,
          checkedIn: editCheckedIn,
          scratched: editScratched
        });
        setEditingCompetitor(null);
      }
    } catch (err: any) {
      setEditError(err.message || "Failed to update competitor");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const activeHeat = heats.find(h => h.id === settings.currentHeatId);
  const activeHeatCompetitors = activeHeat
    ? activeHeat.competitorBibs
        .flatMap((bib) => {
          const comp = competitors.find((c) => c.bib === bib);
          if (comp) return [comp];
          if (bib.includes("_")) {
            const [leadBib, followBib] = bib.split("_");
            const lead = competitors.find((c) => c.bib === leadBib);
            const follow = competitors.find((c) => c.bib === followBib);
            
            const result: Competitor[] = [];
            if (lead) {
              result.push({ ...lead, division: activeHeat.division });
            } else {
              result.push({
                bib: leadBib,
                name: `Lead #${leadBib}`,
                division: activeHeat.division,
                role: "Lead",
                checkedIn: false
              } as Competitor);
            }
            if (follow) {
              result.push({ ...follow, division: activeHeat.division });
            } else {
              result.push({
                bib: followBib,
                name: `Follow #${followBib}`,
                division: activeHeat.division,
                role: "Follow",
                checkedIn: false
              } as Competitor);
            }
            return result;
          }
          return [];
        })
        .filter((c): c is Competitor => !!c)
    : [];

  const isJackAndJill = activeHeat
    ? (activeHeat.contestType === "Jack & Jill" || settings.contestType === "Jack & Jill" || (!activeHeat.contestType && !settings.contestType))
    : true;

  const getDivBadge = (div: string) => {
    let label = div;
    let bgClass = "bg-slate-500/10 text-slate-500 border-slate-500/20";
    
    if (div === "Newcomer") {
      label = "NC";
      bgClass = "bg-sky-500/10 text-sky-500 border-sky-500/20";
    } else if (div === "Novice") {
      label = "NV";
      bgClass = "bg-indigo-500/10 text-indigo-500 border-indigo-500/20";
    } else if (div === "Intermediate") {
      label = "IN";
      bgClass = "bg-amber-500/10 text-amber-500 border-amber-500/20";
    } else if (div === "Advance" || div === "Advanced") {
      label = "AD";
      bgClass = "bg-purple-500/10 text-purple-500 border-purple-500/20";
    } else if (div === "All-Star" || div === "All Star" || div === "AllStar") {
      label = "AS";
      bgClass = "bg-pink-500/10 text-pink-500 border-pink-500/20";
    } else if (div === "Pro") {
      label = "Pro";
      bgClass = "bg-rose-500/10 text-rose-500 border-rose-500/20";
    }

    return (
      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${bgClass}`}>
        {label}
      </span>
    );
  };

  const getRoleBadge = (role: string) => {
    const label = role === "Lead" ? "L" : role === "Follow" ? "F" : role;
    const bgClass = role === "Lead" 
      ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" 
      : "bg-rose-500/10 text-rose-500 border-rose-500/20";
    
    return (
      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${bgClass}`}>
        {label}
      </span>
    );
  };

  const getCheckInStatusBadge = (c: Competitor) => {
    let dotColor = "bg-amber-500";
    let label = "Not Checked-in";
    let bgClass = "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";

    if (c.scratched) {
      dotColor = "bg-rose-500";
      label = "Scratched";
      bgClass = "bg-rose-500/10 text-rose-500 border-rose-500/20";
    } else if (c.checkedIn) {
      dotColor = "bg-green-500";
      label = "Checked-in";
      bgClass = "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20";
    }

    return (
      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border ${bgClass}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`}></span>
        {label}
      </span>
    );
  };

  if (settings.checkInEnabled === false) {
    return (
      <div className="max-w-md w-full mx-auto my-12 animate-fade-in">
        <div className={`p-8 rounded-3xl border text-center transition-all ${
          isDarkMode 
            ? "bg-slate-900 border-slate-800 text-slate-100 shadow-2xl" 
            : "bg-white border-slate-200 text-slate-800 shadow-xl"
        }`}>
          <div className="p-4 rounded-2xl mb-4 border border-rose-500/25 text-rose-500 bg-rose-500/5 inline-block">
            <Lock className="w-10 h-10" />
          </div>
          
          <h2 className="text-xl font-bold tracking-tight mt-2 text-slate-100 dark:text-slate-100">Portal Suspended</h2>
          <p className="text-xs text-slate-400 mt-2 leading-relaxed">
            The Contest Coordinator Check-In Portal is currently locked by the event administration. Roster check-ins cannot be modified at this time.
          </p>
        </div>
      </div>
    );
  }

  // Filter lists
  const getFilteredCompetitors = () => {
    return activeHeatCompetitors.filter((c) => {
      const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase()) || c.bib.includes(search);
      if (activeTab === "leaders") return matchesSearch && c.role === "Lead";
      if (activeTab === "followers") return matchesSearch && c.role === "Follow";
      return matchesSearch;
    });
  };

  const handleToggleCheckIn = async (bib: string, currentStatus: boolean) => {
    setLoadingBib(bib);
    try {
      if (bib.includes("_")) {
        const [leadBib, followBib] = bib.split("_");
        await onCheckInToggle(leadBib, !currentStatus);
        await onCheckInToggle(followBib, !currentStatus);
      } else {
        await onCheckInToggle(bib, !currentStatus);
      }
      if (settings.checkInFinalized) {
        await onUpdateSettings?.({ checkInFinalized: false });
      }
    } catch (err) {
      console.error("Failed to toggle check-in", err);
    } finally {
      setLoadingBib(null);
    }
  };

  const handleToggleScratch = async (bib: string, currentScratched: boolean) => {
    setLoadingBib(bib);
    try {
      if (bib.includes("_")) {
        const [leadBib, followBib] = bib.split("_");
        const lead = competitors.find(c => c.bib === leadBib);
        const follow = competitors.find(c => c.bib === followBib);
        await onCheckInToggle(leadBib, lead?.checkedIn || false, !currentScratched);
        await onCheckInToggle(followBib, follow?.checkedIn || false, !currentScratched);
      } else {
        await onCheckInToggle(bib, competitors.find(c => c.bib === bib)?.checkedIn || false, !currentScratched);
      }
      if (settings.checkInFinalized) {
        await onUpdateSettings?.({ checkInFinalized: false });
      }
    } catch (err) {
      console.error("Failed to toggle scratch status", err);
    } finally {
      setLoadingBib(null);
    }
  };

  const handlePointsChange = async (bib: string, points: number) => {
    try {
      const current = competitors.find(c => c.bib === bib);
      await onCheckInToggle(bib, current?.checkedIn || false, current?.scratched || false, points);
    } catch (err) {
      console.error("Failed to update registry points", err);
    }
  };

  const filteredCompetitors = getFilteredCompetitors();

  const filteredLeads = activeHeatCompetitors.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase()) || c.bib.includes(search);
    return matchesSearch && c.role === "Lead";
  });

  const filteredFollows = activeHeatCompetitors.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase()) || c.bib.includes(search);
    return matchesSearch && c.role === "Follow";
  });

  // Stats
  const activeCompetitors = activeHeatCompetitors.filter(c => !c.scratched);
  const totalCount = activeCompetitors.length;
  const checkedInCount = activeCompetitors.filter((c) => c.checkedIn).length;
  
  const leadsTotal = activeCompetitors.filter((c) => c.role === "Lead").length;
  const leadsCheckedIn = activeCompetitors.filter((c) => c.role === "Lead" && c.checkedIn).length;
  
  const followsTotal = activeCompetitors.filter((c) => c.role === "Follow").length;
  const followsCheckedIn = activeCompetitors.filter((c) => c.role === "Follow" && c.checkedIn).length;

  const scratchedCount = activeHeatCompetitors.filter(c => c.scratched).length;

  const getCheckInPercent = (checked: number, total: number) => {
    if (total === 0) return 0;
    return Math.round((checked / total) * 100);
  };

  return (
    <div className="space-y-6">
      {settings.checkInFinalized && (
        <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400 text-xs flex items-center justify-between gap-3 animate-fade-in shadow-xs">
          <div className="flex items-center gap-2.5">
            <CheckSquare className="w-5 h-5 flex-shrink-0 text-green-500 animate-pulse" />
            <div>
              <strong className="block text-sm font-bold text-green-500">Competitor Check-In Finalized!</strong>
              <span className="text-[11px] text-slate-400">All contestant statuses are frozen. Active rosters have been successfully synchronized to the central scoring engine.</span>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded bg-green-500 text-slate-950 font-mono text-[9px] font-bold uppercase tracking-wider">
            LOCKED & VERIFIED
          </span>
        </div>
      )}

      {/* Overview Stats Block */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Master Check In Stats */}
        <div className={`p-5 rounded-2xl border transition-all ${isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100 shadow-sm"}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-400 font-mono">Master Check-In</span>
            <span className="text-xs font-mono text-violet-500 font-bold">{checkedInCount} / {totalCount} ({getCheckInPercent(checkedInCount, totalCount)}%)</span>
          </div>
          <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-2">
            <div
              className="bg-violet-600 h-2 rounded-full transition-all duration-500"
              style={{ width: `${getCheckInPercent(checkedInCount, totalCount)}%` }}
            />
          </div>
        </div>

        {/* Leaders Check In Stats */}
        <div className={`p-5 rounded-2xl border transition-all ${isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100 shadow-sm"}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-400 font-mono">Leaders Checked-In</span>
            <span className="text-xs font-mono text-emerald-500 font-bold">{leadsCheckedIn} / {leadsTotal} ({getCheckInPercent(leadsCheckedIn, leadsTotal)}%)</span>
          </div>
          <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-2">
            <div
              className="bg-emerald-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${getCheckInPercent(leadsCheckedIn, leadsTotal)}%` }}
            />
          </div>
        </div>

        {/* Followers Check In Stats */}
        <div className={`p-5 rounded-2xl border transition-all ${isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100 shadow-sm"}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-400 font-mono">Followers Checked-In</span>
            <span className="text-xs font-mono text-rose-500 font-bold">{followsCheckedIn} / {followsTotal} ({getCheckInPercent(followsCheckedIn, followsTotal)}%)</span>
          </div>
          <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-2">
            <div
              className="bg-rose-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${getCheckInPercent(followsCheckedIn, followsTotal)}%` }}
            />
          </div>
        </div>

        {/* Scratch Count Stats */}
        <div className={`p-5 rounded-2xl border transition-all ${isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100 shadow-sm"}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-400 font-mono">Scratched (Disqualified)</span>
            <span className="text-xs font-mono text-amber-500 font-bold">{scratchedCount} total</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] bg-amber-500/10 text-amber-500 px-2.5 py-0.5 rounded font-mono font-bold uppercase border border-amber-500/10">
              {scratchedCount > 0 ? "Scratches Recorded" : "Clean Roster"}
            </span>
          </div>
        </div>
      </div>

      {/* Sheet Management Interface */}
      <div className={`p-6 rounded-2xl border transition-all ${isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 shadow-sm text-slate-800"}`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 border-b border-slate-200 dark:border-slate-800 pb-4">
          {/* Header Description */}
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold tracking-tight">Competitor Check-In Board</h2>
              {activeHeat ? (
                <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-bold font-mono bg-green-500/10 text-green-500 border border-green-500/25 uppercase tracking-wider">
                  Active Contest: {activeHeat.name}
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-bold font-mono bg-amber-500/10 text-amber-500 border border-amber-500/25 uppercase tracking-wider animate-pulse">
                  No Active Contest Selected
                </span>
              )}
            </div>
            {activeHeat ? (
              <p className="text-xs text-slate-400 mt-1">
                Currently checking-in for: <strong className="text-violet-500">{activeHeat.name}</strong> ({activeHeat.division} — {activeHeat.role} Roles)
              </p>
            ) : (
              <p className="text-xs text-slate-400 mt-1">
                Please select and activate a contest check-in sheet in the Admin Panel to begin checking in competitors.
              </p>
            )}
          </div>

          {/* Tab Selection */}
          {activeHeat && (
            <div className="flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <button
                id="checkin-tab-master"
                onClick={() => { setActiveTab("master"); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeTab === "master"
                    ? "bg-violet-600 text-white shadow-sm"
                    : "text-slate-600 dark:text-slate-300 hover:bg-slate-250 dark:hover:bg-slate-700/50"
                }`}
              >
                Master Sheet
              </button>
              <button
                id="checkin-tab-leads"
                onClick={() => { setActiveTab("leaders"); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeTab === "leaders"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-slate-600 dark:text-slate-300 hover:bg-slate-250 dark:hover:bg-slate-700/50"
                }`}
              >
                Leaders Sheet
              </button>
              <button
                id="checkin-tab-follows"
                onClick={() => { setActiveTab("followers"); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeTab === "followers"
                    ? "bg-rose-600 text-white shadow-sm"
                    : "text-slate-600 dark:text-slate-300 hover:bg-slate-250 dark:hover:bg-slate-700/50"
                }`}
              >
                Followers Sheet
              </button>
            </div>
          )}
        </div>

        {!activeHeat ? (
          <div className="p-12 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl my-4">
            <UserCheck className="w-10 h-10 text-slate-400 mx-auto mb-3 animate-bounce" />
            <h3 className="text-sm font-bold text-slate-300">No Active Contest Selected for Check-In</h3>
            <p className="text-xs text-slate-500 mt-2 max-w-sm mx-auto leading-relaxed">
              To check in competitors, you must first create a Contest Check-In Sheet inside the Admin Panel and select it as the actively running Live Contest.
            </p>
          </div>
        ) : (
          <>
            {/* Search */}
            <div className="mb-4 relative flex items-center">
              <Search className="w-4 h-4 absolute left-3 text-slate-400" />
              <input
                id="checkin-search-input"
                type="text"
                placeholder={`Search ${activeTab === "master" ? "all" : activeTab} by name or bib...`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={`w-full pl-9 pr-10 py-2 text-xs rounded-xl border focus:outline-none focus:ring-1 focus:ring-violet-500 ${
                  isDarkMode ? "bg-slate-800 border-slate-700 text-slate-100 placeholder-slate-500" : "bg-slate-50 border-slate-200 text-slate-800"
                }`}
              />
              {search && (
                <button
                  id="clear-search-btn"
                  onClick={() => setSearch("")}
                  className="absolute right-3 text-slate-400 hover:text-slate-100 transition-colors p-1 rounded-full hover:bg-slate-700/50 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* List of competitors */}
            <div className="relative">
          {settings.checkInFinalized && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-900/5 dark:bg-slate-950/10 backdrop-blur-[0.5px] rounded-2xl">
              <div className="bg-slate-900/90 dark:bg-slate-950/95 text-white border border-slate-800 p-4 rounded-xl shadow-xl flex flex-col items-center text-center gap-2 max-w-sm pointer-events-auto">
                <Lock className="w-8 h-8 text-amber-500 animate-pulse" />
                <h4 className="text-sm font-bold uppercase tracking-wider text-amber-500 font-mono">Roster Finalized & Locked</h4>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Competitor check-in registration has been completed. All statuses are currently locked on the active live floor.
                </p>
                <button
                  type="button"
                  onClick={async () => {
                    setFinalizeState("idle");
                    await onUpdateSettings?.({ checkInFinalized: false });
                  }}
                  className="mt-2 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-colors cursor-pointer"
                >
                  Unlock & Reopen Sheet
                </button>
              </div>
            </div>
          )}

          <div className={`transition-all duration-300 ${settings.checkInFinalized ? "opacity-30 grayscale select-none pointer-events-none" : ""}`}>
            {activeTab === "master" ? (
          <div className="space-y-6">
            {/* Next Heat Overlay Button */}
            {settings.queuedHeatId && (() => {
              const nextHeat = heats.find(h => h.id === settings.queuedHeatId);
              const isReady = settings.checkInFinalized;
              return (
                <button
                  type="button"
                  onClick={() => {
                    if (!isReady) {
                      const el = document.getElementById("finalize-checkin-btn");
                      if (el) {
                        el.scrollIntoView({ behavior: "smooth" });
                        el.classList.add("ring-4", "ring-violet-500");
                        setTimeout(() => el.classList.remove("ring-4", "ring-violet-500"), 2000);
                      } else {
                        alert("Please scroll down to the bottom and finalize check-in to ready this heat.");
                      }
                    } else {
                      alert(`Next heat "${nextHeat?.name || "Upcoming Heat"}" is fully ready! The Floor Coordinator can prepare competitors to go on stage.`);
                    }
                  }}
                  className="w-full text-left relative z-10 animate-fade-in hover:scale-[1.01] transition-all bg-gradient-to-r from-violet-600/10 to-indigo-600/10 hover:from-violet-600/20 hover:to-indigo-600/20 border border-violet-500/30 p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md cursor-pointer backdrop-blur-xs"
                >
                  <div className="flex items-center gap-3">
                    <span className="relative flex h-3 w-3">
                      {isReady ? (
                        <>
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                        </>
                      ) : (
                        <>
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                        </>
                      )}
                    </span>
                    <div>
                      <h4 className="text-sm font-bold font-mono tracking-tight text-violet-500 dark:text-violet-400">
                        NEXT HEAT QUEUED: <span className="text-slate-800 dark:text-slate-200 uppercase">{nextHeat?.name || "Upcoming Heat"}</span>
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {isReady 
                          ? "✓ Check-in finalized. The next group is ready for the floor coordinator's call. Click to verify." 
                          : "⚠️ Check-in not finalized. Click here to go to finalize check-in and ready this heat."}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className={`px-2.5 py-1 text-[10px] font-bold font-mono uppercase tracking-wider rounded-full border ${
                      isReady 
                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400" 
                        : "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400 animate-pulse"
                    }`}>
                      {isReady ? "Ready to Go" : "Not Ready"}
                    </span>
                  </div>
                </button>
              );
            })()}

            {true ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Leaders Column */}
                <div className={`p-4 rounded-xl border ${isDarkMode ? "bg-slate-900/40 border-slate-800 text-slate-100" : "bg-white border-slate-200 shadow-sm text-slate-800"}`}>
                  <h3 className="text-sm font-bold font-mono text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5 border-b pb-2 border-slate-150 dark:border-slate-800">
                    <span className={`w-2.5 h-2.5 rounded-full ${leadsCheckedIn > 0 && leadsCheckedIn === leadsTotal ? "bg-green-500 animate-pulse" : "bg-amber-500"}`}></span>
                    Leaders ({filteredLeads.length})
                  </h3>
                  <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className={`${isDarkMode ? "bg-slate-800/50 text-slate-300" : "bg-slate-50 text-slate-500"} text-[10px] font-semibold font-mono border-b border-slate-200 dark:border-slate-800`}>
                          <th className="p-3 w-16">Bib</th>
                          <th className="p-3">Competitor & Badges</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                        {filteredLeads.length > 0 ? (
                          filteredLeads.map((c) => {
                            const heatLeads = activeHeatCompetitors.filter(hl => hl.role === "Lead");
                            const roleSpecificIndex = heatLeads.findIndex(hl => hl.bib === c.bib);
                            const isSplitActive = roleSpecificIndex !== -1 && (activeHeat?.splits || []).includes(roleSpecificIndex);
                            
                            let nextHeatNum = 1;
                            if (isSplitActive && activeHeat) {
                              const splitsBefore = (activeHeat.splits || []).filter(s => s <= roleSpecificIndex).length;
                              nextHeatNum = splitsBefore + 1;
                            }

                            return (
                              <React.Fragment key={c.bib}>
                                {isSplitActive && (
                                  <tr className="print:break-before-page">
                                    <td colSpan={2} className="p-2.5 bg-violet-500/5 dark:bg-violet-500/15 border-y border-dashed border-violet-500/20 text-center font-mono text-[9px] font-bold text-violet-500 uppercase tracking-widest">
                                      GAP: HEAT {nextHeatNum} STARTING HERE
                                    </td>
                                  </tr>
                                )}
                                <tr 
                                  className={`transition-all ${
                                    c.scratched 
                                      ? "bg-slate-500/5 dark:bg-slate-500/[0.02] text-slate-400 dark:text-slate-500 line-through decoration-rose-500/40" 
                                      : "hover:bg-slate-50/50 dark:hover:bg-slate-800/20"
                                  }`}
                                >
                                  <td className={`p-3 font-mono font-bold ${c.scratched ? "text-slate-500" : "text-violet-500"} align-top text-sm md:text-base`}>#{c.bib}</td>
                                  <td className="p-3 align-top">
                                    <div>
                                      <div className="text-sm md:text-base font-bold flex items-center gap-2">
                                        <span>{c.name}</span>
                                        {c.scratched && (
                                          <span className="text-[9px] bg-rose-500/10 text-rose-500 px-1 py-0.2 rounded font-mono font-bold uppercase">Scratched</span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                                        {getDivBadge(c.division)}
                                        {getRoleBadge(c.role)}
                                        {getCheckInStatusBadge(c)}
                                      </div>
                                      
                                      {/* Quick actions on Master Sheet */}
                                      <div className="flex items-center gap-1.5 mt-3 pt-2 border-t border-slate-100 dark:border-slate-800/40 flex-wrap">
                                        <button
                                          onClick={() => handleToggleCheckIn(c.bib, c.checkedIn)}
                                          disabled={loadingBib === c.bib || c.scratched}
                                          className={`px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider transition-all border ${
                                            c.checkedIn && !c.scratched
                                              ? "bg-green-500/10 text-green-500 border-green-500/20 hover:bg-green-500/20"
                                              : isDarkMode
                                                ? "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750 disabled:opacity-50"
                                                : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                                          }`}
                                        >
                                          {c.checkedIn && !c.scratched ? "Checked In" : "Check In"}
                                        </button>
                                        <button
                                          onClick={() => handleToggleScratch(c.bib, c.scratched || false)}
                                          disabled={loadingBib === c.bib}
                                          className={`px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider transition-all border ${
                                            c.scratched
                                              ? "bg-amber-500/10 text-amber-500 border-amber-500/20 hover:bg-amber-500/20"
                                              : "bg-rose-500/10 text-rose-500 border-rose-500/10 hover:bg-rose-500/20"
                                          }`}
                                        >
                                          {c.scratched ? "Unscratch" : "Scratch"}
                                        </button>
                                        <button
                                          onClick={() => handleOpenEditModal(c)}
                                          className="px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider transition-all border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-850 text-slate-500 hover:text-slate-300"
                                        >
                                          Edit
                                        </button>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              </React.Fragment>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={2} className="p-4 text-center text-slate-500 text-[11px]">
                              No leaders match search.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Followers Column */}
                <div className={`p-4 rounded-xl border ${isDarkMode ? "bg-slate-900/40 border-slate-800 text-slate-100" : "bg-white border-slate-200 shadow-sm text-slate-800"}`}>
                  <h3 className="text-sm font-bold font-mono text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5 border-b pb-2 border-slate-150 dark:border-slate-800">
                    <span className={`w-2.5 h-2.5 rounded-full ${followsCheckedIn > 0 && followsCheckedIn === followsTotal ? "bg-green-500 animate-pulse" : "bg-amber-500"}`}></span>
                    Followers ({filteredFollows.length})
                  </h3>
                  <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className={`${isDarkMode ? "bg-slate-800/50 text-slate-300" : "bg-slate-50 text-slate-500"} text-[10px] font-semibold font-mono border-b border-slate-200 dark:border-slate-800`}>
                          <th className="p-3 w-16">Bib</th>
                          <th className="p-3">Competitor & Badges</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                        {filteredFollows.length > 0 ? (
                          filteredFollows.map((c) => {
                            const heatFollows = activeHeatCompetitors.filter(hf => hf.role === "Follow");
                            const roleSpecificIndex = heatFollows.findIndex(hf => hf.bib === c.bib);
                            const isSplitActive = roleSpecificIndex !== -1 && (activeHeat?.splits || []).includes(roleSpecificIndex);
                            
                            let nextHeatNum = 1;
                            if (isSplitActive && activeHeat) {
                              const splitsBefore = (activeHeat.splits || []).filter(s => s <= roleSpecificIndex).length;
                              nextHeatNum = splitsBefore + 1;
                            }

                            return (
                              <React.Fragment key={c.bib}>
                                {isSplitActive && (
                                  <tr className="print:break-before-page">
                                    <td colSpan={2} className="p-2.5 bg-violet-500/5 dark:bg-violet-500/15 border-y border-dashed border-violet-500/20 text-center font-mono text-[9px] font-bold text-violet-500 uppercase tracking-widest">
                                      GAP: HEAT {nextHeatNum} STARTING HERE
                                    </td>
                                  </tr>
                                )}
                                <tr 
                                  className={`transition-all ${
                                    c.scratched 
                                      ? "bg-slate-500/5 dark:bg-slate-500/[0.02] text-slate-400 dark:text-slate-500 line-through decoration-rose-500/40" 
                                      : "hover:bg-slate-50/50 dark:hover:bg-slate-800/20"
                                  }`}
                                >
                                  <td className={`p-3 font-mono font-bold ${c.scratched ? "text-slate-500" : "text-violet-500"} align-top text-sm md:text-base`}>#{c.bib}</td>
                                  <td className="p-3 align-top">
                                    <div>
                                      <div className="text-sm md:text-base font-bold flex items-center gap-2">
                                        <span>{c.name}</span>
                                        {c.scratched && (
                                          <span className="text-[9px] bg-rose-500/10 text-rose-500 px-1 py-0.2 rounded font-mono font-bold uppercase">Scratched</span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                                        {getDivBadge(c.division)}
                                        {getRoleBadge(c.role)}
                                        {getCheckInStatusBadge(c)}
                                      </div>
                                      
                                      {/* Quick actions on Master Sheet */}
                                      <div className="flex items-center gap-1.5 mt-3 pt-2 border-t border-slate-100 dark:border-slate-800/40 flex-wrap">
                                        <button
                                          onClick={() => handleToggleCheckIn(c.bib, c.checkedIn)}
                                          disabled={loadingBib === c.bib || c.scratched}
                                          className={`px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider transition-all border ${
                                            c.checkedIn && !c.scratched
                                              ? "bg-green-500/10 text-green-500 border-green-500/20 hover:bg-green-500/20"
                                              : isDarkMode
                                                ? "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750 disabled:opacity-50"
                                                : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                                          }`}
                                        >
                                          {c.checkedIn && !c.scratched ? "Checked In" : "Check In"}
                                        </button>
                                        <button
                                          onClick={() => handleToggleScratch(c.bib, c.scratched || false)}
                                          disabled={loadingBib === c.bib}
                                          className={`px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider transition-all border ${
                                            c.scratched
                                              ? "bg-amber-500/10 text-amber-500 border-amber-500/20 hover:bg-amber-500/20"
                                              : "bg-rose-500/10 text-rose-500 border-rose-500/10 hover:bg-rose-500/20"
                                          }`}
                                        >
                                          {c.scratched ? "Unscratch" : "Scratch"}
                                        </button>
                                        <button
                                          onClick={() => handleOpenEditModal(c)}
                                          className="px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider transition-all border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-850 text-slate-500 hover:text-slate-300"
                                        >
                                          Edit
                                        </button>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              </React.Fragment>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={2} className="p-4 text-center text-slate-500 text-[11px]">
                              No followers match search.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <div className={`p-4 rounded-xl border ${isDarkMode ? "bg-slate-900/40 border-slate-800 text-slate-100" : "bg-white border-slate-200 shadow-sm text-slate-800"}`}>
                <h3 className="text-sm font-bold font-mono text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5 border-b pb-2 border-slate-150 dark:border-slate-800">
                  <span className={`w-2.5 h-2.5 rounded-full ${checkedInCount === totalCount && totalCount > 0 ? "bg-green-500 animate-pulse" : "bg-amber-500"}`}></span>
                  Couples ({activeHeatCompetitors.length})
                </h3>
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className={`${isDarkMode ? "bg-slate-800/50 text-slate-300" : "bg-slate-50 text-slate-500"} text-[10px] font-semibold font-mono border-b border-slate-200 dark:border-slate-800`}>
                        <th className="p-3 w-28">Couple Bib</th>
                        <th className="p-3">Competitors & Badges</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                      {activeHeatCompetitors.length > 0 ? (
                        activeHeatCompetitors.map((c) => {
                          const originalIndex = activeHeat ? activeHeat.competitorBibs.indexOf(c.bib) : -1;
                          const isSplitActive = originalIndex !== -1 && (activeHeat?.splits || []).includes(originalIndex);
                          
                          let nextHeatNum = 1;
                          if (isSplitActive && activeHeat) {
                            const splitsBefore = (activeHeat.splits || []).filter(s => s <= originalIndex).length;
                            nextHeatNum = splitsBefore + 1;
                          }

                          return (
                            <React.Fragment key={c.bib}>
                              {isSplitActive && (
                                <tr className="print:break-before-page">
                                  <td colSpan={2} className="p-2.5 bg-violet-500/5 dark:bg-violet-500/15 border-y border-dashed border-violet-500/20 text-center font-mono text-[9px] font-bold text-violet-500 uppercase tracking-widest">
                                    GAP: HEAT {nextHeatNum} STARTING HERE
                                  </td>
                                </tr>
                              )}
                              <tr 
                                className={`transition-all ${
                                  c.scratched 
                                    ? "bg-slate-500/5 dark:bg-slate-500/[0.02] text-slate-400 dark:text-slate-500 line-through decoration-rose-500/40" 
                                    : "hover:bg-slate-50/50 dark:hover:bg-slate-800/20"
                                }`}
                              >
                                <td className={`p-3 font-mono font-bold ${c.scratched ? "text-slate-500" : "text-violet-500"} align-top text-sm md:text-base`}>#{c.bib}</td>
                                <td className="p-3 align-top">
                                  <div>
                                    <div className="text-sm md:text-base font-bold flex items-center gap-2">
                                      <span>{c.name}</span>
                                      {c.scratched && (
                                        <span className="text-[9px] bg-rose-500/10 text-rose-500 px-1.5 py-0.2 rounded font-mono font-bold uppercase">Scratched</span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                                      {getDivBadge(c.division)}
                                      <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold bg-violet-500/10 text-violet-500 border border-violet-500/20">Couple</span>
                                      {getCheckInStatusBadge(c)}
                                    </div>
                                    
                                    {/* Quick actions on Master Sheet */}
                                    <div className="flex items-center gap-1.5 mt-3 pt-2 border-t border-slate-100 dark:border-slate-800/40 flex-wrap">
                                      <button
                                        onClick={() => handleToggleCheckIn(c.bib, c.checkedIn)}
                                        disabled={loadingBib === c.bib || c.scratched}
                                        className={`px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider transition-all border ${
                                          c.checkedIn && !c.scratched
                                            ? "bg-green-500/10 text-green-500 border-green-500/20 hover:bg-green-500/20"
                                            : isDarkMode
                                              ? "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750 disabled:opacity-50"
                                              : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                                        }`}
                                      >
                                        {c.checkedIn && !c.scratched ? "Checked In" : "Check In"}
                                      </button>
                                      <button
                                        onClick={() => handleToggleScratch(c.bib, c.scratched || false)}
                                        disabled={loadingBib === c.bib}
                                        className={`px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider transition-all border ${
                                          c.scratched
                                            ? "bg-amber-500/10 text-amber-500 border-amber-500/20 hover:bg-amber-500/20"
                                            : "bg-rose-500/10 text-rose-500 border-rose-500/10 hover:bg-rose-500/20"
                                        }`}
                                      >
                                        {c.scratched ? "Unscratch" : "Scratch"}
                                      </button>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            </React.Fragment>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={2} className="p-4 text-center text-slate-500 text-[11px]">
                            No couples match search.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Finalize Button with Prompt */}
            <div className={`p-5 rounded-xl border transition-all ${
              isDarkMode ? "bg-slate-900/60 border-slate-800" : "bg-slate-50 border-slate-200 shadow-sm"
            }`}>
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <h4 className="text-sm font-bold flex items-center gap-2">
                    <CheckSquare className="w-4 h-4 text-violet-500" />
                    Roster Finalization Check
                  </h4>
                  <p className="text-xs text-slate-400 mt-1">
                    Ensure all competitors are present and marked properly before closing check-in registration.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  {settings.checkInFinalized ? (
                    <button
                      id="reopen-checkin-btn"
                      onClick={async () => {
                        setFinalizeState("idle");
                        await onUpdateSettings?.({ checkInFinalized: false });
                      }}
                      className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-sm cursor-pointer"
                    >
                      Reopen Check-In
                    </button>
                  ) : (
                    <button
                      id="finalize-checkin-btn"
                      onClick={async () => {
                        const absentCount = activeHeatCompetitors.filter(c => !c.scratched && !c.checkedIn).length;
                        if (absentCount > 0) {
                          setFinalizeState("warning");
                        } else {
                          setFinalizeState("success");
                          await onUpdateSettings?.({ checkInFinalized: true });
                        }
                      }}
                      className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-sm cursor-pointer"
                    >
                      Finalize Check-In
                    </button>
                  )}
                </div>
              </div>

              {finalizeState === "success" && (
                <div className="mt-4 p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400 text-xs flex items-start gap-3 animate-fade-in">
                  <div className="p-1.5 rounded-full bg-green-500/10 text-green-500 mt-0.5">
                    <CheckSquare className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-bold text-sm">Check-In Completed & Roster Ready!</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Excellent! All active leaders and followers have successfully checked in. The heat sheet is 100% complete and ready to be loaded for judging.
                    </p>
                    <button
                      onClick={() => setFinalizeState("idle")}
                      className="text-[10px] text-violet-500 underline mt-2 font-bold font-mono hover:text-violet-600"
                    >
                      Dismiss Prompt
                    </button>
                  </div>
                </div>
              )}

              {finalizeState === "warning" && (
                <div className="mt-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs flex items-start gap-3 animate-fade-in">
                  <div className="p-1.5 rounded-full bg-amber-500/10 text-amber-500 mt-0.5">
                    <ShieldAlert className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-bold text-sm">Pending Check-Ins Remaining!</p>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      There are still <strong className="text-amber-500 font-mono">{(activeHeatCompetitors.filter(c => !c.scratched && !c.checkedIn).length)}</strong> competitor(s) marked as absent. Please verify if they should be scratched or if they have arrived before finalizing.
                    </p>
                    <div className="flex gap-3 mt-3">
                      <button
                        onClick={async () => {
                          setFinalizeState("success");
                          await onUpdateSettings?.({ checkInFinalized: true });
                        }}
                        className="px-3 py-1.5 bg-amber-500 text-slate-950 font-bold rounded-lg text-[10px] uppercase tracking-wider hover:bg-amber-600 transition-colors"
                      >
                        Force Finalize Anyway
                      </button>
                      <button
                        onClick={() => setFinalizeState("idle")}
                        className="px-3 py-1.5 bg-transparent border border-slate-300 dark:border-slate-700 text-slate-400 rounded-lg text-[10px] uppercase tracking-wider hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                      >
                        Keep Checking In
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className={`${isDarkMode ? "bg-slate-800/50 text-slate-300" : "bg-slate-50 text-slate-500"} text-xs font-semibold font-mono border-b border-slate-200 dark:border-slate-800`}>
                  <th className="p-3 w-16">Bib</th>
                  <th className="p-3">Competitor Name</th>
                  <th className="p-3">Division</th>
                  <th className="p-3">Role</th>
                  <th className="p-3 text-center w-36">Check-In Action</th>
                  <th className="p-3 text-center w-32">Scratch Action</th>
                  <th className="p-3 text-right w-28">Profile Edit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                {filteredCompetitors.length > 0 ? (
                  filteredCompetitors.map((c) => {
                    const roleBibs = activeHeat ? activeHeat.competitorBibs.filter(bib => {
                      const comp = competitors.find(cc => cc.bib === bib);
                      return (comp?.role || "Lead") === (c.role || "Lead");
                    }) : [];
                    const roleSpecificIndex = roleBibs.indexOf(c.bib);
                    const isSplitActive = roleSpecificIndex !== -1 && (activeHeat?.splits || []).includes(roleSpecificIndex);
                    
                    let nextHeatNum = 1;
                    if (isSplitActive && activeHeat) {
                      const splitsBefore = (activeHeat.splits || []).filter(s => s <= roleSpecificIndex).length;
                      nextHeatNum = splitsBefore + 1;
                    }

                    return (
                      <React.Fragment key={c.bib}>
                        {isSplitActive && (
                          <tr className="print:break-before-page">
                            <td colSpan={7} className="p-3 bg-violet-500/5 dark:bg-violet-500/15 border-y border-dashed border-violet-500/20 text-center font-mono text-[10px] font-bold text-violet-500 uppercase tracking-widest">
                              GAP: HEAT {nextHeatNum} STARTING HERE
                            </td>
                          </tr>
                        )}
                        <tr
                          className={`transition-all ${
                            c.scratched 
                              ? "bg-slate-500/5 dark:bg-slate-500/[0.02] text-slate-400 dark:text-slate-500 line-through decoration-rose-500/40" 
                              : "hover:bg-slate-50/50 dark:hover:bg-slate-800/20"
                          }`}
                        >
                          <td className={`p-3 font-mono font-bold ${c.scratched ? "text-slate-500" : "text-violet-500"}`}>{c.bib.includes("_") ? "" : "#"}{c.bib}</td>
                          <td className="p-3 font-medium">
                            <div className="flex items-center gap-2">
                              <span>{c.name}</span>
                              {c.scratched && (
                                <span className="text-[10px] bg-rose-500/10 text-rose-500 px-1.5 py-0.5 rounded font-mono font-bold uppercase">Scratched</span>
                              )}
                            </div>
                          </td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                              c.division === "Novice" ? "bg-sky-500/10 text-sky-500 border-sky-500/20" :
                              c.division === "Intermediate" ? "bg-amber-500/10 text-amber-500 border-amber-500/20" :
                              "bg-purple-500/10 text-purple-500 border-purple-500/20"
                            }`}>
                              {c.division}
                            </span>
                          </td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              c.role === "Lead" ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
                            }`}>
                              {c.role}
                            </span>
                          </td>
                          <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                            <button
                              id={`checkin-toggle-${c.bib}`}
                              onClick={() => handleToggleCheckIn(c.bib, c.checkedIn)}
                              disabled={loadingBib === c.bib || c.scratched}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                                c.checkedIn && !c.scratched
                                  ? "bg-green-500 text-white hover:bg-green-600 shadow-sm"
                                  : isDarkMode
                                    ? "bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 disabled:opacity-50"
                                    : "bg-slate-100 border border-slate-200 text-slate-600 hover:bg-slate-200 disabled:opacity-50"
                              }`}
                            >
                              {c.checkedIn && !c.scratched ? (
                                <>
                                  <CheckSquare className="w-3.5 h-3.5" />
                                  Checked In
                                </>
                              ) : (
                                <>
                                  <Square className="w-3.5 h-3.5" />
                                  Check In
                                </>
                              )}
                            </button>
                          </td>
                          <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                            <button
                              id={`scratch-toggle-${c.bib}`}
                              onClick={() => handleToggleScratch(c.bib, c.scratched || false)}
                              disabled={loadingBib === c.bib}
                              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border ${
                                c.scratched
                                  ? "bg-amber-500/10 text-amber-500 border-amber-500/20 hover:bg-amber-500/20"
                                  : "bg-rose-500/10 text-rose-500 border-rose-500/10 hover:bg-rose-500/20"
                              }`}
                            >
                              {c.scratched ? (
                                <>
                                  <Slash className="w-3 h-3 mr-1" />
                                  Unscratch
                                </>
                              ) : (
                                <>
                                  <Ban className="w-3 h-3 mr-1" />
                                  Scratch
                                </>
                              )}
                            </button>
                          </td>
                          <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => handleOpenEditModal(c)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-850 text-slate-500 hover:text-slate-300"
                            >
                              <Edit className="w-3.5 h-3.5 mr-1" />
                              Edit
                            </button>
                          </td>
                        </tr>
                      </React.Fragment>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-slate-500">
                      No competitors match the search or selected sheet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
          </div>
        </div>
        </>)}
      </div>

      {editingCompetitor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className={`w-full max-w-md rounded-2xl border p-6 shadow-2xl transition-all ${
            isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 text-slate-800"
          }`}>
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3 mb-4">
              <h3 className="text-sm font-bold flex items-center gap-1.5 font-mono">
                <Edit className="w-4 h-4 text-violet-500" />
                EDIT COMPETITOR PROFILE
              </h3>
              <button
                onClick={() => setEditingCompetitor(null)}
                className="p-1 hover:bg-slate-150 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                <X className="w-4 h-4 text-slate-400 hover:text-slate-200" />
              </button>
            </div>

            {editError && (
              <div className="mb-4 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs font-medium font-mono">
                {editError}
              </div>
            )}

            <div className="space-y-4 text-xs">
              {/* Bib and Name */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <label className="block text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-1">Bib #</label>
                  <input
                    type="text"
                    value={editBib}
                    onChange={(e) => setEditBib(e.target.value)}
                    className={`w-full px-2.5 py-1.5 rounded-lg border focus:outline-none focus:ring-1 focus:ring-violet-500 font-mono font-bold ${
                      isDarkMode ? "bg-slate-950 border-slate-850 text-violet-400" : "bg-slate-50 border-slate-200 text-violet-600"
                    }`}
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-1">Dancer Name</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className={`w-full px-2.5 py-1.5 rounded-lg border focus:outline-none focus:ring-1 focus:ring-violet-500 font-medium ${
                      isDarkMode ? "bg-slate-950 border-slate-850 text-slate-100" : "bg-slate-50 border-slate-200 text-slate-800"
                    }`}
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-1">Email Address</label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className={`w-full px-2.5 py-1.5 rounded-lg border focus:outline-none focus:ring-1 focus:ring-violet-500 font-medium ${
                    isDarkMode ? "bg-slate-950 border-slate-850 text-slate-100" : "bg-slate-50 border-slate-200 text-slate-800"
                  }`}
                />
              </div>

              {/* Division and Role */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-1">Division</label>
                  <select
                    value={editDivision}
                    onChange={(e) => setEditDivision(e.target.value)}
                    className={`w-full px-2.5 py-1.5 rounded-lg border focus:outline-none focus:ring-1 focus:ring-violet-500 font-semibold ${
                      isDarkMode ? "bg-slate-950 border-slate-850 text-slate-100" : "bg-slate-50 border-slate-200 text-slate-800"
                    }`}
                  >
                    <option value="Newcomer">Newcomer</option>
                    <option value="Novice">Novice</option>
                    <option value="Intermediate">Intermediate</option>
                    <option value="Advance">Advance</option>
                    <option value="All-Star">All-Star</option>
                    <option value="Pro">Pro</option>
                    <option value="Open">Open</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-1">Role</label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value as "Lead" | "Follow")}
                    className={`w-full px-2.5 py-1.5 rounded-lg border focus:outline-none focus:ring-1 focus:ring-violet-500 font-semibold ${
                      isDarkMode ? "bg-slate-950 border-slate-850 text-slate-100" : "bg-slate-50 border-slate-200 text-slate-800"
                    }`}
                  >
                    <option value="Lead">Leader (Lead)</option>
                    <option value="Follow">Follower (Follow)</option>
                  </select>
                </div>
              </div>

              {/* Status checkboxes */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-850 space-y-3">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editCheckedIn}
                    onChange={(e) => setEditCheckedIn(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 text-violet-600 focus:ring-violet-500"
                  />
                  <div>
                    <span className="font-semibold text-xs">Mark as Checked In</span>
                    <p className="text-[10px] text-slate-400">Competitor is checked-in on the coordination desk</p>
                  </div>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editScratched}
                    onChange={(e) => setEditScratched(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 text-rose-600 focus:ring-rose-500"
                  />
                  <div>
                    <span className="font-semibold text-xs text-rose-500">Scratch Competitor</span>
                    <p className="text-[10px] text-slate-400">Competitor is scratched (withdrawn/absent) from contest</p>
                  </div>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 mt-6 border-t border-slate-200 dark:border-slate-800 pt-4">
              <button
                onClick={() => setEditingCompetitor(null)}
                className="px-3.5 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl font-bold uppercase tracking-wider text-[10px] text-slate-400 hover:text-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={isSavingEdit}
                className="px-4 py-2 bg-violet-600 hover:bg-violet-750 disabled:opacity-50 text-white rounded-xl font-bold uppercase tracking-wider text-[10px] transition-all shadow-md flex items-center gap-1.5"
              >
                {isSavingEdit ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
