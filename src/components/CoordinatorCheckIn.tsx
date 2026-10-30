import React, { useEffect, useState } from "react";
import { UserCheck, Search, Users, ShieldAlert, CheckSquare, Trash2, Award, Lock, X, Edit } from "lucide-react";
import { Competitor, AppSettings, Heat, ContestEntryFields } from "../types";
import { findRegisteredPartner, getContestEntry, getContestRole, isPartneredContest, isRegisteredFor, projectCompetitorsForHeat, validateContestEntries } from "../utils/partners";
import ContestEntryInputs, { emptyContestEntries, contestEntriesFrom } from "./ContestEntryInputs";

interface CoordinatorCheckInProps {
  competitors: Competitor[];
  heats?: Heat[];
  onCheckInToggle: (bib: string, heatId: string, checkedIn: boolean, scratched?: boolean, registryPoints?: number) => Promise<void>;
  onAssignPartner?: (heatId: string, bib: string, partnerBib: string) => Promise<void>;
  isDarkMode: boolean;
  settings: AppSettings;
  onUpdateSettings?: (newSettings: Partial<AppSettings>) => Promise<void>;
  onUpdateCompetitor?: (oldBib: string, updates: { bib: string; name: string; email?: string; division: string; role: "Lead" | "Follow"; checkedIn?: boolean; scratched?: boolean; heatId?: string } & ContestEntryFields) => Promise<void>;
}

type CheckInTab = "master" | "leaders" | "followers" | "activeHeat";

export default function CoordinatorCheckIn({
  competitors,
  heats = [],
  onCheckInToggle,
  onAssignPartner,
  isDarkMode,
  settings,
  onUpdateSettings,
  onUpdateCompetitor
}: CoordinatorCheckInProps) {
  const [activeTab, setActiveTab] = useState<CheckInTab>("master");
  const [search, setSearch] = useState("");
  const [loadingBib, setLoadingBib] = useState<string | null>(null);
  const [finalizeState, setFinalizeState] = useState<"idle" | "success" | "warning">("idle");
  const [boardSlot, setBoardSlot] = useState<"live" | "next">("live");

  // Partner finder for dancers left unpaired on a partnered sheet, per bib:
  // the filter text (defaults to the partner name they registered), the
  // fallback list choice, and any assignment error.
  const [partnerFilters, setPartnerFilters] = useState<Record<string, string>>({});
  const [fallbackPartner, setFallbackPartner] = useState<Record<string, string>>({});
  const [assignErrors, setAssignErrors] = useState<Record<string, string>>({});
  const [assigningBib, setAssigningBib] = useState<string | null>(null);

  // Competitor editing state
  const [editingCompetitor, setEditingCompetitor] = useState<Competitor | null>(null);
  const [editBib, setEditBib] = useState("");
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState<"Lead" | "Follow">("Lead");
  const [editDivision, setEditDivision] = useState("");
  const [editCheckedIn, setEditCheckedIn] = useState(false);
  const [editScratched, setEditScratched] = useState(false);
  const [editEntryFields, setEditEntryFields] = useState<ContestEntryFields>(emptyContestEntries());
  const [editError, setEditError] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const handleOpenEditModal = (sheetEntry: Competitor) => {
    // Sheet rows for couples carry the heat's division, so edit the stored
    // registration instead of the row copy.
    const c = competitors.find((x) => x.bib === sheetEntry.bib) || sheetEntry;
    // Check-in/scratch shown and saved here are this contest's only.
    const status = heatRoster.find((x) => x.bib === c.bib) || sheetEntry;
    setEditingCompetitor(c);
    setEditEntryFields(contestEntriesFrom(c));
    setEditBib(c.bib);
    setEditName(c.name);
    setEditEmail(c.email || "");
    setEditRole(c.role);
    setEditDivision(c.division);
    setEditCheckedIn(status.checkedIn);
    setEditScratched(!!status.scratched);
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
    const entryError = validateContestEntries({ ...editEntryFields, division: editDivision, role: editRole });
    if (entryError) {
      setEditError(entryError);
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
          scratched: editScratched,
          heatId: activeHeat?.id,
          ...editEntryFields
        });
        setEditingCompetitor(null);
      }
    } catch (err: any) {
      setEditError(err.message || "Failed to update competitor");
    } finally {
      setIsSavingEdit(false);
    }
  };

  // The board checks in either the Live Contest or, once the admin has made its
  // sheet, the queued Next Contest. Each has its own Finalize lock, so the Next
  // Contest can be checked in while the Live one stays finalized.
  const queuedHeat = heats.find(h => h.id === settings.queuedHeatId);
  const isViewingNext = boardSlot === "next" && !!queuedHeat;
  const activeHeat = isViewingNext ? queuedHeat : heats.find(h => h.id === settings.currentHeatId);
  const isSheetFinalized = isViewingNext ? !!settings.queuedCheckInFinalized : !!settings.checkInFinalized;
  const setSheetFinalized = async (finalized: boolean) => {
    await onUpdateSettings?.(isViewingNext ? { queuedCheckInFinalized: finalized } : { checkInFinalized: finalized });
  };
  const switchBoardSlot = (slot: "live" | "next") => {
    setBoardSlot(slot);
    setFinalizeState("idle");
  };
  // Once the queued contest goes Live (or is removed) the board returns to Live.
  useEffect(() => {
    if (boardSlot === "next" && !queuedHeat) switchBoardSlot("live");
  }, [boardSlot, queuedHeat]);
  const activeContestType = activeHeat?.contestType || "Jack & Jill";
  const isActiveHeatPartnered = isPartneredContest(activeContestType);
  // Routine couples have no Leader/Follower roles, so their sheet is
  // couples-only: no role labels, columns or per-role sheets.
  const isRoutineHeat = activeContestType === "Routine";
  const visibleTab: CheckInTab = isRoutineHeat ? "master" : activeTab;
  // Only dancers registered for this heat's contest and division appear on the
  // sheet; placeholder entries for unknown bibs are kept so gaps stay visible.
  const isEntrant = (c: Competitor | undefined) =>
    !!c && !!activeHeat && isRegisteredFor(c, activeContestType, activeHeat.division);
  // Each dancer as this heat sees them: their entry's division and role.
  const heatRoster = activeHeat ? projectCompetitorsForHeat(competitors, activeHeat) : competitors;
  const activeHeatCompetitors = activeHeat
    ? activeHeat.competitorBibs
        .flatMap((bib) => {
          const comp = heatRoster.find((c) => c.bib === bib);
          if (comp) return isEntrant(comp) ? [comp] : [];
          if (bib.includes("_")) {
            const [leadBib, followBib] = bib.split("_");
            const foundLead = heatRoster.find((c) => c.bib === leadBib);
            const foundFollow = heatRoster.find((c) => c.bib === followBib);
            if ((foundLead && !isEntrant(foundLead)) || (foundFollow && !isEntrant(foundFollow))) return [];
            const lead = foundLead;
            const follow = foundFollow;
            
            // Each partner is listed on their side of the couple, which for a
            // partnered contest can differ from their Jack & Jill role.
            const result: Competitor[] = [];
            if (lead) {
              result.push({ ...lead, division: activeHeat.division, role: "Lead" });
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
              result.push({ ...follow, division: activeHeat.division, role: "Follow" });
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

  // Partnered sheets list each couple on one line, plus anyone still waiting
  // for a partner to be assigned.
  const activeHeatCouples = activeHeat && isActiveHeatPartnered
    ? activeHeat.competitorBibs
        .filter((id) => id.includes("_"))
        .map((id) => {
          const [leadBib, followBib] = id.split("_");
          const lead = activeHeatCompetitors.find((c) => c.bib === leadBib && c.role === "Lead");
          const follow = activeHeatCompetitors.find((c) => c.bib === followBib && c.role === "Follow");
          return lead && follow
            ? { id, lead, follow, checkedIn: lead.checkedIn && follow.checkedIn, scratched: !!(lead.scratched || follow.scratched) }
            : null;
        })
        .filter((c): c is { id: string; lead: Competitor; follow: Competitor; checkedIn: boolean; scratched: boolean } => !!c)
    : [];
  const pairedBibs = new Set((activeHeat?.couples || []).flatMap((c) => [c.leadBib, c.followBib]));
  const unpairedDancers = activeHeat && isActiveHeatPartnered
    ? (activeHeat.unpairedBibs || [])
        .map((bib) => heatRoster.find((c) => c.bib === bib))
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

  // Partnered contests always dance with the registered partner, so show who
  // that is (and flag anyone whose partner can't be found).
  const renderPartnerLine = (c: Competitor) => {
    if (!activeHeat || !isActiveHeatPartnered) return null;
    const record = competitors.find((x) => x.bib === c.bib);
    if (!record) return null;
    const partner = findRegisteredPartner(record, competitors, activeContestType, activeHeat.division);
    const namedPartner = getContestEntry(record, activeContestType, activeHeat.division)?.partner;
    return partner ? (
      <div className="text-[11px] text-slate-400 mt-1.5">
        Partner: <span className="font-semibold text-violet-500">#{partner.bib} {partner.name}</span>
      </div>
    ) : (
      <div className="text-[11px] text-amber-500 mt-1.5 font-semibold">
        Partner "{namedPartner || "—"}" is not registered for {activeHeat.division} {activeContestType}
      </div>
    );
  };

  // Filter lists
  const getFilteredCompetitors = () => {
    return activeHeatCompetitors.filter((c) => {
      const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase()) || c.bib.includes(search);
      if (visibleTab === "leaders") return matchesSearch && c.role === "Lead";
      if (visibleTab === "followers") return matchesSearch && c.role === "Follow";
      return matchesSearch;
    });
  };

  // Check-in and scratch apply to the active contest only; a couple's
  // partners are toggled together.
  const handleToggleCheckIn = async (bib: string, currentStatus: boolean) => {
    if (!activeHeat) return;
    setLoadingBib(bib);
    try {
      if (bib.includes("_")) {
        const [leadBib, followBib] = bib.split("_");
        await onCheckInToggle(leadBib, activeHeat.id, !currentStatus);
        await onCheckInToggle(followBib, activeHeat.id, !currentStatus);
      } else {
        await onCheckInToggle(bib, activeHeat.id, !currentStatus);
      }
      if (isSheetFinalized) {
        await setSheetFinalized(false);
      }
    } catch (err) {
      console.error("Failed to toggle check-in", err);
    } finally {
      setLoadingBib(null);
    }
  };

  const handleToggleScratch = async (bib: string, currentScratched: boolean) => {
    if (!activeHeat) return;
    setLoadingBib(bib);
    try {
      if (bib.includes("_")) {
        const [leadBib, followBib] = bib.split("_");
        const lead = heatRoster.find(c => c.bib === leadBib);
        const follow = heatRoster.find(c => c.bib === followBib);
        await onCheckInToggle(leadBib, activeHeat.id, lead?.checkedIn || false, !currentScratched);
        await onCheckInToggle(followBib, activeHeat.id, follow?.checkedIn || false, !currentScratched);
      } else {
        await onCheckInToggle(bib, activeHeat.id, heatRoster.find(c => c.bib === bib)?.checkedIn || false, !currentScratched);
      }
      if (isSheetFinalized) {
        await setSheetFinalized(false);
      }
    } catch (err) {
      console.error("Failed to toggle scratch status", err);
    } finally {
      setLoadingBib(null);
    }
  };

  const handlePointsChange = async (bib: string, points: number) => {
    try {
      if (!activeHeat) return;
      const current = heatRoster.find(c => c.bib === bib);
      await onCheckInToggle(bib, activeHeat.id, current?.checkedIn || false, current?.scratched || false, points);
    } catch (err) {
      console.error("Failed to update registry points", err);
    }
  };

  const handleAssignPartner = async (bib: string, partnerBib: string) => {
    if (!activeHeat || !onAssignPartner || !partnerBib) return;
    setAssigningBib(bib);
    setAssignErrors((prev) => ({ ...prev, [bib]: "" }));
    try {
      await onAssignPartner(activeHeat.id, bib, partnerBib);
      if (isSheetFinalized) {
        await setSheetFinalized(false);
      }
    } catch (err: any) {
      setAssignErrors((prev) => ({ ...prev, [bib]: err.message || "Failed to assign partner" }));
    } finally {
      setAssigningBib(null);
    }
  };

  const normalize = (text: string) => text.trim().toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ");

  // Registered dancers who could partner `dancer` here: not already partnered
  // on this sheet, and (for Strictly Swing) not entered on the same side.
  const getPartnerCandidates = (dancer: Competitor) => {
    if (!activeHeat) return [];
    const dancerRole = getContestRole(dancer, activeContestType, activeHeat.division);
    return heatRoster.filter((c) =>
      c.bib !== dancer.bib &&
      !pairedBibs.has(c.bib) &&
      !(dancerRole && getContestRole(c, activeContestType, activeHeat.division) === dancerRole)
    );
  };

  // Filters candidates by the typed (or registered) partner name: every word
  // matching first, else any word of 3+ letters, or an exact bib number.
  const matchPartnerCandidates = (candidates: Competitor[], filter: string) => {
    const words = normalize(filter).split(" ").filter((w) => w.length >= 2);
    const bibQuery = filter.trim().replace(/^#/, "");
    if (words.length === 0 && !bibQuery) return { matches: [] as Competitor[], isLoose: false };
    const byBib = candidates.filter((c) => c.bib === bibQuery);
    const strict = candidates.filter((c) => words.length > 0 && words.every((w) => normalize(c.name).includes(w)));
    if (byBib.length + strict.length > 0) return { matches: [...byBib, ...strict.filter((c) => !byBib.includes(c))], isLoose: false };
    const loose = candidates.filter((c) => words.some((w) => w.length >= 3 && normalize(c.name).split(" ").some((part) => part.startsWith(w) || w.startsWith(part) && part.length >= 3)));
    return { matches: loose, isLoose: true };
  };

  const renderPartnerFinder = (dancer: Competitor) => {
    if (!activeHeat) return null;
    const registeredPartner = getContestEntry(dancer, activeContestType, activeHeat.division)?.partner || "";
    const filter = partnerFilters[dancer.bib] ?? registeredPartner;
    const candidates = getPartnerCandidates(dancer);
    const { matches, isLoose } = matchPartnerCandidates(candidates, filter);
    const alphabetical = [...candidates].sort((a, b) => a.name.localeCompare(b.name));
    const dancerRole = getContestRole(dancer, activeContestType, activeHeat.division);
    const isBusy = assigningBib === dancer.bib;
    const inputClass = `w-full px-3 py-1.5 text-xs rounded-lg border focus:outline-none focus:ring-1 focus:ring-violet-500 ${
      isDarkMode ? "bg-slate-800 border-slate-700 text-slate-100 placeholder-slate-500" : "bg-white border-slate-200 text-slate-800"
    }`;
    const entryNote = (c: Competitor) => isRegisteredFor(c, activeContestType, activeHeat.division)
      ? `Entered in ${activeHeat.division} ${activeContestType}`
      : `Not entered -- will be added to ${activeHeat.division} ${activeContestType}`;

    return (
      <div key={dancer.bib} id={`partner-finder-${dancer.bib}`} className={`p-3 rounded-xl border ${isDarkMode ? "border-slate-800 bg-slate-950/40" : "border-slate-200 bg-slate-50"}`}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono font-bold text-violet-500">#{dancer.bib}</span>
          <span className="text-sm font-bold">{dancer.name}</span>
          {dancerRole && getRoleBadge(dancerRole)}
          <span className="text-[11px] text-slate-400">
            Registered partner: <span className="font-semibold text-amber-500">{registeredPartner || "none given"}</span>
          </span>
          <button
            type="button"
            onClick={() => handleToggleScratch(dancer.bib, !!dancer.scratched)}
            disabled={loadingBib === dancer.bib}
            className={`ml-auto px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider transition-all border ${
              dancer.scratched
                ? "bg-amber-500/10 text-amber-500 border-amber-500/20 hover:bg-amber-500/20"
                : "bg-rose-500/10 text-rose-500 border-rose-500/10 hover:bg-rose-500/20"
            }`}
          >
            {dancer.scratched ? "Unscratch" : "Scratch"}
          </button>
        </div>
        {dancer.scratched && (
          <p className="text-[11px] text-rose-500 font-semibold mt-1">Scratched from this contest.</p>
        )}

        <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mt-3 mb-1">Find partner among registered dancers</label>
        <input
          type="text"
          value={filter}
          onChange={(e) => setPartnerFilters((prev) => ({ ...prev, [dancer.bib]: e.target.value }))}
          placeholder="Partner's name or bib"
          className={inputClass}
        />

        {matches.length > 0 ? (
          <div className="mt-2 space-y-1.5">
            <p className="text-[10px] text-slate-400">{isLoose ? "Possible matches" : "Matching registrants"}</p>
            {matches.map((c) => (
              <div key={c.bib} className="flex items-center justify-between gap-2 text-xs">
                <span>
                  <span className="font-mono font-bold text-violet-500">#{c.bib}</span> {c.name}
                  <span className="text-[10px] text-slate-400 ml-2">{entryNote(c)}</span>
                </span>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => handleAssignPartner(dancer.bib, c.bib)}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50"
                >
                  Assign
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-2">
            <p className="text-[10px] text-amber-500 mb-1.5">
              {filter.trim() ? `No registered dancer matches "${filter.trim()}".` : "No partner name to match."} Choose from all registrants:
            </p>
            <div className="flex items-center gap-2">
              <select
                value={fallbackPartner[dancer.bib] || ""}
                onChange={(e) => setFallbackPartner((prev) => ({ ...prev, [dancer.bib]: e.target.value }))}
                className={inputClass}
              >
                <option value="">Select a registrant (A-Z)...</option>
                {alphabetical.map((c) => (
                  <option key={c.bib} value={c.bib}>{c.name} (#{c.bib})</option>
                ))}
              </select>
              <button
                type="button"
                disabled={isBusy || !fallbackPartner[dancer.bib]}
                onClick={() => handleAssignPartner(dancer.bib, fallbackPartner[dancer.bib])}
                className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50 flex-shrink-0"
              >
                Assign
              </button>
            </div>
          </div>
        )}

        {assignErrors[dancer.bib] && (
          <p className="text-[11px] text-rose-500 font-semibold mt-2">{assignErrors[dancer.bib]}</p>
        )}
      </div>
    );
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

  const activeCouples = activeHeatCouples.filter((cp) => !cp.scratched);
  const couplesCheckedIn = activeCouples.filter((cp) => cp.checkedIn).length;
  const waitingForPartnerCount = unpairedDancers.filter((d) => !d.scratched).length;

  const getCheckInPercent = (checked: number, total: number) => {
    if (total === 0) return 0;
    return Math.round((checked / total) * 100);
  };

  return (
    <div className="space-y-6">
      {isSheetFinalized && (
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

        {isRoutineHeat ? (
          <>
            {/* Couples Check In Stats */}
            <div className={`p-5 rounded-2xl border transition-all ${isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100 shadow-sm"}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-400 font-mono">Couples Checked-In</span>
                <span className="text-xs font-mono text-emerald-500 font-bold">{couplesCheckedIn} / {activeCouples.length} ({getCheckInPercent(couplesCheckedIn, activeCouples.length)}%)</span>
              </div>
              <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-2">
                <div
                  className="bg-emerald-500 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${getCheckInPercent(couplesCheckedIn, activeCouples.length)}%` }}
                />
              </div>
            </div>

            {/* Waiting For A Partner Stats */}
            <div className={`p-5 rounded-2xl border transition-all ${isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100 shadow-sm"}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-400 font-mono">Needs a Partner</span>
                <span className="text-xs font-mono text-amber-500 font-bold">{waitingForPartnerCount} dancer{waitingForPartnerCount === 1 ? "" : "s"}</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] bg-amber-500/10 text-amber-500 px-2.5 py-0.5 rounded font-mono font-bold uppercase border border-amber-500/10">
                  {waitingForPartnerCount > 0 ? "Partners Unassigned" : "All Paired"}
                </span>
              </div>
            </div>
          </>
        ) : (
        <>
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
        </>
        )}

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
                <span className={`px-2.5 py-0.5 rounded-lg text-[10px] font-bold font-mono uppercase tracking-wider border ${
                  isViewingNext ? "bg-violet-500/10 text-violet-500 border-violet-500/25" : "bg-green-500/10 text-green-500 border-green-500/25"
                }`}>
                  {isViewingNext ? "Next Contest" : "Live Contest"}: {activeHeat.name}
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-bold font-mono bg-amber-500/10 text-amber-500 border border-amber-500/25 uppercase tracking-wider animate-pulse">
                  No Active Contest Selected
                </span>
              )}
            </div>
            {activeHeat ? (
              <p className="text-xs text-slate-400 mt-1">
                Currently checking-in for: <strong className="text-violet-500">{activeHeat.name}</strong> ({activeHeat.division} — {isRoutineHeat ? "Couples" : `${activeHeat.role} Roles`})
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
                  visibleTab === "master"
                    ? "bg-violet-600 text-white shadow-sm"
                    : "text-slate-600 dark:text-slate-300 hover:bg-slate-250 dark:hover:bg-slate-700/50"
                }`}
              >
                Master Sheet
              </button>
              {!isRoutineHeat && (<>
              <button
                id="checkin-tab-leads"
                onClick={() => { setActiveTab("leaders"); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  visibleTab === "leaders"
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
                  visibleTab === "followers"
                    ? "bg-rose-600 text-white shadow-sm"
                    : "text-slate-600 dark:text-slate-300 hover:bg-slate-250 dark:hover:bg-slate-700/50"
                }`}
              >
                Followers Sheet
              </button>
              </>)}
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
                placeholder={`Search ${visibleTab === "master" ? "all" : visibleTab} by name or bib...`}
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
          {isSheetFinalized && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-900/5 dark:bg-slate-950/10 backdrop-blur-[0.5px] rounded-2xl">
              <div className="bg-slate-900/90 dark:bg-slate-950/95 text-white border border-slate-800 p-4 rounded-xl shadow-xl flex flex-col items-center text-center gap-2 max-w-sm pointer-events-auto">
                <Lock className="w-8 h-8 text-amber-500 animate-pulse" />
                <h4 className="text-sm font-bold uppercase tracking-wider text-amber-500 font-mono">Roster Finalized & Locked</h4>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Check-in for this contest has been completed and its statuses are locked.
                </p>
                <button
                  type="button"
                  onClick={async () => {
                    setFinalizeState("idle");
                    await setSheetFinalized(false);
                  }}
                  className="mt-2 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-colors cursor-pointer"
                >
                  Unlock & Reopen Sheet
                </button>
              </div>
            </div>
          )}

          <div className={`transition-all duration-300 ${isSheetFinalized ? "opacity-30 grayscale select-none pointer-events-none" : ""}`}>
            {visibleTab === "master" ? (
          <div className="space-y-6">

            {!isActiveHeatPartnered ? (
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
                                      {renderPartnerLine(c)}
                                      
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
                                      {renderPartnerLine(c)}
                                      
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
              <div className="space-y-4">
                {/* Partnerships: one line per couple */}
                <div className={`p-4 rounded-xl border ${isDarkMode ? "bg-slate-900/40 border-slate-800 text-slate-100" : "bg-white border-slate-200 shadow-sm text-slate-800"}`}>
                  <h3 className="text-sm font-bold font-mono text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5 border-b pb-2 border-slate-150 dark:border-slate-800">
                    <span className={`w-2.5 h-2.5 rounded-full ${activeHeatCouples.length > 0 && activeHeatCouples.every((cp) => cp.checkedIn || cp.scratched) ? "bg-green-500 animate-pulse" : "bg-amber-500"}`}></span>
                    Partnerships ({activeHeatCouples.length})
                  </h3>
                  <p className="text-[11px] text-slate-400 mb-3">
                    Check a couple in only once both partners are present, and scratch couples who don't make it on time. Only checked-in couples that aren't scratched go on the judges' sheets.
                  </p>
                  <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className={`${isDarkMode ? "bg-slate-800/50 text-slate-300" : "bg-slate-50 text-slate-500"} text-[10px] font-semibold font-mono border-b border-slate-200 dark:border-slate-800`}>
                          <th className="p-3">{isRoutineHeat ? "Partner" : "Leader"}</th>
                          <th className="p-3">{isRoutineHeat ? "Partner" : "Follower"}</th>
                          <th className="p-3 text-right">Status &amp; Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                        {activeHeatCouples
                          .filter((cp) => {
                            const q = search.toLowerCase();
                            return !q || [cp.lead, cp.follow].some((c) => c.name.toLowerCase().includes(q) || c.bib.includes(search));
                          })
                          .map((cp) => {
                            const originalIndex = activeHeat ? activeHeat.competitorBibs.indexOf(cp.id) : -1;
                            const isSplitActive = originalIndex !== -1 && (activeHeat?.splits || []).includes(originalIndex);
                            const nextHeatNum = isSplitActive && activeHeat
                              ? (activeHeat.splits || []).filter(sp => sp <= originalIndex).length + 1
                              : 1;
                            const renderPartner = (c: Competitor) => (
                              <div>
                                <div className="flex items-center gap-2">
                                  {!(activeContestType === "Strictly Swing" && c.bib === cp.follow.bib) && (
                                    <span className={`font-mono font-bold ${cp.scratched ? "text-slate-500" : "text-violet-500"}`}>#{c.bib}</span>
                                  )}
                                  <span className="text-sm font-bold">{c.name}</span>
                                </div>
                                <button
                                  onClick={() => handleOpenEditModal(c)}
                                  className="text-[9px] font-bold uppercase tracking-wider text-slate-400 hover:text-violet-500 mt-1"
                                >
                                  Edit
                                </button>
                              </div>
                            );
                            return (
                              <React.Fragment key={cp.id}>
                                {isSplitActive && (
                                  <tr className="print:break-before-page">
                                    <td colSpan={3} className="p-2.5 bg-violet-500/5 dark:bg-violet-500/15 border-y border-dashed border-violet-500/20 text-center font-mono text-[9px] font-bold text-violet-500 uppercase tracking-widest">
                                      GAP: HEAT {nextHeatNum} STARTING HERE
                                    </td>
                                  </tr>
                                )}
                                <tr
                                  id={`partnership-row-${cp.id}`}
                                  className={`transition-all ${
                                    cp.scratched
                                      ? "bg-slate-500/5 dark:bg-slate-500/[0.02] text-slate-400 dark:text-slate-500 line-through decoration-rose-500/40"
                                      : "hover:bg-slate-50/50 dark:hover:bg-slate-800/20"
                                  }`}
                                >
                                  <td className="p-3 align-top">{renderPartner(cp.lead)}</td>
                                  <td className="p-3 align-top">{renderPartner(cp.follow)}</td>
                                  <td className="p-3 align-top text-right">
                                    <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                      {getCheckInStatusBadge({ ...cp.lead, checkedIn: cp.checkedIn, scratched: cp.scratched })}
                                      <button
                                        onClick={() => handleToggleCheckIn(cp.id, cp.checkedIn)}
                                        disabled={loadingBib === cp.id || cp.scratched}
                                        className={`px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider transition-all border ${
                                          cp.checkedIn && !cp.scratched
                                            ? "bg-green-500/10 text-green-500 border-green-500/20 hover:bg-green-500/20"
                                            : isDarkMode
                                              ? "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750 disabled:opacity-50"
                                              : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                                        }`}
                                      >
                                        {cp.checkedIn && !cp.scratched ? "Checked In" : "Check In"}
                                      </button>
                                      <button
                                        onClick={() => handleToggleScratch(cp.id, cp.scratched)}
                                        disabled={loadingBib === cp.id}
                                        className={`px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider transition-all border ${
                                          cp.scratched
                                            ? "bg-amber-500/10 text-amber-500 border-amber-500/20 hover:bg-amber-500/20"
                                            : "bg-rose-500/10 text-rose-500 border-rose-500/10 hover:bg-rose-500/20"
                                        }`}
                                      >
                                        {cp.scratched ? "Unscratch" : "Scratch"}
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              </React.Fragment>
                            );
                          })}
                        {activeHeatCouples.length === 0 && (
                          <tr>
                            <td colSpan={3} className="p-4 text-center text-slate-500 text-[11px]">
                              No partnerships on this sheet yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Dancers whose registered partner couldn't be matched */}
                {unpairedDancers.length > 0 && (
                  <div id="needs-partner-section" className={`p-4 rounded-xl border border-amber-500/30 ${isDarkMode ? "bg-amber-500/5" : "bg-amber-50"}`}>
                    <h3 className="text-sm font-bold font-mono text-amber-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                      <ShieldAlert className="w-4 h-4" />
                      Needs a Partner ({unpairedDancers.length})
                    </h3>
                    <p className="text-[11px] text-slate-400 mb-3">
                      Their registered partner couldn't be matched to a registered dancer. Assign their partner once you find them; the couple then joins the partnerships above, where you check them in when both are present. Scratch anyone who doesn't make it on time.
                    </p>
                    <div className="space-y-3">
                      {unpairedDancers.map((d) => renderPartnerFinder(d))}
                    </div>
                  </div>
                )}
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
                  {isSheetFinalized ? (
                    <button
                      id="reopen-checkin-btn"
                      onClick={async () => {
                        setFinalizeState("idle");
                        await setSheetFinalized(false);
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
                          await setSheetFinalized(true);
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
                          await setSheetFinalized(true);
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
                      const comp = heatRoster.find(cc => cc.bib === bib);
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
                          <td className={`p-3 font-mono font-bold ${c.scratched ? "text-slate-500" : "text-violet-500"}`}>{activeContestType === "Strictly Swing" && c.role === "Follow" ? "—" : `${c.bib.includes("_") ? "" : "#"}${c.bib}`}</td>
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
                          </td>
                          <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                            <button
                              id={`scratch-toggle-${c.bib}`}
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
                          </td>
                          <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => handleOpenEditModal(c)}
                              className="px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider transition-all border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-850 text-slate-500 hover:text-slate-300"
                            >
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

      {/* Switch between the Live and queued Next contest, under the board */}
      {queuedHeat && (() => {
        const liveHeat = heats.find(h => h.id === settings.currentHeatId);
        const otherHeat = isViewingNext ? liveHeat : queuedHeat;
        const otherFinalized = isViewingNext ? !!settings.checkInFinalized : !!settings.queuedCheckInFinalized;
        return (
          <button
            type="button"
            id="checkin-slot-switch"
            onClick={() => switchBoardSlot(isViewingNext ? "live" : "next")}
            className="w-full text-left animate-fade-in hover:scale-[1.01] transition-all bg-gradient-to-r from-violet-600/10 to-indigo-600/10 hover:from-violet-600/20 hover:to-indigo-600/20 border border-violet-500/30 p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <span className="relative flex h-3 w-3">
                {otherFinalized ? (
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                ) : (
                  <>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                  </>
                )}
              </span>
              <div>
                <h4 className="text-sm font-bold font-mono tracking-tight text-violet-500 dark:text-violet-400">
                  {isViewingNext ? "LIVE CONTEST: " : "NEXT CONTEST QUEUED: "}
                  <span className="text-slate-800 dark:text-slate-200 uppercase">{otherHeat?.name || (isViewingNext ? "None" : "Upcoming Contest")}</span>
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {otherFinalized ? "✓ Check-in finalized." : "Check-in not finalized yet."}{" "}
                  {isViewingNext ? "Click to go back to the Live Contest's check-in." : "Click to check in this contest."}
                </p>
              </div>
            </div>
            <span className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg bg-violet-600 text-white flex-shrink-0">
              {isViewingNext ? "Back to Live Check-In" : "Check In Next Contest"}
            </span>
          </button>
        );
      })()}

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
                  <label className="block text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-1">Jack &amp; Jill Division</label>
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
                  <label className="block text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-1">Jack &amp; Jill Role</label>
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

              <div className="pt-2 border-t border-slate-200 dark:border-slate-850">
                <label className="block text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-2">More Contest Entries</label>
                <ContestEntryInputs
                  value={editEntryFields}
                  onChange={setEditEntryFields}
                  isDarkMode={isDarkMode}
                  mainDivision={editDivision}
                  mainRole={editRole}
                />
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
                    <p className="text-[10px] text-slate-400">Checked in for this contest only</p>
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
                    <p className="text-[10px] text-slate-400">Scratched from this contest only; other contests are unaffected</p>
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
