import React, { useState, useEffect, useRef } from "react";
import { Shield, Sparkles, RefreshCw, Trash2, PlusCircle, CheckSquare, Settings, AlertTriangle, Play, Eye, EyeOff, Lock, Unlock, Trophy, Calendar, ArrowUp, ArrowDown, Plus, ChevronDown, ChevronUp, SortAsc, Scissors, Edit, X, FileText, Award, ExternalLink } from "lucide-react";
import { Competitor, Heat, JudgingStyle, AppSettings, ScoreRecord, CallbackValue, CompletedContestResult } from "../types";
import { calculateHeatResults, getJudgeHeatCompetitors } from "../utils/calculations";

interface AdminPanelProps {
  competitors: Competitor[];
  heats: Heat[];
  scores: ScoreRecord[];
  settings: AppSettings;
  onUpdateSettings: (newSettings: Partial<AppSettings>) => Promise<void>;
  onCreateHeat: (heat: { name: string; division: string; role: "Lead" | "Follow" | "Mixed"; competitorBibs: string[]; heatType?: "Prelim" | "Semi-Final" | "Quarter Final" | "Finals"; contestType?: "Jack & Jill" | "Strictly Swing" | "Routine" }, target?: "live" | "next") => Promise<void>;
  onDeleteHeat: (heatId: string) => Promise<void>;
  onUpdateHeat: (heatId: string, updates: { name?: string; division?: string; role?: "Lead" | "Follow" | "Mixed"; competitorBibs?: string[]; couples?: any[]; isCustom?: boolean; splits?: number[] }) => Promise<void>;
  onSimulateScores: (heatId: string) => Promise<void>;
  onResetDatabase: () => Promise<void>;
  onClearAllDatabase?: () => Promise<void>;
  onSaveScore: (scoreData: {
    judgeId: string;
    heatId: string;
    competitorBib: string;
    score: number;
    isCallback: CallbackValue;
  }) => Promise<void>;
  isDarkMode: boolean;
  onUpdateCompetitor?: (oldBib: string, updates: { bib: string; name: string; email?: string; division: string; role: "Lead" | "Follow"; checkedIn?: boolean; scratched?: boolean }) => Promise<void>;
}

export default function AdminPanel({
  competitors,
  heats,
  scores,
  settings,
  onUpdateSettings,
  onCreateHeat,
  onDeleteHeat,
  onUpdateHeat,
  onSimulateScores,
  onResetDatabase,
  onClearAllDatabase,
  onSaveScore,
  isDarkMode,
  onUpdateCompetitor
}: AdminPanelProps) {
  // Create Heat Form States
  const [newHeatName, setNewHeatName] = useState("");
  const [newHeatRole, setNewHeatRole] = useState<"Lead" | "Follow" | "Mixed">("Mixed");
  const [selectedBibs, setSelectedBibs] = useState<string[]>([]);
  const [activeHeatControlTab, setActiveHeatControlTab] = useState<"live" | "next">("live");
  const [contestEditorTab, setContestEditorTab] = useState<"sheet" | "judges">("sheet");
  const [isFloatingBarHovered, setIsFloatingBarHovered] = useState<boolean>(false);
  const [sliderIndex, setSliderIndex] = useState(1);

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

  // Scoring Sheet Editor Form States
  const [addBibSelection, setAddBibSelection] = useState("");
  const [addLeadBib, setAddLeadBib] = useState("");
  const [addFollowBib, setAddFollowBib] = useState("");
  const [isDrawMode, setIsDrawMode] = useState(false);
  const [sortingMode, setSortingMode] = useState<"bib" | "manual">("bib");
  const [draggedOverRowIndex, setDraggedOverRowIndex] = useState<number | null>(null);
  const [expandedHeatId, setExpandedHeatId] = useState<string | null>(null);
  const [reviewJudgeForHeat, setReviewJudgeForHeat] = useState<Record<string, string | null>>({});

  const [collapsedCards, setCollapsedCards] = useState<Record<string, boolean>>({
    contestConfig: true,
    portalAccess: true,
    scoringConfig: true,
    devUtils: true,
    createHeat: true,
    heatsCatalog: true,
    scoringSheetEditor: true,
    heatFlowControls: true,
  });

  // Local states for Judging Configuration
  const [localJudgeNames, setLocalJudgeNames] = useState<string[]>([]);
  const [localJudgeRoles, setLocalJudgeRoles] = useState<("Leaders" | "Followers" | "Finals" | "None")[]>([]);
  const [localChiefJudgeName, setLocalChiefJudgeName] = useState("");
  const [localChiefJudgeRole, setLocalChiefJudgeRole] = useState<"Leaders" | "Followers" | "Both" | "Finals" | "None">("Both");

  const lastSyncedSettingsRef = useRef<string>("");
  const lastSyncedContestParamsRef = useRef<string>("");
  const lastPopulatedDivRef = useRef<string>("");
  const lastPopulatedRoleRef = useRef<string>("");
  const hasPopulatedRef = useRef<boolean>(false);

  useEffect(() => {
    const isNext = activeHeatControlTab === "next";
    const currentSettingsStr = JSON.stringify({
      judgeNames: isNext ? settings.nextJudgeNames : settings.judgeNames,
      judgeRoles: isNext ? settings.nextJudgeRoles : settings.judgeRoles,
      chiefJudgeName: isNext ? settings.nextChiefJudgeName : settings.chiefJudgeName,
      chiefJudgeRole: isNext ? settings.nextChiefJudgeRole : settings.chiefJudgeRole,
      activeTab: activeHeatControlTab
    });
    if (currentSettingsStr !== lastSyncedSettingsRef.current) {
      if (isNext) {
        setLocalJudgeNames(settings.nextJudgeNames || ["Judge A", "Judge B", "Judge C", "Judge D", "Judge E"]);
        setLocalJudgeRoles(settings.nextJudgeRoles || ["None", "None", "None", "None", "None"]);
        setLocalChiefJudgeName(settings.nextChiefJudgeName || "Chief Judge");
        setLocalChiefJudgeRole(settings.nextChiefJudgeRole || "Both");
      } else {
        setLocalJudgeNames(settings.judgeNames || ["Judge A", "Judge B", "Judge C", "Judge D", "Judge E"]);
        setLocalJudgeRoles(settings.judgeRoles || ["None", "None", "None", "None", "None"]);
        setLocalChiefJudgeName(settings.chiefJudgeName || "Chief Judge");
        setLocalChiefJudgeRole(settings.chiefJudgeRole || "Both");
      }
      lastSyncedSettingsRef.current = currentSettingsStr;
    }
  }, [settings, activeHeatControlTab]);

  const toggleCard = (cardKey: string) => {
    setCollapsedCards((prev) => ({
      ...prev,
      [cardKey]: !prev[cardKey],
    }));
  };

  const activeHeat = activeHeatControlTab === "live"
    ? heats.find((h) => h.id === settings.currentHeatId)
    : heats.find((h) => h.id === settings.queuedHeatId);

  // ---- Judges tab: live per-judge quota/submission status for the active heat ----
  const defaultJudgeNamesForStatus = ["Judge A", "Judge B", "Judge C", "Judge D", "Judge E"];
  const defaultJudgeRolesForStatus = ["None", "None", "None", "None", "None"];
  const judgeNamesForStatus = settings.judgeNames || defaultJudgeNamesForStatus;
  const judgeRolesForStatus = settings.judgeRoles || defaultJudgeRolesForStatus;
  const chiefNameForStatus = settings.chiefJudgeName || "Chief Judge";
  const chiefRoleForStatus = settings.chiefJudgeRole || "Both";

  const expectedJudgesForActiveHeat: { name: string; role: "Leaders" | "Followers" | "Finals" | "Both" | "None" }[] =
    judgeNamesForStatus
      .map((name, idx) => ({
        name,
        role: (judgeRolesForStatus[idx] || "None") as "Leaders" | "Followers" | "Finals" | "Both" | "None"
      }))
      .filter((j) => j.role !== "None");
  if (chiefRoleForStatus !== "None") {
    expectedJudgesForActiveHeat.push({ name: chiefNameForStatus, role: chiefRoleForStatus });
  }

  const judgeTargetCallbackCount = activeHeat && activeHeat.role === "Lead"
    ? (settings.callbackCountLeaders !== undefined ? settings.callbackCountLeaders : settings.callbackCount)
    : activeHeat && activeHeat.role === "Follow"
      ? (settings.callbackCountFollowers !== undefined ? settings.callbackCountFollowers : settings.callbackCount)
      : settings.callbackCount;

  const judgeTargetAlternateCount = activeHeat && activeHeat.role === "Lead"
    ? (settings.alternateCountLeaders !== undefined ? settings.alternateCountLeaders : (settings.alternateCount || 0))
    : activeHeat && activeHeat.role === "Follow"
      ? (settings.alternateCountFollowers !== undefined ? settings.alternateCountFollowers : (settings.alternateCount || 0))
      : (settings.alternateCount || 0);

  const judgeStatusRows = activeHeat
    ? expectedJudgesForActiveHeat.map((j) => {
        const heatCompetitorsForJudge = getJudgeHeatCompetitors(activeHeat, competitors, j.role);
        const recordByBib: Record<string, ScoreRecord> = {};
        scores
          .filter((s) => s.judgeId === j.name && s.heatId === activeHeat.id)
          .forEach((s) => { recordByBib[s.competitorBib] = s; });

        const scoredCount = heatCompetitorsForJudge.filter((c) => !!recordByBib[c.bib]).length;
        const totalCount = heatCompetitorsForJudge.length;

        const yesCount = heatCompetitorsForJudge.filter((c) => recordByBib[c.bib]?.isCallback === "Yes").length;
        const altCount = heatCompetitorsForJudge.filter((c) => {
          const val = recordByBib[c.bib]?.isCallback;
          return val && val !== "No" && val !== "Yes";
        }).length;

        let areAltsSatisfied = true;
        for (let r = 1; r <= judgeTargetAlternateCount; r++) {
          const cnt = heatCompetitorsForJudge.filter((c) => recordByBib[c.bib]?.isCallback === `Alt ${r}`).length;
          if (cnt !== 1) areAltsSatisfied = false;
        }
        for (let r = judgeTargetAlternateCount + 1; r <= 3; r++) {
          const cnt = heatCompetitorsForJudge.filter((c) => recordByBib[c.bib]?.isCallback === `Alt ${r}`).length;
          if (cnt > 0) areAltsSatisfied = false;
        }

        return {
          name: j.name,
          role: j.role,
          scoredCount,
          totalCount,
          yesCount,
          altCount,
          isQuotaSatisfied: yesCount === judgeTargetCallbackCount && areAltsSatisfied,
          isFinalized: (settings.finalizedSheets || []).includes(`${activeHeat.id}:${j.name}`),
          isClaimed: (settings.claimedJudges || []).includes(j.name)
        };
      })
    : [];

  // Unified rows for the active heat editor
  const currentSplits = activeHeat ? [...(activeHeat.splits || [])].sort((a,b) => a - b) : [];
  const split1 = currentSplits[0];
  const split2 = currentSplits[1];

  const activeHeatRows = activeHeat
    ? activeHeat.competitorBibs.flatMap((bibOrId, idx) => {
        if (bibOrId.includes("_")) {
          // Backward compatibility or custom paired couple representation
          const [leadBib, followBib] = bibOrId.split("_");
          const lead = competitors.find(c => c.bib === leadBib);
          const follow = competitors.find(c => c.bib === followBib);
          
          const leadName = lead ? lead.name : (leadBib ? `Lead #${leadBib}` : "—");
          const followName = follow ? follow.name : (followBib ? `Follow #${followBib}` : "—");
          
          return [
            {
              id: leadBib,
              name: leadName,
              bibLabel: leadBib || "—",
              division: activeHeat.division,
              role: "Lead" as const,
              index: idx,
              subHeat: 1
            },
            {
              id: followBib,
              name: followName,
              bibLabel: followBib || "—",
              division: activeHeat.division,
              role: "Follow" as const,
              index: idx,
              subHeat: 1
            }
          ];
        } else {
          // Flat individual competitor (Modern, correct way)
          const comp = competitors.find(c => c.bib === bibOrId);
          const name = comp ? comp.name : `Dancer #${bibOrId}`;
          const bibLabel = bibOrId;
          const division = comp ? comp.division : activeHeat.division;
          const role = comp ? comp.role : "Lead"; // default fallback
          
          // Calculate sub-heat
          let subHeat = 1;
          if (split1 !== undefined && idx > split1) {
            if (split2 !== undefined && idx > split2) {
              subHeat = 3;
            } else {
              subHeat = 2;
            }
          } else if (split1 === undefined && split2 !== undefined && idx > split2) {
            subHeat = 2;
          }

          return [{
            id: bibOrId,
            name,
            bibLabel,
            division,
            role,
            index: idx,
            subHeat
          }];
        }
      })
    : [];

  const orderedHeatRows = activeHeat
    ? (sortingMode === "bib"
        ? [...activeHeatRows].sort((a, b) => a.bibLabel.localeCompare(b.bibLabel, undefined, { numeric: true }))
        : activeHeatRows)
    : [];

  const leadRows = activeHeat
    ? orderedHeatRows
        .filter(row => row.role === "Lead")
        .map((row, idx) => ({ ...row, index: idx }))
    : [];

  const followRows = activeHeat
    ? orderedHeatRows
        .filter(row => row.role === "Follow")
        .map((row, idx) => ({ ...row, index: idx }))
    : [];

  const handleMoveToHeat = async (idx: number, targetHeat: 1 | 2 | 3) => {
    if (!activeHeat) return;
    
    // Distribute current rows (excluding the one we are moving) into 3 sub-heats based on activeHeatRows
    const heat1: string[] = [];
    const heat2: string[] = [];
    const heat3: string[] = [];

    activeHeatRows.forEach((row) => {
      if (row.index === idx) return; // skip the moving one
      if (row.subHeat === 1) {
        heat1.push(row.id);
      } else if (row.subHeat === 2) {
        heat2.push(row.id);
      } else {
        heat3.push(row.id);
      }
    });

    const movingId = activeHeatRows[idx].id;

    if (targetHeat === 1) {
      heat1.push(movingId);
    } else if (targetHeat === 2) {
      heat2.push(movingId);
    } else {
      heat3.push(movingId);
    }

    const newBibs = [...heat1, ...heat2, ...heat3];

    // Recalculate split indices
    const newSplits: number[] = [];
    if (heat1.length > 0 && (heat2.length > 0 || heat3.length > 0)) {
      newSplits.push(heat1.length - 1);
    }
    if (heat2.length > 0 && heat3.length > 0) {
      newSplits.push(heat1.length + heat2.length - 1);
    }

    await onUpdateHeat(activeHeat.id, {
      competitorBibs: newBibs,
      ...(activeHeat.role === "Mixed" ? {
        couples: newBibs.map(id => {
          const [leadBib, followBib] = id.split("_");
          return { id, leadBib: leadBib || "", followBib: followBib || "" };
        })
      } : {}),
      splits: newSplits.sort((a, b) => a - b),
      isCustom: true
    });
  };

  const handleSetCutOffPoint = async (index: number, type: "none" | "split1" | "split2") => {
    if (!activeHeat) return;
    let newSplits = [...(activeHeat.splits || [])];

    if (type === "none") {
      newSplits = newSplits.filter(s => s !== index);
    } else if (type === "split1") {
      newSplits = newSplits.filter(s => s !== index);
      if (newSplits.length === 0) {
        newSplits = [index];
      } else {
        newSplits = [index, newSplits[0]];
      }
    } else if (type === "split2") {
      newSplits = newSplits.filter(s => s !== index);
      if (newSplits.length === 0) {
        newSplits = [index];
      } else {
        newSplits = [newSplits[0], index];
      }
    }

    const finalSplits = Array.from(new Set(newSplits)).sort((a,b) => a - b).slice(0, 2);
    await onUpdateHeat(activeHeat.id, { splits: finalSplits, isCustom: true });
  };

  useEffect(() => {
    if (activeHeat) {
      setSliderIndex(1);
    }
  }, [activeHeat?.id]);
  const activeHeatScores = activeHeat ? scores.filter((s) => s.heatId === activeHeat.id) : [];
  const activeJudges = Array.from(new Set(activeHeatScores.map((s) => s.judgeId)));
  const rawActiveHeatCompetitors = activeHeat 
    ? activeHeat.competitorBibs.map((bib) => competitors.find((c) => c.bib === bib)).filter((c): c is Competitor => !!c)
    : [];
  const activeHeatCompetitors = activeHeat
    ? (sortingMode === "bib"
        ? [...rawActiveHeatCompetitors].sort((a, b) => a.bib.localeCompare(b.bib, undefined, { numeric: true }))
        : rawActiveHeatCompetitors)
    : [];

  const getExpectedJudgesForHeat = (heat: Heat) => {
    const defaultNames = ["Judge A", "Judge B", "Judge C", "Judge D", "Judge E"];
    const defaultRoles = ["None", "None", "None", "None", "None"];
    const names = settings.judgeNames || defaultNames;
    const roles = settings.judgeRoles || defaultRoles;
    const chiefName = settings.chiefJudgeName || "Chief Judge";
    const chiefRole = settings.chiefJudgeRole || "Both";

    const expected: string[] = [];

    const isRoleExpected = (role: string) => {
      if (role === "None") return false;
      const isHeatFinals = heat.heatType === "Finals";
      if (isHeatFinals) {
        return role === "Finals" || role === "Both";
      } else {
        if (role === "Finals") return false;
        if (heat.role === "Lead") return role === "Leaders" || role === "Both";
        if (heat.role === "Follow") return role === "Followers" || role === "Both";
        if (heat.role === "Mixed") return role === "Leaders" || role === "Followers" || role === "Both";
      }
      return false;
    };

    names.forEach((name, idx) => {
      const role = roles[idx] || "Finals";
      if (isRoleExpected(role)) {
        expected.push(name);
      }
    });

    if (isRoleExpected(chiefRole)) {
      expected.push(chiefName);
    }

    return expected;
  };

  const getExpectedCompetitorsForJudge = (heat: Heat, judgeId: string) => {
    const defaultNames = ["Judge A", "Judge B", "Judge C", "Judge D", "Judge E"];
    const defaultRoles = ["None", "None", "None", "None", "None"];
    const names = settings.judgeNames || defaultNames;
    const roles = settings.judgeRoles || defaultRoles;
    const chiefName = settings.chiefJudgeName || "Chief Judge";
    const chiefRole = settings.chiefJudgeRole || "Both";

    let judgeRole: "Leaders" | "Followers" | "Finals" | "Both" | "None" = "None";
    if (judgeId === chiefName) {
      judgeRole = chiefRole;
    } else {
      const idx = names.indexOf(judgeId);
      if (idx !== -1) {
        judgeRole = roles[idx] as any;
      }
    }

    const isHeatFinals = heat.heatType === "Finals" || heat.name.includes("Finals");
    const rawHeatCompetitors = heat.competitorBibs
      .map((bib) => {
        const comp = competitors.find((c) => c.bib === bib);
        if (comp) {
          if (comp.checkedIn && !comp.scratched) {
            return comp;
          }
          return undefined;
        }

        if (bib.includes("_")) {
          const [leadBib, followBib] = bib.split("_");
          const lead = competitors.find((c) => c.bib === leadBib);
          const follow = competitors.find((c) => c.bib === followBib);

          const isLeadOk = lead ? (lead.checkedIn && !lead.scratched) : false;
          const isFollowOk = follow ? (follow.checkedIn && !follow.scratched) : false;
          if (!isLeadOk || !isFollowOk) {
            return undefined;
          }

          const isFinals = heat.heatType === "Finals" || heat.name.includes("Finals");

          if (isFinals || judgeRole === "Both") {
            const leadName = lead ? lead.name : `Lead #${leadBib}`;
            const followName = follow ? follow.name : `Follow #${followBib}`;
            return {
              bib,
              name: `${leadName} & ${followName}`,
              division: heat.division,
              role: "Lead" as const,
              checkedIn: true
            } as Competitor;
          } else if (judgeRole === "Leaders") {
            return lead;
          } else if (judgeRole === "Followers") {
            return follow;
          } else {
            const leadName = lead ? lead.name : `Lead #${leadBib}`;
            const followName = follow ? follow.name : `Follow #${followBib}`;
            return {
              bib,
              name: `${leadName} & ${followName}`,
              division: heat.division,
              role: "Lead" as const,
              checkedIn: true
            } as Competitor;
          }
        }
        return undefined;
      })
      .filter((c): c is Competitor => !!c);

    return rawHeatCompetitors.filter((c) => {
      if (isHeatFinals) {
        return true;
      }
      if (judgeRole === "Leaders") {
        return c.role === "Lead";
      }
      if (judgeRole === "Followers") {
        return c.role === "Follow";
      }
      return true;
    });
  };

  const expectedJudges = activeHeat ? getExpectedJudgesForHeat(activeHeat) : [];

  const isNextTab = activeHeatControlTab === "next";
  const currentJudgingStyle = isNextTab ? (settings.nextJudgingStyle || "raw") : settings.judgingStyle;

  const isAllJudgesComplete = !!(
    activeHeat && 
    activeHeat.competitorBibs.length > 0 && 
    expectedJudges.length > 0 && 
    expectedJudges.every(judgeId => {
      const isFinalized = !!settings.finalizedSheets?.includes(`${activeHeat.id}:${judgeId}`);
      const judgeScores = activeHeatScores.filter(s => s.judgeId === judgeId);
      const expectedCompetitors = getExpectedCompetitorsForJudge(activeHeat, judgeId);
      const scoresComplete = currentJudgingStyle === "callback"
        ? true
        : expectedCompetitors.every(comp => 
            judgeScores.some(s => s.competitorBib === comp.bib)
          );
      return isFinalized && scoresComplete;
    })
  );

  const liveHeat = heats.find((h) => h.id === settings.currentHeatId);
  const isLiveHeatComplete = !!(
    liveHeat && 
    liveHeat.competitorBibs.length > 0 && 
    (() => {
      const expectedLiveJudges = getExpectedJudgesForHeat(liveHeat);
      const liveHeatScores = scores.filter((s) => s.heatId === liveHeat.id);
      return expectedLiveJudges.length > 0 && expectedLiveJudges.every(judgeId => {
        const isFinalized = !!settings.finalizedSheets?.includes(`${liveHeat.id}:${judgeId}`);
        const judgeScores = liveHeatScores.filter(s => s.judgeId === judgeId);
        const expectedCompetitors = getExpectedCompetitorsForJudge(liveHeat, judgeId);
        const scoresComplete = settings.judgingStyle === "callback"
          ? true
          : expectedCompetitors.every(comp => 
              judgeScores.some(s => s.competitorBib === comp.bib)
            );
        return isFinalized && scoresComplete;
      });
    })()
  );

  const canCompleteHeat = isLiveHeatComplete;

  // Current / Next Contest Parameters States
  const [contestType, setContestType] = useState<"Jack & Jill" | "Strictly Swing" | "Routine">(settings.contestType || "Jack & Jill");
  const [division, setDivision] = useState<string>(settings.division || "Novice");
  const [heatType, setHeatType] = useState<"Prelim" | "Semi-Final" | "Quarter Final" | "Finals">(settings.heatType || "Prelim");

  const currentCallbackCount = isNextTab ? (settings.nextCallbackCount || 5) : settings.callbackCount;
  const currentAlternateCount = isNextTab ? (settings.nextAlternateCount !== undefined ? settings.nextAlternateCount : 2) : (settings.alternateCount !== undefined ? settings.alternateCount : 2);

  const currentCallbackCountLeaders = isNextTab
    ? (settings.nextCallbackCountLeaders !== undefined ? settings.nextCallbackCountLeaders : currentCallbackCount)
    : (settings.callbackCountLeaders !== undefined ? settings.callbackCountLeaders : settings.callbackCount);

  const currentAlternateCountLeaders = isNextTab
    ? (settings.nextAlternateCountLeaders !== undefined ? settings.nextAlternateCountLeaders : currentAlternateCount)
    : (settings.alternateCountLeaders !== undefined ? settings.alternateCountLeaders : (settings.alternateCount !== undefined ? settings.alternateCount : 2));

  const currentCallbackCountFollowers = isNextTab
    ? (settings.nextCallbackCountFollowers !== undefined ? settings.nextCallbackCountFollowers : currentCallbackCount)
    : (settings.callbackCountFollowers !== undefined ? settings.callbackCountFollowers : settings.callbackCount);

  const currentAlternateCountFollowers = isNextTab
    ? (settings.nextAlternateCountFollowers !== undefined ? settings.nextAlternateCountFollowers : currentAlternateCount)
    : (settings.alternateCountFollowers !== undefined ? settings.alternateCountFollowers : (settings.alternateCount !== undefined ? settings.alternateCount : 2));

  // Sync state with settings changes
  useEffect(() => {
    const isNext = activeHeatControlTab === "next";
    const currentParamsStr = JSON.stringify({
      contestType: isNext ? (settings.nextContestType || settings.contestType || "Jack & Jill") : (settings.contestType || "Jack & Jill"),
      division: isNext ? (settings.nextDivision || settings.division || "Novice") : (settings.division || "Novice"),
      heatType: isNext ? (settings.nextHeatType || settings.heatType || "Prelim") : (settings.heatType || "Prelim"),
      activeTab: activeHeatControlTab
    });

    if (currentParamsStr !== lastSyncedContestParamsRef.current) {
      if (isNext) {
        setContestType(settings.nextContestType || settings.contestType || "Jack & Jill");
        setDivision(settings.nextDivision || settings.division || "Novice");
        setHeatType(settings.nextHeatType || settings.heatType || "Prelim");
      } else {
        setContestType(settings.contestType || "Jack & Jill");
        setDivision(settings.division || "Novice");
        setHeatType(settings.heatType || "Prelim");
      }
      lastSyncedContestParamsRef.current = currentParamsStr;
    }
  }, [settings, activeHeatControlTab]);

  // Auto-sync the Create Heat Sheet division and pre-populate selected dancers matching the division from registration
  useEffect(() => {
    const isNewDivOrRole = division !== lastPopulatedDivRef.current || newHeatRole !== lastPopulatedRoleRef.current;
    const initialLoadOccurred = competitors.length > 0 && !hasPopulatedRef.current;

    if (isNewDivOrRole || initialLoadOccurred) {
      const matching = competitors.filter((c) => {
        const matchesDiv = c.division === division;
        const matchesRole = newHeatRole === "Mixed" || c.role === newHeatRole;
        return matchesDiv && matchesRole;
      });
      setSelectedBibs(matching.map((c) => c.bib));
      lastPopulatedDivRef.current = division;
      lastPopulatedRoleRef.current = newHeatRole;
      if (competitors.length > 0) {
        hasPopulatedRef.current = true;
      }
    }
  }, [division, competitors, newHeatRole]);

  const getDivisionsForContest = (contest: string) => {
    if (contest === "Routine") {
      return ["Novice", "Intermediate", "Open"];
    }
    return ["Newcomer", "Novice", "Intermediate", "Advance", "All-Star", "Pro", "Open"];
  };

  const handleContestTypeChange = (newContest: "Jack & Jill" | "Strictly Swing" | "Routine") => {
    setContestType(newContest);
    const validDivs = getDivisionsForContest(newContest);
    if (!validDivs.includes(division)) {
      setDivision(validDivs[0]);
    }
    // Routines are always judged as a Finals-phase couples round.
    if (newContest === "Routine" && heatType !== "Finals") {
      setHeatType("Finals");
    }
  };

  const handleApplyContestParameters = async () => {
    setLoading(true);
    try {
      if (activeHeatControlTab === "next") {
        await onUpdateSettings({
          nextContestType: contestType,
          nextDivision: division,
          nextHeatType: heatType
        });
      } else {
        // If there is an active Live Heat and floor coordinator check-in has not been finalized, adjust the current heat
        if (settings.currentHeatId && !settings.checkInFinalized) {
          const formattedName = `${division} ${contestType} - ${heatType}`;
          const computedRole = "Mixed";
          const isCouplesHeat = (contestType === "Routine" || heatType === "Finals");
          
          const matchingBibs = competitors
            .filter((c) => {
              const matchesDiv = c.division === division;
              return matchesDiv && c.checkedIn && !c.scratched;
            })
            .map((c) => c.bib);

          // Build couples only if it's a couples heat (Routine or Finals)
          let matchingCouples: any[] = [];
          if (isCouplesHeat) {
            const leads = competitors.filter(c => c.division === division && c.role === "Lead" && c.checkedIn && !c.scratched).map(c => c.bib);
            const follows = competitors.filter(c => c.division === division && c.role === "Follow" && c.checkedIn && !c.scratched).map(c => c.bib);
            const couplesCount = Math.max(leads.length, follows.length);
            for (let i = 0; i < couplesCount; i++) {
              const lead = leads[i] || "";
              const follow = follows[i] || "";
              matchingCouples.push({ id: `${lead}_${follow}`, leadBib: lead, followBib: follow });
            }
          }

          await onUpdateHeat(settings.currentHeatId, {
            name: formattedName,
            division: division,
            role: computedRole,
            competitorBibs: isCouplesHeat ? matchingCouples.map(c => c.id) : matchingBibs,
            couples: matchingCouples,
            isCustom: false
          });
        }

        await onUpdateSettings({
          contestType,
          division,
          heatType
        });
      }
      // Collapse Contest Config & Expand Create Heat Sheet
      setCollapsedCards((prev) => ({
        ...prev,
        contestConfig: true,
        createHeat: false,
      }));
    } catch (err) {
      alert("Failed to update contest parameters.");
    } finally {
      setLoading(false);
    }
  };

  const handleAutoFillHeatForm = async () => {
    const formattedName = `${division} ${contestType} - ${heatType}`;
    setNewHeatName(formattedName);
    const computedRole = "Mixed";
    setNewHeatRole(computedRole);

    const isCouplesHeat = (contestType === "Routine" || heatType === "Finals");

    try {
      let finalBibs: string[] = [];
      if (isCouplesHeat) {
        const leads = competitors.filter(c => c.division === division && c.role === "Lead" && c.checkedIn && !c.scratched).map(c => c.bib);
        const follows = competitors.filter(c => c.division === division && c.role === "Follow" && c.checkedIn && !c.scratched).map(c => c.bib);
        const couplesCount = Math.max(leads.length, follows.length);
        for (let i = 0; i < couplesCount; i++) {
          const lead = leads[i] || "";
          const follow = follows[i] || "";
          finalBibs.push(`${lead}_${follow}`);
        }
      } else {
        finalBibs = competitors
          .filter((c) => c.division === division && c.checkedIn && !c.scratched)
          .map((c) => c.bib);
      }

      await onCreateHeat({
        name: formattedName,
        division: division,
        role: computedRole,
        competitorBibs: finalBibs,
        heatType: heatType,
        contestType: contestType
      }, "next");

      setActiveHeatControlTab("next");
    } catch (err) {
      console.error("Failed to automatically pre-create next heat:", err);
    }

    // Collapse Contest Config
    setCollapsedCards((prev) => ({
      ...prev,
      contestConfig: true,
    }));
  };
  
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [resetStatus, setResetStatus] = useState<string | null>(null);

  const handleCreateHeatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setFormSuccess("");

    if (!newHeatName.trim()) {
      setFormError("Heat name is required.");
      return;
    }

    if (selectedBibs.length === 0) {
      setFormError("Please select at least one competitor to assign to this heat.");
      return;
    }

    if (settings.currentHeatId && settings.queuedHeatId) {
      setFormError("A maximum of 2 contests (1 Live Contest and 1 Next Contest) can be available at a time. Please complete or clear a contest before creating a new one.");
      return;
    }

    if (activeHeatControlTab === "live" && settings.currentHeatId) {
      setFormError("A Live Contest is already active. To prepare the upcoming contest instead, please switch to the 'Next Contest' tab or complete the current Live Contest.");
      return;
    }

    if (activeHeatControlTab === "next" && settings.queuedHeatId) {
      setFormError("A Next Contest is already queued. Please complete the current Live Contest to promote the queued contest before preparing a new one.");
      return;
    }

    if (activeHeatControlTab === "next" && !settings.checkInFinalized) {
      setFormError("The Live Contest's check-in sheet must be finalized before the Next Contest's check-in sheet can be created.");
      return;
    }

    setLoading(true);
    try {
      await onCreateHeat({
        name: newHeatName.trim(),
        division: division,
        role: newHeatRole,
        competitorBibs: selectedBibs,
        heatType: heatType,
        contestType: contestType
      }, activeHeatControlTab);

      // Once a check-in sheet has been created for this division, close registration
      // for that division (regardless of contest phase) so the roster can't shift underneath it.
      const alreadyLocked = settings.lockedDivisions || [];
      if (!alreadyLocked.includes(division)) {
        await onUpdateSettings({ lockedDivisions: [...alreadyLocked, division] });
      }

      setFormSuccess(`Heat "${newHeatName}" created successfully with ${selectedBibs.length} dancers! Registration for ${division} is now closed.`);
      setNewHeatName("");
      setSelectedBibs([]);
      setCollapsedCards((prev) => ({
        ...prev,
        createHeat: true,
        scoringSheetEditor: false
      }));
    } catch (err: any) {
      setFormError(err.message || "Failed to create heat.");
    } finally {
      setLoading(false);
    }
  };

  const toggleSelectCompetitor = (bib: string) => {
    if (selectedBibs.includes(bib)) {
      setSelectedBibs((prev) => prev.filter((id) => id !== bib));
    } else {
      setSelectedBibs((prev) => [...prev, bib]);
    }
  };

  const handleSelectAllCheckedIn = () => {
    // Select all competitors that match the chosen division & role
    const matching = competitors.filter((c) => {
      const matchesDiv = c.division === division;
      const matchesRole = newHeatRole === "Mixed" || c.role === newHeatRole;
      return matchesDiv && matchesRole;
    });

    setSelectedBibs(matching.map((c) => c.bib));
  };

  const handleSimulate = async () => {
    if (!settings.currentHeatId) {
      alert("Please select an active heat first!");
      return;
    }
    setLoading(true);
    try {
      await onSimulateScores(settings.currentHeatId);
      alert("Simulated scores generated successfully for 3 judges!");
    } catch (err) {
      alert("Failed to simulate scores.");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    setLoading(true);
    setResetStatus("Resetting...");
    try {
      await onResetDatabase();
      setResetStatus("Database reset to original seed state successfully.");
      setShowResetConfirm(false);
      setTimeout(() => setResetStatus(null), 5000);
    } catch (err) {
      setResetStatus("Failed to reset database.");
      setTimeout(() => setResetStatus(null), 5000);
    } finally {
      setLoading(false);
    }
  };

  const handleClearAll = async () => {
    if (!onClearAllDatabase) return;
    setLoading(true);
    try {
      await onClearAllDatabase();
      setShowClearConfirm(false);
      alert("Database completely cleared.");
    } catch (err) {
      alert("Failed to clear database.");
    } finally {
      setLoading(false);
    }
  };

  // Competitors matching chosen form division & role
  const formMatchingCompetitors = competitors.filter((c) => {
    const matchesDiv = c.division === division;
    const matchesRole = newHeatRole === "Mixed" || c.role === newHeatRole;
    return matchesDiv && matchesRole;
  });

  return (
    <React.Fragment>
      {/* Floating Admin Heat Control Bar */}
      <div
        id="admin-floating-nav"
        className={`fixed top-4 right-4 z-50 transition-all duration-300 ${
          isFloatingBarHovered
            ? "opacity-100 scale-100"
            : "opacity-40 hover:opacity-100 focus-within:opacity-100 md:opacity-50 scale-95 hover:scale-100"
        }`}
        onMouseEnter={() => setIsFloatingBarHovered(true)}
        onMouseLeave={() => setIsFloatingBarHovered(false)}
      >
        <div className="bg-slate-900/95 dark:bg-slate-950/95 border border-slate-700/50 text-slate-100 px-3 py-1.5 rounded-full shadow-2xl flex items-center gap-1.5 backdrop-blur-md">
          <button
            type="button"
            onClick={() => setActiveHeatControlTab("live")}
            className={`px-3 py-1 text-xs font-bold rounded-full transition-all flex items-center gap-1.5 cursor-pointer ${
              activeHeatControlTab === "live"
                ? "bg-rose-600 text-white shadow-md shadow-rose-600/25"
                : "text-slate-400 hover:text-slate-200"
            }`}
            title="Active Live Contest"
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500"></span>
            </span>
            Live Contest
          </button>
          <button
            type="button"
            disabled={!settings.queuedHeatId}
            onClick={() => setActiveHeatControlTab("next")}
            className={`px-3 py-1 text-xs font-bold rounded-full transition-all flex items-center gap-1.5 ${
              !settings.queuedHeatId
                ? "bg-slate-800 text-slate-500 dark:bg-slate-900 text-slate-600 cursor-not-allowed opacity-30"
                : activeHeatControlTab === "next"
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/25"
                  : "text-slate-400 hover:text-slate-200 cursor-pointer"
            }`}
            title="Queued Next Contest"
          >
            Next Contest
            {settings.queuedHeatId && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            )}
          </button>
        </div>
      </div>

      <div className="space-y-6 max-w-4xl mx-auto pb-16">
        {/* Beautiful Static Admin Header */}
        <div className={`p-6 rounded-2xl border transition-all flex flex-col md:flex-row items-center justify-between gap-4 ${
          isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 shadow-sm text-slate-800"
        }`}>
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-violet-500 animate-pulse" />
              <h1 className="text-xl font-extrabold tracking-tight">Contest Administration</h1>
              
              {/* Readiness Indicator */}
              {settings.checkInFinalized ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-green-500/10 text-green-500 border border-green-500/25">
                  <span className="w-1 h-1 rounded-full bg-green-500 animate-pulse" />
                  Ready
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/25">
                  <span className="w-1 h-1 rounded-full bg-amber-500" />
                  Not Ready
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {activeHeatControlTab === "live"
                ? `Live Mode — Active Contest: ${activeHeat?.name || "None Selected"}`
                : `Next Mode — Queued Contest: ${activeHeat?.name || "None Prepared"}`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
            <div className="flex p-0.5 bg-slate-100 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 w-full md:w-56">
              <button
                id="heat-tab-live-btn"
                type="button"
                onClick={() => setActiveHeatControlTab("live")}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  activeHeatControlTab === "live"
                    ? "bg-rose-600 text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500"></span>
                </span>
                Live Contest
              </button>
              <button
                id="heat-tab-next-btn"
                type="button"
                disabled={!settings.queuedHeatId}
                onClick={() => setActiveHeatControlTab("next")}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  !settings.queuedHeatId
                    ? "bg-slate-200 dark:bg-slate-900 text-slate-400 dark:text-slate-600 cursor-not-allowed opacity-50"
                    : activeHeatControlTab === "next"
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer"
                }`}
              >
                Next Contest
                {settings.queuedHeatId && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                )}
              </button>
            </div>

            {activeHeatControlTab === "live" && (
              <button
                type="button"
                onClick={() => toggleCard("heatsCatalog")}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition-all flex items-center gap-1.5 cursor-pointer ${
                  !collapsedCards.heatsCatalog
                    ? "bg-violet-600 border-violet-600 text-white"
                    : isDarkMode
                      ? "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750"
                      : "bg-slate-50 border-slate-200 text-slate-750 hover:bg-slate-100"
                }`}
              >
                <Trophy className="w-3.5 h-3.5" />
                Contests ({(settings.completedResults || []).length})
              </button>
            )}
          </div>
        </div>

        {settings.checkInFinalized && (
          <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400 text-xs flex items-center justify-between gap-3 animate-fade-in shadow-xs">
            <div className="flex items-center gap-2.5">
              <CheckSquare className="w-5 h-5 flex-shrink-0 text-green-500 animate-pulse" />
              <div>
                <strong className="block text-sm font-bold text-green-500">Check-In board finalized by Floor Coordinator!</strong>
                <span className="text-[11px] text-slate-400">All competitor registers are locked. All heats have been auto-populated with active checked-in dancers.</span>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded bg-green-500 text-slate-950 font-mono text-[9px] font-bold uppercase tracking-wider animate-pulse">
              ROSTER ACTIVE
            </span>
          </div>
        )}

        {/* Contest Parameters Setup */}
        <div className={`p-6 rounded-2xl border transition-all ${isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 shadow-sm text-slate-800"}`}>
          <div 
            className="flex items-center justify-between mb-3 cursor-pointer select-none"
            onClick={() => toggleCard("contestConfig")}
          >
            <div className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-violet-500" />
              <h2 className="text-base font-bold tracking-tight">Contest Configuration</h2>
            </div>
            {collapsedCards.contestConfig ? (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            )}
          </div>

          {!collapsedCards.contestConfig && (
            <>
              <p className="text-[11px] text-slate-400 mb-4 leading-relaxed">
                Specify type, division, and heat round rules. Click apply to save, then auto-fill the builder to construct matched heats.
              </p>

              <div className="space-y-3.5">
                {/* Contest Type */}
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 font-mono uppercase tracking-wider mb-1.5">Contest Type</label>
                  <select
                    id="contest-type-setup"
                    value={contestType}
                    onChange={(e) => handleContestTypeChange(e.target.value as any)}
                    className={`w-full px-3 py-2 text-xs rounded-xl border focus:outline-none focus:ring-1 focus:ring-violet-500 font-medium ${
                      isDarkMode ? "bg-slate-800 border-slate-700 text-slate-100" : "bg-slate-50 border-slate-200 text-slate-800"
                    }`}
                  >
                    <option value="Jack & Jill">Jack & Jill</option>
                    <option value="Strictly Swing">Strictly Swing</option>
                    <option value="Routine">Routine</option>
                  </select>
                </div>

                {/* Division Selection */}
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 font-mono uppercase tracking-wider mb-1.5">Division Type</label>
                  <select
                    id="division-setup"
                    value={division}
                    onChange={(e) => setDivision(e.target.value)}
                    className={`w-full px-3 py-2 text-xs rounded-xl border focus:outline-none focus:ring-1 focus:ring-violet-500 font-medium ${
                      isDarkMode ? "bg-slate-800 border-slate-700 text-slate-100" : "bg-slate-50 border-slate-200 text-slate-800"
                    }`}
                  >
                    {getDivisionsForContest(contestType).map((div) => (
                      <option key={div} value={div}>{div}</option>
                    ))}
                  </select>
                </div>

                {/* Heat Type */}
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 font-mono uppercase tracking-wider mb-1.5">Contest Phase</label>
                  <select
                    id="heat-type-setup"
                    value={heatType}
                    disabled={contestType === "Routine"}
                    onChange={(e) => {
                      const newHeatType = e.target.value as any;
                      setHeatType(newHeatType);
                      const isNext = activeHeatControlTab === "next";
                      const judgingStyleForPhase = newHeatType === "Finals" ? "placement" : "raw";
                      if (isNext) {
                        onUpdateSettings({
                          nextHeatType: newHeatType,
                          nextContestType: contestType,
                          nextDivision: division,
                          nextJudgingStyle: judgingStyleForPhase
                        });
                      } else {
                        onUpdateSettings({
                          heatType: newHeatType,
                          contestType: contestType,
                          division: division,
                          judgingStyle: judgingStyleForPhase
                        });
                      }
                    }}
                    className={`w-full px-3 py-2 text-xs rounded-xl border focus:outline-none focus:ring-1 focus:ring-violet-500 font-medium ${
                      contestType === "Routine" ? "opacity-50 cursor-not-allowed" : ""
                    } ${
                      isDarkMode ? "bg-slate-800 border-slate-700 text-slate-100" : "bg-slate-50 border-slate-200 text-slate-800"
                    }`}
                  >
                    <option value="Prelim">Prelim</option>
                    <option value="Quarter Final">Quarter Final</option>
                    <option value="Semi-Final">Semi-Final</option>
                    <option value="Finals">Finals</option>
                  </select>
                  {contestType === "Routine" && (
                    <p className="text-[10px] text-slate-400 mt-1 italic">Routines are always judged as Finals.</p>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-2 pt-1.5">
                  <button
                    id="save-contest-params-btn"
                    onClick={handleApplyContestParameters}
                    disabled={loading || (activeHeatControlTab === "next" && !settings.currentHeatId)}
                    className={`w-full py-2 text-white text-xs font-bold rounded-xl shadow-sm flex items-center justify-center gap-1.5 transition-all ${
                      loading || (activeHeatControlTab === "next" && !settings.currentHeatId)
                        ? "bg-slate-300 dark:bg-slate-800 text-slate-500 cursor-not-allowed opacity-50"
                        : "bg-violet-600 hover:bg-violet-700 cursor-pointer"
                    }`}
                  >
                    <Settings className="w-3.5 h-3.5" />
                    {activeHeatControlTab === "next" ? "Prepare Heat" : "Configure Now"}
                  </button>
                  {activeHeatControlTab !== "next" && (
                    <button
                      id="autofill-heat-builder-btn"
                      onClick={handleAutoFillHeatForm}
                      disabled={!!settings.queuedHeatId || !settings.currentHeatId}
                      title={!settings.currentHeatId ? "A Live Contest must be configured first" : (settings.queuedHeatId ? "A Next Contest is already queued" : undefined)}
                      className={`w-full py-2 text-xs font-semibold rounded-xl border flex items-center justify-center gap-1.5 transition-all ${
                        (settings.queuedHeatId || !settings.currentHeatId)
                          ? "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 border-slate-200 dark:border-slate-800 cursor-not-allowed opacity-50"
                          : "bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 cursor-pointer"
                      }`}
                    >
                      <PlusCircle className="w-3.5 h-3.5 text-violet-500" />
                      Prepare Next
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Orchestration & Permissions Control */}
        <div className={`p-6 rounded-2xl border transition-all ${isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 shadow-sm text-slate-800"}`}>
          <div 
            className="flex items-center justify-between mb-3 cursor-pointer select-none"
            onClick={() => toggleCard("portalAccess")}
          >
            <div className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-violet-500" />
              <h2 className="text-base font-bold tracking-tight">Active Portal Access</h2>
            </div>
            {collapsedCards.portalAccess ? (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            )}
          </div>

          {!collapsedCards.portalAccess && (
            <>
              <p className="text-[11px] text-slate-400 mb-4 leading-relaxed">
                Lock down or open up modules in real-time. Changes apply instantly to active dancer, staff, or public sessions.
              </p>

              <div className="space-y-2.5">
                {/* Registration Permission */}
                <div className="flex items-center justify-between p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40">
                  <div>
                    <span className="text-xs font-bold block">Competitor Registration</span>
                    <span className="text-[9px] text-slate-400">Self-registration system</span>
                  </div>
                  <button
                    id="toggle-reg-permission-btn"
                    onClick={() => onUpdateSettings({ registrationEnabled: settings.registrationEnabled === false ? true : false })}
                    className={`px-2.5 py-1 text-[9px] font-bold rounded-lg uppercase tracking-wider border cursor-pointer ${
                      settings.registrationEnabled !== false
                        ? "bg-green-600/10 border-green-500/20 text-green-500"
                        : "bg-rose-600/10 border-rose-500/20 text-rose-500"
                    }`}
                  >
                    {settings.registrationEnabled !== false ? "Open" : "Locked"}
                  </button>
                </div>

                {/* Check-In Permission */}
                <div className="flex items-center justify-between p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40">
                  <div>
                    <span className="text-xs font-bold block">Staff Check-In Portal</span>
                    <span className="text-[9px] text-slate-400">Coordinator check-ins</span>
                  </div>
                  <button
                    id="toggle-checkin-permission-btn"
                    onClick={() => onUpdateSettings({ checkInEnabled: settings.checkInEnabled === false ? true : false })}
                    className={`px-2.5 py-1 text-[9px] font-bold rounded-lg uppercase tracking-wider border cursor-pointer ${
                      settings.checkInEnabled !== false
                        ? "bg-green-600/10 border-green-500/20 text-green-500"
                        : "bg-rose-600/10 border-rose-500/20 text-rose-500"
                    }`}
                  >
                    {settings.checkInEnabled !== false ? "Open" : "Locked"}
                  </button>
                </div>

                {/* Judging Permission */}
                <div className="flex items-center justify-between p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40">
                  <div>
                    <span className="text-xs font-bold block">Judges Live Scoring</span>
                    <span className="text-[9px] text-slate-400">Allow sheet submissions</span>
                  </div>
                  <button
                    id="toggle-judging-permission-btn"
                    onClick={() => onUpdateSettings({ judgingEnabled: settings.judgingEnabled === false ? true : false })}
                    className={`px-2.5 py-1 text-[9px] font-bold rounded-lg uppercase tracking-wider border cursor-pointer ${
                      settings.judgingEnabled !== false
                        ? "bg-green-600/10 border-green-500/20 text-green-500"
                        : "bg-rose-600/10 border-rose-500/20 text-rose-500"
                    }`}
                  >
                    {settings.judgingEnabled !== false ? "Open" : "Locked"}
                  </button>
                </div>

                {/* Scoresheet Publication */}
                <div className="flex items-center justify-between p-2 rounded-xl border border-violet-500/25 bg-violet-600/5 mt-1">
                  <div>
                    <span className="text-xs font-bold text-violet-500 block">Scoresheet Publication</span>
                    <span className="text-[9px] text-slate-400 font-mono">Results Dashboard status</span>
                  </div>
                  <button
                    id="toggle-publish-scoreboard-btn"
                    onClick={() => onUpdateSettings({ isPublished: settings.isPublished === false ? true : false })}
                    className={`px-2.5 py-1 text-[9px] font-bold rounded-lg uppercase tracking-wider border flex items-center gap-1.5 cursor-pointer ${
                      settings.isPublished !== false
                        ? "bg-violet-600 border-violet-600 text-white"
                        : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750"
                    }`}
                  >
                    {settings.isPublished !== false ? (
                      <>
                        <Eye className="w-3.5 h-3.5" />
                        Published
                      </>
                    ) : (
                      <>
                        <EyeOff className="w-3.5 h-3.5" />
                        Draft
                      </>
                    )}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>


        {/* Scoring Style */}
        <div className={`p-6 rounded-2xl border transition-all ${isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 shadow-sm text-slate-800"}`}>
          <div 
            className="flex items-center justify-between mb-4 cursor-pointer select-none"
            onClick={() => toggleCard("scoringConfig")}
          >
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-violet-500" />
              <h2 className="text-lg font-bold tracking-tight">Scoring Configurations</h2>
            </div>
            {collapsedCards.scoringConfig ? (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            )}
          </div>

          {!collapsedCards.scoringConfig && (
            <div className="space-y-4 font-sans text-xs">
              {/* Judging Style */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 font-mono uppercase tracking-wider mb-2">Judging System</label>
                {/* Jack & Jill / Strictly Swing + Finals: Placement only (forced).
                    Jack & Jill / Strictly Swing + any other phase: choice of Raw or Call-Back.
                    Routine (always Finals): choice of Raw or Placement. */}
                <div className="grid grid-cols-2 gap-2">
                  {(contestType === "Routine" || heatType !== "Finals") && (
                    <button
                      id="style-raw-btn"
                      onClick={() => onUpdateSettings(isNextTab ? { nextJudgingStyle: "raw" } : { judgingStyle: "raw" })}
                      className={`py-2 text-[11px] font-semibold rounded-xl border transition-all ${
                        currentJudgingStyle === "raw"
                          ? "bg-violet-600 border-violet-600 text-white shadow-sm"
                          : isDarkMode
                            ? "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750"
                            : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      Raw Score
                    </button>
                  )}
                  {(contestType === "Routine" || heatType === "Finals") && (
                    <button
                      id="style-placement-btn"
                      onClick={() => onUpdateSettings(isNextTab ? { nextJudgingStyle: "placement" } : { judgingStyle: "placement" })}
                      className={`py-2 text-[11px] font-semibold rounded-xl border transition-all ${
                        currentJudgingStyle === "placement"
                          ? "bg-violet-600 border-violet-600 text-white shadow-sm"
                          : isDarkMode
                            ? "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750"
                            : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      Placement
                    </button>
                  )}
                  {contestType !== "Routine" && heatType !== "Finals" && (
                    <button
                      id="style-callback-btn"
                      onClick={() => onUpdateSettings(isNextTab ? { nextJudgingStyle: "callback" } : { judgingStyle: "callback" })}
                      className={`py-2 text-[11px] font-semibold rounded-xl border transition-all ${
                        currentJudgingStyle === "callback"
                          ? "bg-violet-600 border-violet-600 text-white shadow-sm"
                          : isDarkMode
                            ? "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750"
                            : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      Call-Back
                    </button>
                  )}
                </div>
                {contestType !== "Routine" && heatType === "Finals" && (
                  <p className="text-[10px] text-slate-400 mt-1.5 italic">Jack & Jill / Strictly Swing finals are always scored by relative Placement.</p>
                )}
              </div>

              {/* Callbacks & Alternates Quotas */}
              {heatType !== "Finals" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
                    <h3 className="text-xs font-bold font-mono text-slate-400 uppercase tracking-wider">
                      Separate Role Quotas (Leaders & Followers)
                    </h3>
                    <span className="text-[10px] font-medium text-violet-400 font-mono">Real-time Individual Cuts</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Leaders Quota */}
                    <div className={`p-3.5 rounded-xl border ${isDarkMode ? "bg-slate-900/50 border-slate-800/80" : "bg-slate-50 border-slate-200"}`}>
                      <div className="flex items-center gap-1.5 mb-2.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <h4 className="text-xs font-bold text-slate-300">Leaders Quotas</h4>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-400 font-mono uppercase tracking-wider mb-1">
                            Callback (Yes)
                          </label>
                          <select
                            id="leader-callback-quota-select"
                            value={currentCallbackCountLeaders}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              onUpdateSettings(isNextTab ? { nextCallbackCountLeaders: val, nextCallbackCount: val } : { callbackCountLeaders: val, callbackCount: val });
                            }}
                            className={`w-full px-2.5 py-1.5 text-xs font-mono font-bold rounded-lg border focus:outline-none focus:ring-1 focus:ring-violet-500 transition-all cursor-pointer ${
                              isDarkMode 
                                ? "bg-slate-950 border-slate-800 text-slate-100" 
                                : "bg-white border-slate-200 text-slate-800"
                            }`}
                          >
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20].map((num) => (
                              <option key={num} value={num}>
                                {num} Lead{num > 1 ? "s" : ""}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-400 font-mono uppercase tracking-wider mb-1">
                            Alternates
                          </label>
                          <select
                            id="leader-alternate-quota-select"
                            value={currentAlternateCountLeaders}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              onUpdateSettings(isNextTab ? { nextAlternateCountLeaders: val, nextAlternateCount: val } : { alternateCountLeaders: val, alternateCount: val });
                            }}
                            className={`w-full px-2.5 py-1.5 text-xs font-mono font-bold rounded-lg border focus:outline-none focus:ring-1 focus:ring-violet-500 transition-all cursor-pointer ${
                              isDarkMode 
                                ? "bg-slate-950 border-slate-800 text-slate-100" 
                                : "bg-white border-slate-200 text-slate-800"
                            }`}
                          >
                            {[0, 1, 2, 3].map((num) => (
                              <option key={num} value={num}>
                                {num === 0 ? "None" : `${num} Alt`}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Followers Quota */}
                    <div className={`p-3.5 rounded-xl border ${isDarkMode ? "bg-slate-900/50 border-slate-800/80" : "bg-slate-50 border-slate-200"}`}>
                      <div className="flex items-center gap-1.5 mb-2.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                        <h4 className="text-xs font-bold text-slate-300">Followers Quotas</h4>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-400 font-mono uppercase tracking-wider mb-1">
                            Callback (Yes)
                          </label>
                          <select
                            id="follower-callback-quota-select"
                            value={currentCallbackCountFollowers}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              onUpdateSettings(isNextTab ? { nextCallbackCountFollowers: val } : { callbackCountFollowers: val });
                            }}
                            className={`w-full px-2.5 py-1.5 text-xs font-mono font-bold rounded-lg border focus:outline-none focus:ring-1 focus:ring-violet-500 transition-all cursor-pointer ${
                              isDarkMode 
                                ? "bg-slate-950 border-slate-800 text-slate-100" 
                                : "bg-white border-slate-200 text-slate-800"
                            }`}
                          >
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20].map((num) => (
                              <option key={num} value={num}>
                                {num} Follow{num > 1 ? "s" : ""}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-400 font-mono uppercase tracking-wider mb-1">
                            Alternates
                          </label>
                          <select
                            id="follower-alternate-quota-select"
                            value={currentAlternateCountFollowers}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              onUpdateSettings(isNextTab ? { nextAlternateCountFollowers: val } : { alternateCountFollowers: val });
                            }}
                            className={`w-full px-2.5 py-1.5 text-xs font-mono font-bold rounded-lg border focus:outline-none focus:ring-1 focus:ring-violet-500 transition-all cursor-pointer ${
                              isDarkMode 
                                ? "bg-slate-950 border-slate-800 text-slate-100" 
                                : "bg-white border-slate-200 text-slate-800"
                            }`}
                          >
                            {[0, 1, 2, 3].map((num) => (
                              <option key={num} value={num}>
                                {num === 0 ? "None" : `${num} Alt`}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="text-[10px] text-slate-400 leading-tight">
                    Independent targets ensure judges can finalize lead sheets and follow sheets with custom role counts.
                  </div>
                </div>
              )}

              {/* Judging Configuration section */}
              <div className="border-t border-slate-200 dark:border-slate-800 pt-4 mt-4">
                <h3 className="text-xs font-bold tracking-tight mb-3 flex items-center gap-1.5 text-violet-500 uppercase font-mono">
                  Judging Configuration
                </h3>
                
                <div className="space-y-4">
                  {/* Up to 5 judges */}
                  <div className="space-y-3">
                    <label className="block text-[10px] font-semibold text-slate-400 font-mono uppercase tracking-wider">
                      Judges & Roles (Up to 5)
                    </label>
                    
                    {localJudgeNames.map((name, idx) => (
                      <div key={idx} className="flex flex-col sm:flex-row gap-2 items-center">
                        <span className="text-[11px] font-bold font-mono text-slate-400 w-16">Judge {idx + 1}:</span>
                        <input
                          id={`judge-name-input-${idx}`}
                          type="text"
                          value={name}
                          onChange={(e) => {
                            const updated = [...localJudgeNames];
                            updated[idx] = e.target.value;
                            setLocalJudgeNames(updated);
                          }}
                          className={`flex-1 px-3 py-1.5 text-xs font-semibold rounded-xl border focus:outline-none focus:ring-1 focus:ring-violet-500 transition-all ${
                            isDarkMode 
                              ? "bg-slate-950 border-slate-800 text-slate-100 placeholder-slate-600" 
                              : "bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400"
                          }`}
                          placeholder={`Enter name for Judge ${idx + 1}`}
                        />
                        <select
                          id={`judge-role-select-${idx}`}
                          value={localJudgeRoles[idx] || "Finals"}
                          onChange={(e) => {
                            const updated = [...localJudgeRoles];
                            updated[idx] = e.target.value as "Leaders" | "Followers" | "Finals" | "None";
                            setLocalJudgeRoles(updated);
                          }}
                          className={`w-36 px-2.5 py-1.5 text-xs font-semibold rounded-xl border focus:outline-none focus:ring-1 focus:ring-violet-500 transition-all cursor-pointer ${
                            isDarkMode 
                              ? "bg-slate-950 border-slate-800 text-slate-100" 
                              : "bg-slate-50 border-slate-200 text-slate-800"
                          }`}
                        >
                          <option value="Leaders">Leaders</option>
                          <option value="Followers">Followers</option>
                          <option value="Finals">Finals</option>
                          <option value="None">None (Disabled)</option>
                        </select>
                      </div>
                    ))}
                  </div>

                  {/* 6th Chief Judge */}
                  <div className="border-t border-slate-200 dark:border-slate-800 pt-3 mt-3">
                    <label className="block text-[10px] font-semibold text-slate-400 font-mono uppercase tracking-wider mb-2">
                      Chief Judge Configuration (6th Judge)
                    </label>
                    <div className="flex flex-col sm:flex-row gap-2 items-center">
                      <span className="text-[11px] font-bold font-mono text-violet-500 w-16 font-semibold">Chief:</span>
                      <input
                        id="chief-judge-name-input"
                        type="text"
                        value={localChiefJudgeName}
                        onChange={(e) => setLocalChiefJudgeName(e.target.value)}
                        className={`flex-1 px-3 py-1.5 text-xs font-semibold rounded-xl border focus:outline-none focus:ring-1 focus:ring-violet-500 transition-all ${
                          isDarkMode 
                            ? "bg-slate-950 border-slate-800 text-slate-100 placeholder-slate-600" 
                            : "bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400"
                        }`}
                        placeholder="Enter Chief Judge name"
                      />
                      <select
                        id="chief-judge-role-select"
                        value={localChiefJudgeRole}
                        onChange={(e) => setLocalChiefJudgeRole(e.target.value as any)}
                        className={`w-36 px-2.5 py-1.5 text-xs font-semibold rounded-xl border focus:outline-none focus:ring-1 focus:ring-violet-500 transition-all cursor-pointer ${
                          isDarkMode 
                            ? "bg-slate-950 border-slate-800 text-slate-100" 
                            : "bg-slate-50 border-slate-200 text-slate-800"
                        }`}
                      >
                        <option value="Leaders">Leaders</option>
                        <option value="Followers">Followers</option>
                        <option value="Both">Both</option>
                        <option value="Finals">Finals</option>
                        <option value="None">None (Disabled)</option>
                      </select>
                    </div>
                  </div>

                  {/* Save button for Scoring and Judging configurations */}
                  <button
                    id="save-scoring-config-btn"
                    type="button"
                    onClick={async () => {
                      setLoading(true);
                      try {
                        const updatePayload = isNextTab ? {
                          nextJudgeNames: localJudgeNames,
                          nextJudgeRoles: localJudgeRoles,
                          nextChiefJudgeName: localChiefJudgeName,
                          nextChiefJudgeRole: localChiefJudgeRole
                        } : {
                          judgeNames: localJudgeNames,
                          judgeRoles: localJudgeRoles,
                          chiefJudgeName: localChiefJudgeName,
                          chiefJudgeRole: localChiefJudgeRole
                        };
                        await onUpdateSettings(updatePayload);
                        alert("Scoring & Judging configurations saved successfully.");
                        // Collapse Scoring Config
                        setCollapsedCards((prev) => ({ ...prev, scoringConfig: true }));
                      } catch (err) {
                        alert("Failed to save scoring configurations.");
                      } finally {
                        setLoading(false);
                      }
                    }}
                    className="w-full mt-2 py-2 bg-violet-600 hover:bg-violet-750 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <CheckSquare className="w-4 h-4" />
                    Save & Confirm Configurations
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className={`p-6 rounded-2xl border transition-all ${isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 shadow-sm text-slate-800"}`}>
          <div 
            className="flex items-center justify-between mb-4 cursor-pointer select-none"
            onClick={() => toggleCard("createHeat")}
          >
            <div className="flex items-center gap-2">
              <PlusCircle className="w-5 h-5 text-violet-500" />
              <div>
                <h2 className="text-lg font-bold tracking-tight">{division} {contestType} — {heatType} Check-In Sheet</h2>
                <p className="text-[10px] text-slate-400 font-medium">Generate check-in sheets for floor coordinators to manage & check-in competitors</p>
              </div>
            </div>
            {collapsedCards.createHeat ? (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            )}
          </div>

          {!collapsedCards.createHeat && (
            <form onSubmit={handleCreateHeatSubmit} className="space-y-5">
              {formError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs font-medium">
                  {formError}
                </div>
              )}
              {formSuccess && (
                <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20 text-green-500 text-xs font-medium">
                  {formSuccess}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Heat Name */}
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Heat Title</label>
                  <input
                    id="new-heat-name"
                    type="text"
                    required
                    placeholder="e.g. Novice Prelims - Heat A"
                    value={newHeatName}
                    onChange={(e) => setNewHeatName(e.target.value)}
                    className={`w-full px-3.5 py-2 text-xs rounded-xl border focus:outline-none focus:ring-1 focus:ring-violet-500 ${
                      isDarkMode ? "bg-slate-800 border-slate-700 text-slate-100 placeholder-slate-500" : "bg-slate-50 border-slate-200 text-slate-800"
                    }`}
                  />
                </div>

                {/* Division (Synced to Contest Config) */}
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Division (from Contest Configuration)</label>
                  <div className={`w-full px-3.5 py-2.5 text-xs rounded-xl border flex items-center font-extrabold ${
                    isDarkMode ? "bg-slate-800 border-slate-700 text-violet-400" : "bg-slate-50 border-slate-200 text-violet-600"
                  }`}>
                    {division}
                  </div>
                </div>

                {/* Role Select */}
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Roles</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["Mixed", "Lead", "Follow"] as const).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => {
                          setNewHeatRole(r);
                          setSelectedBibs([]);
                        }}
                        className={`py-2 text-xs font-semibold rounded-xl border transition-all ${
                          newHeatRole === r
                            ? "bg-violet-600 border-violet-600 text-white shadow-sm"
                            : isDarkMode
                              ? "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750"
                              : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        {r === "Lead" ? "Leaders" : r === "Follow" ? "Follows" : "Both"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>



              {/* Competitor Selection Block */}
              <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
                <div className="flex items-center justify-between gap-4 mb-3">
                  <div>
                    <h3 className="text-xs font-bold font-mono text-slate-400 uppercase tracking-wider">Select Dancers</h3>
                    <p className="text-[10px] text-slate-400">Pulling names from registration for {division} ({newHeatRole})</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleSelectAllCheckedIn}
                    className="text-xs font-bold text-violet-500 hover:text-violet-600 flex items-center gap-1.5"
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                    Select All
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Leaders Column */}
                  <div>
                    <h4 className="text-[10px] font-bold font-mono text-violet-500 uppercase tracking-wider mb-2 pb-1 border-b border-violet-500/10">Leaders</h4>
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {formMatchingCompetitors.filter(c => c.role === "Lead").map((c) => {
                        const isSelected = selectedBibs.includes(c.bib);
                        return (
                          <button
                            key={c.bib}
                            type="button"
                            onClick={() => toggleSelectCompetitor(c.bib)}
                            className={`w-full p-2.5 rounded-xl border text-left text-xs flex items-center justify-between transition-all ${
                              isSelected
                                ? "bg-violet-600/15 border-violet-500 text-violet-500 font-bold"
                                : "bg-yellow-400/15 border-yellow-500/40 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-400/25"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-mono bg-violet-600/10 text-violet-500 px-1.5 py-0.5 rounded text-[10px] font-bold">#{c.bib}</span>
                              <span className="truncate">{c.name}</span>
                            </div>
                            <span className="text-[9px] px-1.5 py-0.5 rounded font-mono font-semibold bg-sky-500/10 text-sky-500 border-sky-500/10">
                              {isSelected ? "Leader" : "Not Selected"}
                            </span>
                          </button>
                        );
                      })}
                      {formMatchingCompetitors.filter(c => c.role === "Lead").length === 0 && (
                        <p className="text-slate-500 text-[10px] py-3 text-center">No matching Leaders.</p>
                      )}
                    </div>
                  </div>

                  {/* Followers Column */}
                  <div>
                    <h4 className="text-[10px] font-bold font-mono text-pink-500 uppercase tracking-wider mb-2 pb-1 border-b border-pink-500/10">Followers</h4>
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {formMatchingCompetitors.filter(c => c.role === "Follow").map((c) => {
                        const isSelected = selectedBibs.includes(c.bib);
                        return (
                          <button
                            key={c.bib}
                            type="button"
                            onClick={() => toggleSelectCompetitor(c.bib)}
                            className={`w-full p-2.5 rounded-xl border text-left text-xs flex items-center justify-between transition-all ${
                              isSelected
                                ? "bg-violet-600/15 border-violet-500 text-violet-500 font-bold"
                                : "bg-yellow-400/15 border-yellow-500/40 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-400/25"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-mono bg-violet-600/10 text-violet-500 px-1.5 py-0.5 rounded text-[10px] font-bold">#{c.bib}</span>
                              <span className="truncate">{c.name}</span>
                            </div>
                            <span className="text-[9px] px-1.5 py-0.5 rounded font-mono font-semibold bg-pink-500/10 text-pink-500 border-pink-500/10">
                              {isSelected ? "Follower" : "Not Selected"}
                            </span>
                          </button>
                        );
                      })}
                      {formMatchingCompetitors.filter(c => c.role === "Follow").length === 0 && (
                        <p className="text-slate-500 text-[10px] py-3 text-center">No matching Followers.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {activeHeatControlTab === "next" && !settings.checkInFinalized && (
                <p className="text-[11px] text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
                  The Live Contest's check-in sheet must be finalized by the Floor Coordinator before the Next Contest's check-in sheet can be created.
                </p>
              )}
              <button
                id="submit-new-heat-btn"
                type="submit"
                disabled={loading || (activeHeatControlTab === "next" && !settings.checkInFinalized)}
                title={activeHeatControlTab === "next" && !settings.checkInFinalized ? "Finalize the Live Contest's check-in first" : undefined}
                className={`w-full py-2.5 rounded-xl text-white text-xs font-bold shadow-md shadow-violet-600/15 flex items-center justify-center gap-2 transition-all ${
                  loading || (activeHeatControlTab === "next" && !settings.checkInFinalized)
                    ? "bg-slate-400 dark:bg-slate-700 cursor-not-allowed opacity-60"
                    : "bg-violet-600 hover:bg-violet-750"
                }`}
              >
                <PlusCircle className="w-4 h-4" />
                {loading ? "Creating..." : "Create"}
              </button>
            </form>
          )}
        </div>

        {/* Contests Directory (Live Contest tab only) */}
        {activeHeatControlTab === "live" && (
        <div className={`p-6 rounded-2xl border transition-all ${isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 shadow-sm text-slate-800"}`}>
          <div 
            className="flex items-center justify-between mb-4 cursor-pointer select-none"
            onClick={() => toggleCard("heatsCatalog")}
          >
            <div>
              <h2 className="text-lg font-bold tracking-tight">Contests</h2>
              <p className="text-[10px] text-slate-400 font-medium">All contests completed (scored) since the last database reset</p>
            </div>
            {collapsedCards.heatsCatalog ? (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            )}
          </div>

          {!collapsedCards.heatsCatalog && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className={`${isDarkMode ? "bg-slate-800/50 text-slate-300" : "bg-slate-50 text-slate-500"} text-xs font-semibold font-mono border-b border-slate-200 dark:border-slate-800`}>
                    <th className="p-3">Name</th>
                    <th className="p-3">Division</th>
                    <th className="p-3 font-mono">No. of Competitors (total)</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                  {heats.filter((h) => (settings.completedResults || []).some((cr) => cr.heatId === h.id)).map((h) => {
                    const isExpanded = expandedHeatId === h.id;
                    const isPublished = settings.publishedHeatIds?.includes(h.id);
                    const isCurrent = settings.currentHeatId === h.id;
                    const isQueued = settings.queuedHeatId === h.id;
                    return (
                      <React.Fragment key={h.id}>
                        <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-all">
                          <td className="p-3 font-semibold">
                            <div className="flex items-center gap-2">
                              {isCurrent && (
                                <span className="relative flex h-2 w-2 flex-shrink-0" title="Current Contest">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                                </span>
                              )}
                              {isQueued && (
                                <span className="h-2 w-2 rounded-full bg-emerald-500 flex-shrink-0" title="Queued Contest"></span>
                              )}
                              <span>{h.name}</span>
                            </div>
                          </td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                              h.division === "Novice" ? "bg-sky-500/10 text-sky-500 border-sky-500/20" :
                              h.division === "Intermediate" ? "bg-amber-500/10 text-amber-500 border-amber-500/20" :
                              "bg-purple-500/10 text-purple-500 border-purple-500/20"
                            }`}>
                              {h.division}
                            </span>
                          </td>
                          <td className="p-3 font-mono font-bold text-violet-500">{h.competitorBibs.length}</td>
                          <td className="p-3 text-right flex items-center justify-end gap-1.5">
                            {/* Publish Status Toggle */}
                            <button
                              type="button"
                              onClick={async () => {
                                const isFinalized = settings.completedResults?.some(cr => cr.heatId === h.id);
                                if (!isFinalized) {
                                  alert("This contest must be completed and finalized before results can be published.");
                                  return;
                                }
                                const currentPublished = settings.publishedHeatIds || [];
                                const isPub = currentPublished.includes(h.id);
                                const updatedPublished = isPub
                                  ? currentPublished.filter(id => id !== h.id)
                                  : [...currentPublished, h.id];
                                  await onUpdateSettings({ publishedHeatIds: updatedPublished });
                              }}
                              className={`px-2 py-1 text-[10px] font-bold rounded border cursor-pointer transition-colors ${
                                isPublished
                                  ? "bg-violet-600/10 border-violet-500/25 text-violet-500 dark:bg-violet-650/15"
                                  : "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200"
                              }`}
                            >
                              {isPublished ? "Published" : "Draft"}
                            </button>

                            {/* Review Results Toggle */}
                            <button
                              type="button"
                              onClick={() => setExpandedHeatId(isExpanded ? null : h.id)}
                              className={`px-2 py-1 text-[10px] font-bold rounded border cursor-pointer transition-colors ${
                                isExpanded
                                  ? "bg-amber-500/10 border-amber-500/25 text-amber-500 dark:bg-amber-650/15"
                                  : "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200"
                              }`}
                            >
                              {isExpanded ? "Hide" : "Review"}
                            </button>

                            {/* Delete Heat */}
                            <button
                              type="button"
                              id={`delete-heat-${h.id}`}
                              onClick={() => onDeleteHeat(h.id)}
                              className="p-1.5 text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors border border-transparent hover:border-rose-500/25 cursor-pointer"
                              title="Delete Heat"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr className="bg-slate-50/50 dark:bg-slate-950/40">
                            <td colSpan={5} className="p-4 border-t border-b border-slate-200 dark:border-slate-800/80">
                              <div className="space-y-4">
                                <div className="space-y-3">
                                  <h4 className="text-xs font-bold font-mono text-slate-400 uppercase tracking-wider">Submitted Judges Sheets</h4>
                                  <div className="flex flex-wrap gap-2">
                                    {getExpectedJudgesForHeat(h).map((judgeId) => {
                                      const isFinalized = !!settings.finalizedSheets?.includes(`${h.id}:${judgeId}`);
                                      const hasScores = scores.some(s => s.heatId === h.id && s.judgeId === judgeId) || isFinalized;
                                      const isSelected = reviewJudgeForHeat[h.id] === judgeId;

                                      const jNames = settings.judgeNames || ["Judge A", "Judge B", "Judge C", "Judge D", "Judge E"];
                                      const jRoles = settings.judgeRoles || ["None", "None", "None", "None", "None"];
                                      let judgeRole = "Both";
                                      const idx = jNames.indexOf(judgeId);
                                      if (idx !== -1) {
                                        judgeRole = jRoles[idx] || "Both";
                                      } else if (judgeId === (settings.chiefJudgeName || "Chief Judge")) {
                                        judgeRole = settings.chiefJudgeRole || "Both";
                                      }

                                      return (
                                        <button
                                          type="button"
                                          key={judgeId}
                                          onClick={() => {
                                            if (hasScores) {
                                              setReviewJudgeForHeat(prev => ({
                                                ...prev,
                                                [h.id]: isSelected ? null : judgeId
                                              }));
                                            }
                                          }}
                                          className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border font-mono transition-all flex items-center gap-1.5 ${
                                            hasScores
                                              ? isSelected
                                                ? "bg-violet-600 border-violet-600 text-white shadow-sm cursor-pointer"
                                                : isFinalized
                                                  ? "bg-green-500/10 border-green-500/25 text-green-500 hover:bg-green-500/20 cursor-pointer"
                                                  : "bg-amber-500/10 border-amber-500/25 text-amber-500 hover:bg-amber-500/20 cursor-pointer"
                                              : "bg-rose-500/10 border-rose-500/25 text-rose-500 animate-pulse cursor-not-allowed"
                                          }`}
                                        >
                                          <FileText className="w-3.5 h-3.5" />
                                          {judgeId} ({judgeRole}): {
                                            !hasScores 
                                              ? "Not Started" 
                                              : isSelected 
                                                ? "Selected (Click to Close)" 
                                                : isFinalized 
                                                  ? "Finalized ✓ (Click to Review)" 
                                                  : "Draft Sheet (Click to Review)"
                                          }
                                        </button>
                                      );
                                    })}
                                  </div>

                                  {reviewJudgeForHeat[h.id] && (
                                    <div className={`p-4 rounded-xl border mt-3 transition-all ${isDarkMode ? "bg-slate-950 border-slate-800" : "bg-slate-50 border-slate-200"}`}>
                                      <div className="flex items-center justify-between mb-3 border-b border-slate-200 dark:border-slate-800 pb-2">
                                        <h5 className="text-xs font-bold font-mono uppercase text-violet-500 tracking-wider flex items-center gap-1.5">
                                          <FileText className="w-4 h-4" />
                                          {reviewJudgeForHeat[h.id]} ({(() => {
                                            const jNames = settings.judgeNames || ["Judge A", "Judge B", "Judge C", "Judge D", "Judge E"];
                                            const jRoles = settings.judgeRoles || ["None", "None", "None", "None", "None"];
                                            const idx = jNames.indexOf(reviewJudgeForHeat[h.id]!);
                                            if (idx !== -1) return jRoles[idx] || "Both";
                                            if (reviewJudgeForHeat[h.id] === (settings.chiefJudgeName || "Chief Judge")) return settings.chiefJudgeRole || "Both";
                                            return "Both";
                                          })()}) Scoring Sheet for Heat: {h.name}
                                        </h5>
                                        <button
                                          type="button"
                                          onClick={() => setReviewJudgeForHeat(prev => ({ ...prev, [h.id]: null }))}
                                          className="text-[10px] font-bold text-slate-400 hover:text-slate-300 cursor-pointer border border-transparent hover:border-slate-700/50 px-2 py-0.5 rounded transition-all"
                                        >
                                          Close Sheet
                                        </button>
                                      </div>
                                      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                                        <table className="w-full text-left border-collapse text-xs">
                                          <thead>
                                            <tr className="bg-slate-50 dark:bg-slate-850 font-mono text-[10px] font-semibold border-b border-slate-200 dark:border-slate-800">
                                              <th className="p-2 w-16 text-center">Bib</th>
                                              <th className="p-2">Competitor</th>
                                              <th className="p-2 text-center w-24">Mark Type</th>
                                              <th className="p-2 text-center w-28">Score / Value</th>
                                              <th className="p-2 text-center w-28">Callback Status</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                                            {scores
                                              .filter(s => s.heatId === h.id && s.judgeId === reviewJudgeForHeat[h.id])
                                              .map((record) => {
                                                let competitorName = "—";
                                                if (h.role === "Mixed" && h.heatType === "Finals") {
                                                  const [leadBib, followBib] = record.competitorBib.split("_");
                                                  const lead = competitors.find(c => c.bib === leadBib);
                                                  const follow = competitors.find(c => c.bib === followBib);
                                                  const leadName = lead ? lead.name : (leadBib ? `Lead #${leadBib}` : "—");
                                                  const followName = follow ? follow.name : (followBib ? `Follow #${followBib}` : "—");
                                                  competitorName = `${leadName} & ${followName}`;
                                                } else {
                                                  const comp = competitors.find(c => c.bib === record.competitorBib);
                                                  if (comp) competitorName = comp.name;
                                                }

                                                return (
                                                  <tr key={record.id} className="hover:bg-slate-50/20">
                                                    <td className="p-2 text-center font-bold text-slate-400">#{record.competitorBib}</td>
                                                    <td className="p-2 font-sans font-medium text-slate-700 dark:text-slate-200">{competitorName}</td>
                                                    <td className="p-2 text-center">
                                                      <span className="text-[10px] uppercase font-bold text-slate-400">
                                                        {h.heatType === "Finals" ? "Placement" : "Qualifying"}
                                                      </span>
                                                    </td>
                                                    <td className="p-2 text-center font-bold text-violet-500">
                                                      {h.heatType === "Finals" || settings.judgingStyle === "placement"
                                                        ? record.score !== undefined ? `Placement: #${record.score}` : "—"
                                                        : settings.judgingStyle === "callback"
                                                          ? `Marked: ${record.isCallback}`
                                                          : record.score !== undefined ? `Score: ${record.score} pts` : "—"
                                                      }
                                                    </td>
                                                    <td className="p-2 text-center">
                                                      {record.isCallback === "Yes" ? (
                                                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-500/10 border border-green-500/25 text-green-500">
                                                          Callback
                                                        </span>
                                                      ) : record.isCallback && record.isCallback.startsWith("Alt") ? (
                                                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 border border-amber-500/25 text-amber-500 font-mono">
                                                          {record.isCallback}
                                                        </span>
                                                      ) : (
                                                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-500/10 border border-slate-500/25 text-slate-400">
                                                          —
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

                                <div>
                                  <h4 className="text-xs font-bold font-mono text-slate-400 uppercase tracking-wider mb-2">Calculated Heat Results Matrix</h4>
                                  {(() => {
                                    const hCallbackCount = h.role === "Lead"
                                      ? (settings.callbackCountLeaders !== undefined ? settings.callbackCountLeaders : (settings.callbackCount || 5))
                                      : h.role === "Follow"
                                        ? (settings.callbackCountFollowers !== undefined ? settings.callbackCountFollowers : (settings.callbackCount || 5))
                                        : (settings.callbackCount || 5);
                                    const hAlternateCount = h.role === "Lead"
                                      ? (settings.alternateCountLeaders !== undefined ? settings.alternateCountLeaders : (settings.alternateCount !== undefined ? settings.alternateCount : 2))
                                      : h.role === "Follow"
                                        ? (settings.alternateCountFollowers !== undefined ? settings.alternateCountFollowers : (settings.alternateCount !== undefined ? settings.alternateCount : 2))
                                        : (settings.alternateCount !== undefined ? settings.alternateCount : 2);

                                    const results = calculateHeatResults(
                                      h,
                                      competitors,
                                      scores,
                                      settings.judgingStyle || "raw",
                                      hCallbackCount,
                                      hAlternateCount,
                                      settings.callbackCountLeaders,
                                      settings.callbackCountFollowers,
                                      settings.alternateCountLeaders,
                                      settings.alternateCountFollowers,
                                      settings
                                    );
                                    if (results.length === 0) {
                                      return <p className="text-xs text-slate-500 font-mono italic">No competitor scores have been recorded for this heat yet.</p>;
                                    }
                                    const heatExpectedJudges = getExpectedJudgesForHeat(h);

                                    const renderResultsTable = (resList: typeof results) => {
                                      if (resList.length === 0) {
                                        return <p className="text-xs text-slate-500 font-mono italic p-4 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">No scores recorded yet.</p>;
                                      }
                                      return (
                                        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                                          {/* Results Matrix Header */}
                                          <div className="mb-4 border-b border-slate-100 dark:border-slate-800 pb-3 flex flex-wrap items-center justify-between gap-4">
                                            <div>
                                              <h5 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                                                <Award className="w-4 h-4 text-violet-500" />
                                                Calculated Standings & Placements Matrix
                                              </h5>
                                              <p className="text-[10px] text-slate-400 mt-0.5">
                                                Active Round: <span className="font-semibold text-slate-600 dark:text-slate-300">{h.division} {h.heatType} ({h.role})</span>
                                              </p>
                                            </div>
                                            <div className="flex gap-2 text-[10px] font-mono text-slate-500">
                                              <span>Active Panel:</span>
                                              <span className="font-bold text-violet-500">
                                                {heatExpectedJudges.join(", ") || "No Judges Assigned"}
                                              </span>
                                            </div>
                                          </div>
                                          <table className="w-full text-left border-collapse text-xs text-slate-700 dark:text-slate-300">
                                            <thead>
                                              <tr className="bg-slate-50 dark:bg-slate-850 font-mono text-[10px] font-semibold border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                                                <th className="p-2 w-12 text-center">Rank</th>
                                                <th className="p-2 w-20 text-center">Bib Number</th>
                                                <th className="p-2">Name</th>
                                                {heatExpectedJudges.map((j) => (
                                                  <th key={j} className="p-2 text-center font-mono">{j}</th>
                                                ))}
                                                <th className="p-2 text-center">Results/Placements</th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                                              {resList.map((res) => (
                                                <tr key={res.competitor.bib} className="hover:bg-slate-50/20">
                                                  <td className="p-2 font-bold text-center text-violet-500">#{res.rank}</td>
                                                  <td className="p-2 text-center text-slate-700 dark:text-slate-300">#{res.competitor.bib}</td>
                                                  <td className="p-2 font-sans font-bold text-slate-800 dark:text-slate-100">{res.competitor.name}</td>
                                                  {heatExpectedJudges.map((j) => {
                                                    const scoreObj = res.scoresByJudge[j];
                                                    return (
                                                      <td key={j} className="p-2 text-center">
                                                        {scoreObj ? (
                                                          <span className="text-slate-800 dark:text-slate-200">
                                                            {scoreObj.isCallback || scoreObj.score}
                                                            {scoreObj.placement ? ` (${scoreObj.placement})` : ""}
                                                          </span>
                                                        ) : (
                                                          <span className="text-slate-400">—</span>
                                                        )}
                                                      </td>
                                                    );
                                                  })}
                                                  <td className="p-2 text-center font-bold">
                                                    {h.heatType === "Finals" ? (
                                                      <span className="text-violet-500">
                                                        {res.rank === 1 ? "🏆 1st" : res.rank === 2 ? "🥈 2nd" : res.rank === 3 ? "🥉 3rd" : `${res.rank}th`}
                                                      </span>
                                                    ) : res.qualified ? (
                                                      <span className="text-green-500">QUALIFIED</span>
                                                    ) : res.isAlternate ? (
                                                      <span className="text-amber-500">ALT ({res.alternateRank})</span>
                                                    ) : (
                                                      <span className="text-slate-400 font-normal">Cut</span>
                                                    )}
                                                  </td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      );
                                    };

                                    const isMixedSplit = h.role === "Mixed" && h.heatType !== "Finals";
                                    if (isMixedSplit) {
                                      const leadResults = results.filter(res => res.competitor.role === "Lead");
                                      const followResults = results.filter(res => res.competitor.role === "Follow");
                                      return (
                                        <div className="grid grid-cols-2 gap-4 w-full">
                                          {/* Leaders (Left) */}
                                          <div className="space-y-2">
                                            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-1.5">
                                              <span className="text-xs font-bold text-emerald-500 font-mono uppercase tracking-wider">Leaders</span>
                                              <span className="text-[10px] text-slate-400 font-mono">{leadResults.length} Dancers</span>
                                            </div>
                                            {renderResultsTable(leadResults)}
                                          </div>
                                          {/* Followers (Right) */}
                                          <div className="space-y-2">
                                            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-1.5">
                                              <span className="text-xs font-bold text-rose-500 font-mono uppercase tracking-wider">Followers</span>
                                              <span className="text-[10px] text-slate-400 font-mono">{followResults.length} Dancers</span>
                                            </div>
                                            {renderResultsTable(followResults)}
                                          </div>
                                        </div>
                                      );
                                    }

                                    return renderResultsTable(results);
                                  })()}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                  {heats.filter((h) => (settings.completedResults || []).some((cr) => cr.heatId === h.id)).length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-slate-500">
                        No contests have been completed since the last reset yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
        )}

      {/* Active Heat Editor (Full Width at Bottom) */}
      {activeHeatControlTab === "live" && (
        <>
        <div className={`p-6 rounded-2xl border transition-all ${isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 shadow-sm text-slate-800"}`}>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-500" />
              <h2 className="text-lg font-bold tracking-tight">Active Contest Editor</h2>
            {activeHeat && (
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                activeHeat.isCustom
                  ? "bg-amber-500/10 text-amber-500"
                  : "bg-emerald-500/10 text-emerald-500"
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${activeHeat.isCustom ? "bg-amber-500 animate-pulse" : "bg-emerald-500"}`} />
                {activeHeat.isCustom ? "Customized Running Order" : "Synced with Registration"}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {activeHeat && (
              <button
                type="button"
                onClick={() => setSortingMode(prev => prev === "bib" ? "manual" : "bib")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl border cursor-pointer transition-all ${
                  sortingMode === "bib"
                    ? "bg-violet-600/15 border-violet-500 text-violet-500"
                    : isDarkMode
                      ? "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750"
                      : "bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-50"
                }`}
                title="Toggle competitor sorting"
              >
                <SortAsc className="w-3.5 h-3.5" />
                Sort: {sortingMode === "bib" ? "Bib Number" : "Manual Order"}
              </button>
            )}

            {activeHeat && activeHeat.isCustom && (
              <button
                type="button"
                onClick={async () => {
                  if (window.confirm("Reset this heat to automatically sync with the registration sheet? All manual modifications, additions, and ordering overrides will be re-populated based on checked-in/scratched dancers.")) {
                    await onUpdateHeat(activeHeat.id, { isCustom: false });
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl border border-rose-500/10 hover:border-rose-500/30 text-rose-500 hover:bg-rose-500/5 bg-transparent cursor-pointer transition-all font-mono"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Reset & Sync with Registration
              </button>
            )}

            <button
              type="button"
              onClick={() => toggleCard("scoringSheetEditor")}
              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer text-slate-400"
            >
              {collapsedCards.scoringSheetEditor ? (
                <ChevronDown className="w-5 h-5" />
              ) : (
                <ChevronUp className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>

        {!collapsedCards.scoringSheetEditor && (
          <div className="flex p-0.5 bg-slate-100 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 w-full sm:w-72 mb-5">
            <button
              type="button"
              id="contest-editor-tab-sheet-btn"
              onClick={() => setContestEditorTab("sheet")}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                contestEditorTab === "sheet"
                  ? "bg-violet-600 text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              Scoring Sheet
            </button>
            <button
              type="button"
              id="contest-editor-tab-judges-btn"
              onClick={() => setContestEditorTab("judges")}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                contestEditorTab === "judges"
                  ? "bg-violet-600 text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              Judges
              {activeHeat && judgeStatusRows.some((r) => r.isClaimed && r.totalCount > 0 && r.scoredCount < r.totalCount) && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              )}
            </button>
          </div>
        )}

        {!collapsedCards.scoringSheetEditor && contestEditorTab === "sheet" && (
          <React.Fragment>
            <p className="text-xs text-slate-400 mb-6 leading-relaxed">
          The scoring sheet is what is submitted to judges to score with. You can manually adjust the running order, remove competitors, or add new competitors. By default, it automatically populates based on Checked-In/Scratched statuses on the registration sheet.
        </p>

        {activeHeat ? (
          <div className="space-y-6">
            {/* Table of Competitors/Couples */}
            {activeHeat.role === "Mixed" && (
              // Decoupled Mixed Heat (Leaders & Followers Lists)
              <div className="space-y-6">
                {/* Finals Partnering Controls if heatType is Finals */}
                {activeHeat.heatType === "Finals" && (
                  <div className={`p-4 rounded-xl border ${isDarkMode ? "bg-slate-950 border-slate-800" : "bg-slate-50 border-slate-200"}`}>
                    <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-violet-500" />
                      Finals Partnering Controls
                    </h3>
                    <div className="flex flex-wrap gap-2 items-center">
                      <button
                        type="button"
                        id="draw-mode-toggle-btn"
                        onClick={() => setIsDrawMode(prev => !prev)}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                          isDrawMode
                            ? "bg-amber-600 border-amber-600 text-white"
                            : isDarkMode
                              ? "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750"
                              : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        {isDrawMode ? "Disable Draw Mode" : "Draw (Select Partners)"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

                {!isDrawMode ? (
                  <div className="space-y-6">
                    {activeHeat ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-6 animate-fade-in">
                        {/* Left Side: Leaders */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <h3 className="text-sm font-bold font-mono text-emerald-500 uppercase tracking-wider flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                              Leaders (Leads)
                            </h3>
                            {activeHeat.heatType === "Finals" && (
                              <button
                                type="button"
                                id="rand-leads-direct-btn"
                                onClick={async () => {
                                  const leads = activeHeatRows.filter(r => r.role === "Lead" && r.bibLabel && r.bibLabel !== "—" && r.bibLabel !== "").map(r => r.bibLabel);
                                  const follows = activeHeatRows.filter(r => r.role === "Follow" && r.bibLabel && r.bibLabel !== "—" && r.bibLabel !== "").map(r => r.bibLabel);
                                  
                                  const shuffle = <T,>(array: T[]): T[] => {
                                    const copy = [...array];
                                    for (let i = copy.length - 1; i > 0; i--) {
                                      const j = Math.floor(Math.random() * (i + 1));
                                      [copy[i], copy[j]] = [copy[j], copy[i]];
                                    }
                                    return copy;
                                  };
                                  
                                  const shuffledLeads = shuffle(leads);
                                  const newCouples = follows.map((follow, idx) => {
                                    const lead = shuffledLeads[idx] || "";
                                    return {
                                      id: `${lead}_${follow || ""}`,
                                      leadBib: lead,
                                      followBib: follow || ""
                                    };
                                  });
                                  
                                  if (shuffledLeads.length > follows.length) {
                                    for (let i = follows.length; i < shuffledLeads.length; i++) {
                                      const lead = shuffledLeads[i];
                                      newCouples.push({ id: `${lead}_`, leadBib: lead, followBib: "" });
                                    }
                                  }
                                  
                                  const bibsList = newCouples.map(cp => cp.id);
                                  await onUpdateHeat(activeHeat.id, { competitorBibs: bibsList, couples: newCouples, isCustom: true });
                                }}
                                className="px-2 py-1 bg-emerald-500 hover:bg-emerald-600 text-slate-950 text-[10px] font-bold rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                              >
                                <Sparkles className="w-3 h-3" />
                                Randomize Leaders
                              </button>
                            )}
                          </div>
                          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                            <table className="w-full text-left border-collapse text-xs">
                              <thead>
                                <tr className={`${isDarkMode ? "bg-slate-800/50 text-slate-300" : "bg-slate-50 text-slate-500"} text-[10px] font-semibold font-mono border-b border-slate-200 dark:border-slate-800`}>
                                  <th className="p-2.5 w-10 text-center">No.</th>
                                  <th className="p-2.5 w-32">Role</th>
                                  <th className="p-2.5 w-16 text-center">Bib #</th>
                                  <th className="p-2.5">Competitor Name</th>
                                  <th className="p-2.5 text-right w-36">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {leadRows.map((row, idx) => {
                                  const leadComp = competitors.find(c => c.bib === row.bibLabel);
                                  const isSplitActive = currentSplits.includes(row.index);

                                  return (
                                    <React.Fragment key={`lead-${row.id}`}>
                                      <tr className="hover:bg-slate-50/20">
                                        <td className="p-2.5 text-center font-mono font-bold text-slate-400">{row.index + 1}</td>
                                        <td className="p-2.5">
                                          <select
                                            value="Lead"
                                            onChange={async (e) => {
                                              const newRole = e.target.value as "Lead" | "Follow";
                                              if (newRole !== "Lead" && leadComp && onUpdateCompetitor) {
                                                await onUpdateCompetitor(leadComp.bib, {
                                                  bib: leadComp.bib,
                                                  name: leadComp.name,
                                                  division: leadComp.division,
                                                  role: newRole,
                                                  checkedIn: leadComp.checkedIn,
                                                  scratched: leadComp.scratched
                                                });
                                              }
                                            }}
                                            className={`text-[10px] px-1.5 py-0.5 rounded border focus:outline-none focus:ring-1 focus:ring-violet-500 font-medium ${
                                              isDarkMode
                                                ? "bg-slate-850 border-slate-700 text-slate-100"
                                                : "bg-white border-slate-250 text-slate-800 shadow-xs"
                                            }`}
                                          >
                                            <option value="Lead">Leader</option>
                                            <option value="Follow">Follower</option>
                                          </select>
                                        </td>
                                        <td className="p-2.5 text-center">
                                          <span className="font-mono bg-emerald-500/10 text-emerald-500 px-1.5 py-0.5 rounded text-[10px] font-bold">
                                            #{row.bibLabel}
                                          </span>
                                        </td>
                                        <td className="p-2.5 font-semibold text-slate-700 dark:text-slate-200 truncate max-w-[140px]" title={row.name}>
                                          {row.name}
                                        </td>
                                        <td className="p-2.5 text-right">
                                          <div className="flex items-center justify-end gap-1">
                                            <button
                                              type="button"
                                              disabled={row.index === 0}
                                              onClick={async () => {
                                                const leadBibs = activeHeatRows.filter(r => r.role === "Lead").map(r => r.id);
                                                const followBibs = activeHeatRows.filter(r => r.role === "Follow").map(r => r.id);
                                                const temp = leadBibs[row.index];
                                                leadBibs[row.index] = leadBibs[row.index - 1];
                                                leadBibs[row.index - 1] = temp;

                                                await onUpdateHeat(activeHeat.id, {
                                                  competitorBibs: [...leadBibs, ...followBibs],
                                                  isCustom: true
                                                });
                                              }}
                                              className={`p-1 rounded border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all ${
                                                row.index === 0 ? "opacity-30 cursor-not-allowed" : "cursor-pointer"
                                              }`}
                                              title="Move Up"
                                            >
                                              <ArrowUp className="w-3 h-3 text-slate-400" />
                                            </button>
                                            <button
                                              type="button"
                                              disabled={row.index === leadRows.length - 1}
                                              onClick={async () => {
                                                const leadBibs = activeHeatRows.filter(r => r.role === "Lead").map(r => r.id);
                                                const followBibs = activeHeatRows.filter(r => r.role === "Follow").map(r => r.id);
                                                const temp = leadBibs[row.index];
                                                leadBibs[row.index] = leadBibs[row.index + 1];
                                                leadBibs[row.index + 1] = temp;

                                                await onUpdateHeat(activeHeat.id, {
                                                  competitorBibs: [...leadBibs, ...followBibs],
                                                  isCustom: true
                                                });
                                              }}
                                              className={`p-1 rounded border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all ${
                                                row.index === leadRows.length - 1 ? "opacity-30 cursor-not-allowed" : "cursor-pointer"
                                              }`}
                                              title="Move Down"
                                            >
                                              <ArrowDown className="w-3 h-3 text-slate-400" />
                                            </button>
                                            <button
                                              type="button"
                                              onClick={async () => {
                                                const newBibs = activeHeat.competitorBibs.filter(bib => bib !== row.id);
                                                await onUpdateHeat(activeHeat.id, {
                                                  competitorBibs: newBibs,
                                                  isCustom: true
                                                });
                                              }}
                                              className="p-1 rounded border border-slate-200 dark:border-slate-800 hover:bg-rose-500/10 text-rose-500 transition-all cursor-pointer"
                                              title="Remove Leader"
                                            >
                                              <Trash2 className="w-3 h-3" />
                                            </button>
                                          </div>
                                        </td>
                                      </tr>
                                      {idx < leadRows.length - 1 && (
                                        <tr
                                          onDragOver={(e) => {
                                            e.preventDefault();
                                            setDraggedOverRowIndex(row.index);
                                          }}
                                          onDragLeave={() => {
                                            setDraggedOverRowIndex(null);
                                          }}
                                          onDrop={async (e) => {
                                            e.preventDefault();
                                            setDraggedOverRowIndex(null);
                                            const existingSplits = activeHeat.splits || [];
                                            if (existingSplits.length >= 2) {
                                              alert("Maximum of 2 splits (creating up to 3 heats) is allowed.");
                                              return;
                                            }
                                            if (!existingSplits.includes(row.index)) {
                                              const updatedSplits = [...existingSplits, row.index].sort((a,b) => a - b);
                                              await onUpdateHeat(activeHeat.id, { splits: updatedSplits, isCustom: true });
                                            }
                                          }}
                                          className={`transition-all duration-300 ${
                                            draggedOverRowIndex === row.index
                                              ? "bg-violet-500/10"
                                              : "hover:bg-violet-500/[0.01]"
                                          }`}
                                        >
                                          <td colSpan={5} className="p-1 text-center relative font-mono text-xs">
                                            {isSplitActive ? (() => {
                                              const nextHeatNum = currentSplits.filter(s => s <= row.index).length + 1;
                                              return (
                                                <div className="py-2 flex flex-col items-center justify-center gap-0.5 bg-violet-600/5 dark:bg-violet-600/[0.03] border-t border-b border-violet-500/20 relative rounded-lg">
                                                  <span className="px-2 py-0.5 bg-violet-600 text-white font-mono font-bold text-[9px] uppercase tracking-wider rounded-md shadow-sm">
                                                    HEAT {nextHeatNum} STARTING HERE
                                                  </span>
                                                  <button
                                                    type="button"
                                                    onClick={async () => {
                                                      const updatedSplits = (activeHeat.splits || []).filter(s => s !== row.index);
                                                      await onUpdateHeat(activeHeat.id, { splits: updatedSplits, isCustom: true });
                                                    }}
                                                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg cursor-pointer transition-all shadow-sm"
                                                    title="Remove Cut-off"
                                                  >
                                                    <Trash2 className="w-3 h-3" />
                                                  </button>
                                                </div>
                                              );
                                            })() : (
                                              <div 
                                                className={`w-full py-1 flex items-center justify-center gap-2 border-t border-dashed border-slate-200 dark:border-slate-800/60 opacity-30 group-hover:opacity-100 transition-all ${
                                                  draggedOverRowIndex === row.index ? "opacity-100 border-violet-500 text-violet-500 font-bold bg-violet-500/[0.04] py-2 rounded-lg" : ""
                                                }`}
                                              >
                                                {draggedOverRowIndex === row.index ? (
                                                  <span className="text-[9px] uppercase font-bold tracking-widest text-violet-500 animate-pulse flex items-center gap-1">
                                                    <Scissors className="w-3 h-3 animate-bounce" />
                                                    DROP TO SPLIT
                                                  </span>
                                                ) : (
                                                  <span className="text-[8px] uppercase font-bold tracking-widest text-slate-400 dark:text-slate-500 select-none opacity-0 hover:opacity-100 transition-opacity">
                                                    [ Drop Cut-off Line Here ]
                                                  </span>
                                                )}
                                              </div>
                                            )}
                                          </td>
                                        </tr>
                                      )}
                                    </React.Fragment>
                                  );
                                })}
                                {leadRows.length === 0 && (
                                  <tr>
                                    <td colSpan={5} className="p-4 text-center text-slate-500 italic">No Leaders on Roster</td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* Followers Side */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <h3 className="text-sm font-bold font-mono text-rose-500 uppercase tracking-wider flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                              Followers (Follows)
                            </h3>
                            {activeHeat.heatType === "Finals" && (
                              <button
                                type="button"
                                id="rand-follows-direct-btn"
                                onClick={async () => {
                                  const leads = activeHeatRows.filter(r => r.role === "Lead" && r.bibLabel && r.bibLabel !== "—" && r.bibLabel !== "").map(r => r.bibLabel);
                                  const follows = activeHeatRows.filter(r => r.role === "Follow" && r.bibLabel && r.bibLabel !== "—" && r.bibLabel !== "").map(r => r.bibLabel);
                                  
                                  const shuffle = <T,>(array: T[]): T[] => {
                                    const copy = [...array];
                                    for (let i = copy.length - 1; i > 0; i--) {
                                      const j = Math.floor(Math.random() * (i + 1));
                                      [copy[i], copy[j]] = [copy[j], copy[i]];
                                    }
                                    return copy;
                                  };
                                  
                                  const shuffledFollows = shuffle(follows);
                                  const newCouples = leads.map((lead, idx) => {
                                    const follow = shuffledFollows[idx] || "";
                                    return {
                                      id: `${lead}_${follow}`,
                                      leadBib: lead,
                                      followBib: follow
                                    };
                                  });
                                  
                                  if (shuffledFollows.length > leads.length) {
                                    for (let i = leads.length; i < shuffledFollows.length; i++) {
                                      const follow = shuffledFollows[i];
                                      newCouples.push({ id: `_${follow}`, leadBib: "", followBib: follow });
                                    }
                                  }
                                  
                                  const bibsList = newCouples.map(cp => cp.id);
                                  await onUpdateHeat(activeHeat.id, { competitorBibs: bibsList, couples: newCouples, isCustom: true });
                                }}
                                className="px-2 py-1 bg-rose-500 hover:bg-rose-600 text-slate-950 text-[10px] font-bold rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                              >
                                <Sparkles className="w-3 h-3" />
                                Randomize Followers
                              </button>
                            )}
                          </div>
                          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                            <table className="w-full text-left border-collapse text-xs">
                              <thead>
                                <tr className={`${isDarkMode ? "bg-slate-800/50 text-slate-300" : "bg-slate-50 text-slate-500"} text-[10px] font-semibold font-mono border-b border-slate-200 dark:border-slate-800`}>
                                  <th className="p-2.5 w-10 text-center">No.</th>
                                  <th className="p-2.5 w-32">Role</th>
                                  <th className="p-2.5 w-16 text-center">Bib #</th>
                                  <th className="p-2.5">Competitor Name</th>
                                  <th className="p-2.5 text-right w-36">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {followRows.map((row, idx) => {
                                  const followComp = competitors.find(c => c.bib === row.bibLabel);
                                  const isSplitActive = currentSplits.includes(row.index);

                                  return (
                                    <React.Fragment key={`follow-${row.id}`}>
                                      <tr className="hover:bg-slate-50/20">
                                        <td className="p-2.5 text-center font-mono font-bold text-slate-400">{row.index + 1}</td>
                                        <td className="p-2.5">
                                          <select
                                            value="Follow"
                                            onChange={async (e) => {
                                              const newRole = e.target.value as "Lead" | "Follow";
                                              if (newRole !== "Follow" && followComp && onUpdateCompetitor) {
                                                await onUpdateCompetitor(followComp.bib, {
                                                  bib: followComp.bib,
                                                  name: followComp.name,
                                                  division: followComp.division,
                                                  role: newRole,
                                                  checkedIn: followComp.checkedIn,
                                                  scratched: followComp.scratched
                                                });
                                              }
                                            }}
                                            className={`text-[10px] px-1.5 py-0.5 rounded border focus:outline-none focus:ring-1 focus:ring-violet-500 font-medium ${
                                              isDarkMode
                                                ? "bg-slate-850 border-slate-700 text-slate-100"
                                                : "bg-white border-slate-250 text-slate-800 shadow-xs"
                                            }`}
                                          >
                                            <option value="Lead">Leader</option>
                                            <option value="Follow">Follower</option>
                                          </select>
                                        </td>
                                        <td className="p-2.5 text-center">
                                          <span className="font-mono bg-rose-500/10 text-rose-500 px-1.5 py-0.5 rounded text-[10px] font-bold">
                                            #{row.bibLabel}
                                          </span>
                                        </td>
                                        <td className="p-2.5 font-semibold text-slate-700 dark:text-slate-200 truncate max-w-[140px]" title={row.name}>
                                          {row.name}
                                        </td>
                                        <td className="p-2.5 text-right">
                                          <div className="flex items-center justify-end gap-1">
                                            <button
                                              type="button"
                                              disabled={row.index === 0}
                                              onClick={async () => {
                                                const leadBibs = activeHeatRows.filter(r => r.role === "Lead").map(r => r.id);
                                                const followBibs = activeHeatRows.filter(r => r.role === "Follow").map(r => r.id);
                                                const temp = followBibs[row.index];
                                                followBibs[row.index] = followBibs[row.index - 1];
                                                followBibs[row.index - 1] = temp;

                                                await onUpdateHeat(activeHeat.id, {
                                                  competitorBibs: [...leadBibs, ...followBibs],
                                                  isCustom: true
                                                });
                                              }}
                                              className={`p-1 rounded border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all ${
                                                row.index === 0 ? "opacity-30 cursor-not-allowed" : "cursor-pointer"
                                              }`}
                                              title="Move Up"
                                            >
                                              <ArrowUp className="w-3 h-3 text-slate-400" />
                                            </button>
                                            <button
                                              type="button"
                                              disabled={row.index === followRows.length - 1}
                                              onClick={async () => {
                                                const leadBibs = activeHeatRows.filter(r => r.role === "Lead").map(r => r.id);
                                                const followBibs = activeHeatRows.filter(r => r.role === "Follow").map(r => r.id);
                                                const temp = followBibs[row.index];
                                                followBibs[row.index] = followBibs[row.index + 1];
                                                followBibs[row.index + 1] = temp;

                                                await onUpdateHeat(activeHeat.id, {
                                                  competitorBibs: [...leadBibs, ...followBibs],
                                                  isCustom: true
                                                });
                                              }}
                                              className={`p-1 rounded border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all ${
                                                row.index === followRows.length - 1 ? "opacity-30 cursor-not-allowed" : "cursor-pointer"
                                              }`}
                                              title="Move Down"
                                            >
                                              <ArrowDown className="w-3 h-3 text-slate-400" />
                                            </button>
                                            <button
                                              type="button"
                                              onClick={async () => {
                                                const newBibs = activeHeat.competitorBibs.filter(bib => bib !== row.id);
                                                await onUpdateHeat(activeHeat.id, {
                                                  competitorBibs: newBibs,
                                                  isCustom: true
                                                });
                                              }}
                                              className="p-1 rounded border border-slate-200 dark:border-slate-800 hover:bg-rose-500/10 text-rose-500 transition-all cursor-pointer"
                                              title="Remove Follower"
                                            >
                                              <Trash2 className="w-3 h-3" />
                                            </button>
                                          </div>
                                        </td>
                                      </tr>
                                      {idx < followRows.length - 1 && (
                                        <tr
                                          onDragOver={(e) => {
                                            e.preventDefault();
                                            setDraggedOverRowIndex(row.index);
                                          }}
                                          onDragLeave={() => {
                                            setDraggedOverRowIndex(null);
                                          }}
                                          onDrop={async (e) => {
                                            e.preventDefault();
                                            setDraggedOverRowIndex(null);
                                            const existingSplits = activeHeat.splits || [];
                                            if (existingSplits.length >= 2) {
                                              alert("Maximum of 2 splits (creating up to 3 heats) is allowed.");
                                              return;
                                            }
                                            if (!existingSplits.includes(row.index)) {
                                              const updatedSplits = [...existingSplits, row.index].sort((a,b) => a - b);
                                              await onUpdateHeat(activeHeat.id, { splits: updatedSplits, isCustom: true });
                                            }
                                          }}
                                          className={`transition-all duration-300 ${
                                            draggedOverRowIndex === row.index
                                              ? "bg-violet-500/10"
                                              : "hover:bg-violet-500/[0.01]"
                                          }`}
                                        >
                                          <td colSpan={5} className="p-1 text-center relative font-mono text-xs">
                                            {isSplitActive ? (() => {
                                              const nextHeatNum = currentSplits.filter(s => s <= row.index).length + 1;
                                              return (
                                                <div className="py-2 flex flex-col items-center justify-center gap-0.5 bg-violet-600/5 dark:bg-violet-600/[0.03] border-t border-b border-violet-500/20 relative rounded-lg">
                                                  <span className="px-2 py-0.5 bg-violet-600 text-white font-mono font-bold text-[9px] uppercase tracking-wider rounded-md shadow-sm">
                                                    HEAT {nextHeatNum} STARTING HERE
                                                  </span>
                                                  <button
                                                    type="button"
                                                    onClick={async () => {
                                                      const updatedSplits = (activeHeat.splits || []).filter(s => s !== row.index);
                                                      await onUpdateHeat(activeHeat.id, { splits: updatedSplits, isCustom: true });
                                                    }}
                                                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg cursor-pointer transition-all shadow-sm"
                                                    title="Remove Cut-off"
                                                  >
                                                    <Trash2 className="w-3 h-3" />
                                                  </button>
                                                </div>
                                              );
                                            })() : (
                                              <div 
                                                className={`w-full py-1 flex items-center justify-center gap-2 border-t border-dashed border-slate-200 dark:border-slate-800/60 opacity-30 group-hover:opacity-100 transition-all ${
                                                  draggedOverRowIndex === row.index ? "opacity-100 border-violet-500 text-violet-500 font-bold bg-violet-500/[0.04] py-2 rounded-lg" : ""
                                                }`}
                                              >
                                                {draggedOverRowIndex === row.index ? (
                                                  <span className="text-[9px] uppercase font-bold tracking-widest text-violet-500 animate-pulse flex items-center gap-1">
                                                    <Scissors className="w-3 h-3 animate-bounce" />
                                                    DROP TO SPLIT
                                                  </span>
                                                ) : (
                                                  <span className="text-[8px] uppercase font-bold tracking-widest text-slate-400 dark:text-slate-500 select-none opacity-0 hover:opacity-100 transition-opacity">
                                                    [ Drop Cut-off Line Here ]
                                                  </span>
                                                )}
                                              </div>
                                            )}
                                          </td>
                                        </tr>
                                      )}
                                    </React.Fragment>
                                  );
                                })}
                                {followRows.length === 0 && (
                                  <tr>
                                    <td colSpan={5} className="p-4 text-center text-slate-500 italic">No Followers on Roster</td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>

                      </div>
                    ) : (
                    <>
                    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className={`${isDarkMode ? "bg-slate-800/50 text-slate-300" : "bg-slate-50 text-slate-500"} text-xs font-semibold font-mono border-b border-slate-200 dark:border-slate-800`}>
                            <th className="p-3 w-12">No.</th>
                            <th className="p-3 w-28">Sub-Heat</th>
                            <th className="p-3 w-24 font-mono">Bib #</th>
                            <th className="p-3">Competitor Name(s)</th>
                            <th className="p-3 w-40">Move to Heat</th>
                            <th className="p-3 text-right w-44">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                        {orderedHeatRows.map((row, idx) => {
                          const isSplitActive = currentSplits.includes(row.index);
                          const individualComp = activeHeat.role !== "Mixed"
                            ? competitors.find(c => c.bib === row.id)
                            : null;

                          return (
                            <React.Fragment key={row.id}>
                              <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-all">
                                <td className="p-3 font-mono font-bold text-slate-400">{row.index + 1}</td>
                                <td className="p-3">
                                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                                    row.subHeat === 1 ? "bg-violet-500/10 text-violet-500 border-violet-500/20" :
                                    row.subHeat === 2 ? "bg-indigo-500/10 text-indigo-500 border-indigo-500/20" :
                                    "bg-fuchsia-500/10 text-fuchsia-500 border-fuchsia-500/20"
                                  }`}>
                                    🔥 Heat {row.subHeat}
                                  </span>
                                </td>
                                <td className="p-3">
                                  <span className="font-mono bg-violet-600/10 text-violet-500 px-1.5 py-0.5 rounded text-[10px] font-bold">
                                    #{row.bibLabel}
                                  </span>
                                </td>
                                <td className="p-3 font-semibold text-slate-700 dark:text-slate-200">
                                  {row.name}
                                </td>
                                <td className="p-3">
                                  <select
                                    value={row.subHeat}
                                    onChange={(e) => handleMoveToHeat(row.index, parseInt(e.target.value) as 1 | 2 | 3)}
                                    className={`text-xs px-2 py-1 rounded-lg border focus:outline-none focus:ring-1 focus:ring-violet-500 font-medium ${
                                      isDarkMode
                                        ? "bg-slate-850 border-slate-700 text-slate-100"
                                        : "bg-white border-slate-250 text-slate-800 shadow-xs"
                                    }`}
                                  >
                                    <option value={1}>Heat 1</option>
                                    <option value={2}>Heat 2</option>
                                    <option value={3}>Heat 3</option>
                                  </select>
                                </td>
                                <td className="p-3 text-right">
                                  <div className="flex items-center justify-end gap-1.5">
                                    <button
                                      type="button"
                                      disabled={row.index === 0}
                                      onClick={async () => {
                                        const list = [...activeHeat.competitorBibs];
                                        const temp = list[row.index];
                                        list[row.index] = list[row.index - 1];
                                        list[row.index - 1] = temp;
                                        await onUpdateHeat(activeHeat.id, { competitorBibs: list, isCustom: true });
                                      }}
                                      className={`p-1.5 rounded border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all ${
                                        row.index === 0 ? "opacity-30 cursor-not-allowed" : "cursor-pointer"
                                      }`}
                                      title="Move Up"
                                    >
                                      <ArrowUp className="w-3.5 h-3.5 text-slate-400" />
                                    </button>
                                    <button
                                      type="button"
                                      disabled={row.index === activeHeat.competitorBibs.length - 1}
                                      onClick={async () => {
                                        const list = [...activeHeat.competitorBibs];
                                        const temp = list[row.index];
                                        list[row.index] = list[row.index + 1];
                                        list[row.index + 1] = temp;
                                        await onUpdateHeat(activeHeat.id, { competitorBibs: list, isCustom: true });
                                      }}
                                      className={`p-1.5 rounded border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all ${
                                        row.index === activeHeat.competitorBibs.length - 1 ? "opacity-30 cursor-not-allowed" : "cursor-pointer"
                                      }`}
                                      title="Move Down"
                                    >
                                      <ArrowDown className="w-3.5 h-3.5 text-slate-400" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        const list = activeHeat.competitorBibs.filter(b => b !== row.id);
                                        await onUpdateHeat(activeHeat.id, { competitorBibs: list, isCustom: true });
                                      }}
                                      className="p-1.5 rounded border border-slate-200 dark:border-slate-800 hover:bg-rose-500/10 text-rose-500 transition-all cursor-pointer"
                                      title="Remove Competitor"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                    {individualComp && (
                                      <button
                                        type="button"
                                        onClick={() => handleOpenEditModal(individualComp)}
                                        className="p-1.5 rounded border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-350 transition-all cursor-pointer"
                                        title="Edit Dancer Profile"
                                      >
                                        <Edit className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                              {idx < orderedHeatRows.length - 1 && (
                                <tr
                                  onDragOver={(e) => {
                                    e.preventDefault();
                                    setDraggedOverRowIndex(row.index);
                                  }}
                                  onDragLeave={() => {
                                    setDraggedOverRowIndex(null);
                                  }}
                                  onDrop={async (e) => {
                                    e.preventDefault();
                                    setDraggedOverRowIndex(null);
                                    const existingSplits = activeHeat.splits || [];
                                    if (existingSplits.length >= 2) {
                                      alert("Maximum of 2 splits (creating up to 3 heats) is allowed.");
                                      return;
                                    }
                                    if (!existingSplits.includes(row.index)) {
                                      const updatedSplits = [...existingSplits, row.index].sort((a,b) => a - b);
                                      await onUpdateHeat(activeHeat.id, { splits: updatedSplits, isCustom: true });
                                    }
                                  }}
                                  className={`transition-all duration-300 ${
                                    draggedOverRowIndex === row.index
                                      ? "bg-violet-500/10"
                                      : "hover:bg-violet-500/[0.01]"
                                  }`}
                                >
                                  <td colSpan={6} className="p-1 text-center relative font-mono text-xs">
                                    {isSplitActive ? (() => {
                                      const nextHeatNum = currentSplits.filter(s => s <= row.index).length + 1;
                                      return (
                                        <div className="py-4 flex flex-col items-center justify-center gap-1 bg-violet-600/5 dark:bg-violet-600/[0.03] border-t border-b border-violet-500/20 relative rounded-xl">
                                          <div className="h-3 w-px bg-violet-500/30 mb-0.5" />
                                          <span className="px-3.5 py-1 bg-violet-600 text-white font-mono font-bold text-xs uppercase tracking-widest rounded-full shadow-md">
                                            HEAT {nextHeatNum} STARTING HERE
                                          </span>
                                          <p className="text-[10px] text-slate-400 font-mono mt-0.5">Split partition for subsequent group flight</p>
                                          <div className="h-3 w-px bg-violet-500/30 mt-0.5" />
                                          <button
                                            type="button"
                                            onClick={async () => {
                                              const updatedSplits = (activeHeat.splits || []).filter(s => s !== row.index);
                                              await onUpdateHeat(activeHeat.id, { splits: updatedSplits, isCustom: true });
                                            }}
                                            className="absolute right-6 top-1/2 -translate-y-1/2 p-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl cursor-pointer transition-all shadow-sm"
                                            title="Remove Cut-off"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
                                      );
                                    })() : (
                                      <div 
                                        className={`w-full py-1.5 flex items-center justify-center gap-2 border-t border-dashed border-slate-200 dark:border-slate-800/60 opacity-30 group-hover:opacity-100 transition-all ${
                                          draggedOverRowIndex === row.index ? "opacity-100 border-violet-500 text-violet-500 font-bold bg-violet-500/[0.04] py-3 rounded-lg" : ""
                                        }`}
                                      >
                                        {draggedOverRowIndex === row.index ? (
                                          <span className="text-[10px] uppercase font-bold tracking-widest text-violet-500 animate-pulse flex items-center gap-1.5">
                                            <Scissors className="w-3.5 h-3.5 animate-bounce" />
                                            DROP HERE TO CREATE HEAT CUT-OFF PARTITION
                                          </span>
                                        ) : (
                                          <span className="text-[9px] uppercase font-bold tracking-widest text-slate-400 dark:text-slate-500 select-none opacity-0 hover:opacity-100 transition-opacity">
                                            [ Drop Cut-off Line Here ]
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}

                        {orderedHeatRows.length === 0 && (
                          <tr>
                            <td colSpan={7} className="p-6 text-center text-slate-500">
                              No competitors currently on the scoring sheet. Add a competitor below.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          ) : (
            activeHeat && activeHeat.role === "Mixed" && activeHeat.heatType !== "Finals" ? (
                <div className="grid grid-cols-2 gap-4 sm:gap-6">
                  {/* Leaders List (Leads) */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold font-mono text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-blue-500" />
                      Leaders (Leads) List
                    </h3>
                    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className={`${isDarkMode ? "bg-slate-800/50 text-slate-300" : "bg-slate-50 text-slate-500"} text-xs font-semibold font-mono border-b border-slate-200 dark:border-slate-800`}>
                            <th className="p-3 w-12">No.</th>
                            <th className="p-3">Leader Dancer</th>
                            {isDrawMode && <th className="p-3 w-40">Partner (Follow)</th>}
                            <th className="p-3 text-right w-24">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                          {((activeHeat.couples || []).map(c => c.leadBib)).map((leadBib, index) => {
                            if (!leadBib) return null;
                            const lead = competitors.find(c => c.bib === leadBib);
                            const currentCouple = (activeHeat.couples || [])[index];
                            const followBib = currentCouple?.followBib || "";
                            
                            return (
                              <tr key={`lead-${leadBib}-${index}`} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-all">
                                <td className="p-3 font-mono font-bold text-slate-400">{index + 1}</td>
                                <td className="p-3">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono bg-blue-500/10 text-blue-500 px-1.5 py-0.5 rounded text-[10px] font-bold">#{leadBib}</span>
                                    <span className="font-semibold">{lead ? lead.name : "Unknown"}</span>
                                  </div>
                                </td>
                                {isDrawMode && (
                                  <td className="p-3" onClick={(e) => e.stopPropagation()}>
                                    <select
                                      id={`draw-select-lead-${leadBib}`}
                                      value={followBib}
                                      onChange={async (e) => {
                                        const newFollowBib = e.target.value;
                                        const updatedCouples = (activeHeat.couples || []).map((couple, i) => {
                                          if (i === index) {
                                            return {
                                              id: `${leadBib}_${newFollowBib}`,
                                              leadBib,
                                              followBib: newFollowBib
                                            };
                                          }
                                          return couple;
                                        });
                                        await onUpdateHeat(activeHeat.id, {
                                          couples: updatedCouples,
                                          competitorBibs: updatedCouples.map(c => c.id),
                                          isCustom: true
                                        });
                                      }}
                                      className={`text-xs px-2 py-1 rounded border focus:outline-none focus:ring-1 focus:ring-violet-500 font-mono w-full ${
                                        isDarkMode
                                          ? "bg-slate-800 border-slate-700 text-slate-100"
                                          : "bg-white border-slate-200 text-slate-800"
                                      }`}
                                    >
                                      <option value="">— Choose Partner —</option>
                                      {/* All checked-in followers of this division */}
                                      {competitors
                                        .filter(c => c.role === "Follow" && c.division === activeHeat.division && c.checkedIn)
                                        .map(f => (
                                          <option key={f.bib} value={f.bib}>
                                            #{f.bib} {f.name}
                                          </option>
                                        ))
                                      }
                                    </select>
                                  </td>
                                )}
                                <td className="p-3 text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <button
                                      type="button"
                                      disabled={index === 0}
                                      onClick={async () => {
                                        const couplesList = [...(activeHeat.couples || [])];
                                        const temp = couplesList[index].leadBib;
                                        couplesList[index].leadBib = couplesList[index - 1].leadBib;
                                        couplesList[index - 1].leadBib = temp;
                                        couplesList[index].id = `${couplesList[index].leadBib}_${couplesList[index].followBib}`;
                                        couplesList[index - 1].id = `${couplesList[index - 1].leadBib}_${couplesList[index - 1].followBib}`;

                                        await onUpdateHeat(activeHeat.id, {
                                          couples: couplesList,
                                          competitorBibs: couplesList.map(c => c.id),
                                          isCustom: true
                                        });
                                      }}
                                      className={`p-1 rounded border border-slate-250 dark:border-slate-850 hover:bg-slate-100 dark:hover:bg-slate-800 ${
                                        index === 0 ? "opacity-30 cursor-not-allowed" : "cursor-pointer"
                                      }`}
                                      title="Move Lead Up"
                                    >
                                      <ArrowUp className="w-3 h-3" />
                                    </button>
                                    <button
                                      type="button"
                                      disabled={index === (activeHeat.couples || []).length - 1}
                                      onClick={async () => {
                                        const couplesList = [...(activeHeat.couples || [])];
                                        const temp = couplesList[index].leadBib;
                                        couplesList[index].leadBib = couplesList[index + 1].leadBib;
                                        couplesList[index + 1].leadBib = temp;
                                        couplesList[index].id = `${couplesList[index].leadBib}_${couplesList[index].followBib}`;
                                        couplesList[index + 1].id = `${couplesList[index + 1].leadBib}_${couplesList[index + 1].followBib}`;

                                        await onUpdateHeat(activeHeat.id, {
                                          couples: couplesList,
                                          competitorBibs: couplesList.map(c => c.id),
                                          isCustom: true
                                        });
                                      }}
                                      className={`p-1 rounded border border-slate-250 dark:border-slate-850 hover:bg-slate-100 dark:hover:bg-slate-800 ${
                                        index === (activeHeat.couples || []).length - 1 ? "opacity-30 cursor-not-allowed" : "cursor-pointer"
                                      }`}
                                      title="Move Lead Down"
                                    >
                                      <ArrowDown className="w-3 h-3" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        const couplesList = (activeHeat.couples || []).filter((_, i) => i !== index);
                                        await onUpdateHeat(activeHeat.id, {
                                          couples: couplesList,
                                          competitorBibs: couplesList.map(c => c.id),
                                          isCustom: true
                                        });
                                      }}
                                      className="p-1 rounded border border-slate-250 dark:border-slate-850 text-rose-500 hover:bg-rose-500/10 cursor-pointer animate-fade-in"
                                      title="Remove Lead"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                    {lead && (
                                      <button
                                        type="button"
                                        onClick={() => handleOpenEditModal(lead)}
                                        className="p-1 rounded border border-slate-250 dark:border-slate-850 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                                        title="Edit Lead Profile"
                                      >
                                        <Edit className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                          {(!activeHeat.couples || activeHeat.couples.length === 0) && (
                            <tr>
                              <td colSpan={isDrawMode ? 4 : 3} className="p-6 text-center text-slate-500">
                                No leaders assigned to sheet.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Followers List (Follows) */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold font-mono text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-rose-500" />
                      Followers (Follows) List
                    </h3>
                    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className={`${isDarkMode ? "bg-slate-800/50 text-slate-300" : "bg-slate-50 text-slate-500"} text-xs font-semibold font-mono border-b border-slate-200 dark:border-slate-800`}>
                            <th className="p-3 w-12">No.</th>
                            <th className="p-3">Follower Dancer</th>
                            <th className="p-3 text-right w-24">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                          {((activeHeat.couples || []).map(c => c.followBib)).map((followBib, index) => {
                            if (!followBib) return null;
                            const follow = competitors.find(c => c.bib === followBib);
                            
                            return (
                              <tr key={`follow-${followBib}-${index}`} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-all">
                                <td className="p-3 font-mono font-bold text-slate-400">{index + 1}</td>
                                <td className="p-3">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono bg-rose-500/10 text-rose-500 px-1.5 py-0.5 rounded text-[10px] font-bold">#{followBib}</span>
                                    <span className="font-semibold">{follow ? follow.name : "Unknown"}</span>
                                  </div>
                                </td>
                                <td className="p-3 text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <button
                                      type="button"
                                      disabled={index === 0}
                                      onClick={async () => {
                                        const couplesList = [...(activeHeat.couples || [])];
                                        const temp = couplesList[index].followBib;
                                        couplesList[index].followBib = couplesList[index - 1].followBib;
                                        couplesList[index - 1].followBib = temp;
                                        couplesList[index].id = `${couplesList[index].leadBib}_${couplesList[index].followBib}`;
                                        couplesList[index - 1].id = `${couplesList[index - 1].leadBib}_${couplesList[index - 1].followBib}`;

                                        await onUpdateHeat(activeHeat.id, {
                                          couples: couplesList,
                                          competitorBibs: couplesList.map(c => c.id),
                                          isCustom: true
                                        });
                                      }}
                                      className={`p-1 rounded border border-slate-250 dark:border-slate-850 hover:bg-slate-100 dark:hover:bg-slate-800 ${
                                        index === 0 ? "opacity-30 cursor-not-allowed" : "cursor-pointer"
                                      }`}
                                      title="Move Follow Up"
                                    >
                                      <ArrowUp className="w-3 h-3" />
                                    </button>
                                    <button
                                      type="button"
                                      disabled={index === (activeHeat.couples || []).length - 1}
                                      onClick={async () => {
                                        const couplesList = [...(activeHeat.couples || [])];
                                        const temp = couplesList[index].followBib;
                                        couplesList[index].followBib = couplesList[index + 1].followBib;
                                        couplesList[index + 1].followBib = temp;
                                        couplesList[index].id = `${couplesList[index].leadBib}_${couplesList[index].followBib}`;
                                        couplesList[index + 1].id = `${couplesList[index + 1].leadBib}_${couplesList[index + 1].followBib}`;

                                        await onUpdateHeat(activeHeat.id, {
                                          couples: couplesList,
                                          competitorBibs: couplesList.map(c => c.id),
                                          isCustom: true
                                        });
                                      }}
                                      className={`p-1 rounded border border-slate-250 dark:border-slate-850 hover:bg-slate-100 dark:hover:bg-slate-800 ${
                                        index === (activeHeat.couples || []).length - 1 ? "opacity-30 cursor-not-allowed" : "cursor-pointer"
                                      }`}
                                      title="Move Follow Down"
                                    >
                                      <ArrowDown className="w-3 h-3" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        const couplesList = (activeHeat.couples || []).filter((_, i) => i !== index);
                                        await onUpdateHeat(activeHeat.id, {
                                          couples: couplesList,
                                          competitorBibs: couplesList.map(c => c.id),
                                          isCustom: true
                                        });
                                      }}
                                      className="p-1 rounded border border-slate-250 dark:border-slate-850 text-rose-500 hover:bg-rose-500/10 cursor-pointer"
                                      title="Remove Follow"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                    {follow && (
                                      <button
                                        type="button"
                                        onClick={() => handleOpenEditModal(follow)}
                                        className="p-1 rounded border border-slate-250 dark:border-slate-850 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                                        title="Edit Follower Profile"
                                      >
                                        <Edit className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                          {(!activeHeat.couples || activeHeat.couples.length === 0) && (
                            <tr>
                              <td colSpan={3} className="p-6 text-center text-slate-500">
                                No followers assigned to sheet.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : (
              <>
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className={`${isDarkMode ? "bg-slate-800/50 text-slate-300" : "bg-slate-50 text-slate-500"} text-xs font-semibold font-mono border-b border-slate-200 dark:border-slate-800`}>
                        <th className="p-3 w-12">No.</th>
                        <th className="p-3 w-32">Role</th>
                        <th className="p-3 w-24 font-mono">Bib #</th>
                        <th className="p-3">Competitor Name(s)</th>
                        <th className="p-3 text-right w-44">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                    {orderedHeatRows.map((row, idx) => {
                      const isSplitActive = currentSplits.includes(row.index);
                      const individualComp = activeHeat.role !== "Mixed"
                        ? competitors.find(c => c.bib === row.id)
                        : null;

                      return (
                        <React.Fragment key={row.id}>
                          <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-all">
                            <td className="p-3 font-mono font-bold text-slate-400">{row.index + 1}</td>
                            <td className="p-3">
                              {individualComp ? (
                                <select
                                  value={individualComp.role}
                                  onChange={async (e) => {
                                    const newRole = e.target.value as "Lead" | "Follow";
                                    if (onUpdateCompetitor) {
                                      await onUpdateCompetitor(individualComp.bib, {
                                        bib: individualComp.bib,
                                        name: individualComp.name,
                                        division: individualComp.division,
                                        role: newRole,
                                        checkedIn: individualComp.checkedIn,
                                        scratched: individualComp.scratched
                                      });
                                    }
                                  }}
                                  className={`text-xs px-2 py-1 rounded-lg border focus:outline-none focus:ring-1 focus:ring-violet-500 font-medium ${
                                    isDarkMode
                                      ? "bg-slate-850 border-slate-700 text-slate-100"
                                      : "bg-white border-slate-200 text-slate-800 shadow-xs"
                                  }`}
                                >
                                  <option value="Lead">Leader</option>
                                  <option value="Follow">Follower</option>
                                </select>
                              ) : (
                                <span className="text-slate-400 font-medium italic">Couple</span>
                              )}
                            </td>
                            <td className="p-3">
                              <span className="font-mono bg-violet-600/10 text-violet-500 px-1.5 py-0.5 rounded text-[10px] font-bold">
                                #{row.bibLabel}
                              </span>
                            </td>
                            <td className="p-3 font-semibold text-slate-700 dark:text-slate-200">
                              {row.name}
                            </td>
                            <td className="p-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  disabled={row.index === 0}
                                  onClick={async () => {
                                    const list = [...activeHeat.competitorBibs];
                                    const temp = list[row.index];
                                    list[row.index] = list[row.index - 1];
                                    list[row.index - 1] = temp;
                                    await onUpdateHeat(activeHeat.id, { competitorBibs: list, isCustom: true });
                                  }}
                                  className={`p-1.5 rounded border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all ${
                                    row.index === 0 ? "opacity-30 cursor-not-allowed" : "cursor-pointer"
                                  }`}
                                  title="Move Up"
                                >
                                  <ArrowUp className="w-3.5 h-3.5 text-slate-400" />
                                </button>
                                <button
                                  type="button"
                                  disabled={row.index === activeHeat.competitorBibs.length - 1}
                                  onClick={async () => {
                                    const list = [...activeHeat.competitorBibs];
                                    const temp = list[row.index];
                                    list[row.index] = list[row.index + 1];
                                    list[row.index + 1] = temp;
                                    await onUpdateHeat(activeHeat.id, { competitorBibs: list, isCustom: true });
                                  }}
                                  className={`p-1.5 rounded border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all ${
                                    row.index === activeHeat.competitorBibs.length - 1 ? "opacity-30 cursor-not-allowed" : "cursor-pointer"
                                  }`}
                                  title="Move Down"
                                >
                                  <ArrowDown className="w-3.5 h-3.5 text-slate-400" />
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const list = activeHeat.competitorBibs.filter(b => b !== row.id);
                                    await onUpdateHeat(activeHeat.id, { competitorBibs: list, isCustom: true });
                                  }}
                                  className="p-1.5 rounded border border-slate-200 dark:border-slate-800 hover:bg-rose-500/10 text-rose-500 transition-all cursor-pointer"
                                  title="Remove Competitor"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                                {individualComp && (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditModal(individualComp)}
                                    className="p-1.5 rounded border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-350 transition-all cursor-pointer"
                                    title="Edit Dancer Profile"
                                  >
                                    <Edit className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>

                          {idx < orderedHeatRows.length - 1 && (
                            <tr
                              onDragOver={(e) => {
                                e.preventDefault();
                                setDraggedOverRowIndex(row.index);
                              }}
                              onDragLeave={() => {
                                setDraggedOverRowIndex(null);
                              }}
                              onDrop={async (e) => {
                                e.preventDefault();
                                setDraggedOverRowIndex(null);
                                const existingSplits = activeHeat.splits || [];
                                if (existingSplits.length >= 2) {
                                  alert("Maximum of 2 splits (creating up to 3 heats) is allowed.");
                                  return;
                                }
                                if (!existingSplits.includes(row.index)) {
                                  const updatedSplits = [...existingSplits, row.index].sort((a,b) => a - b);
                                  await onUpdateHeat(activeHeat.id, { splits: updatedSplits, isCustom: true });
                                }
                              }}
                              className={`transition-all duration-300 ${
                                draggedOverRowIndex === row.index
                                  ? "bg-violet-500/10"
                                  : "hover:bg-violet-500/[0.01]"
                              }`}
                            >
                              <td colSpan={5} className="p-1 text-center relative font-mono text-xs">
                                {isSplitActive ? (() => {
                                  const nextHeatNum = currentSplits.filter(s => s <= row.index).length + 1;
                                  return (
                                    <div className="py-4 flex flex-col items-center justify-center gap-1 bg-violet-600/5 dark:bg-violet-600/[0.03] border-t border-b border-violet-500/20 relative rounded-xl">
                                      <div className="h-3 w-px bg-violet-500/30 mb-0.5" />
                                      <span className="px-3.5 py-1 bg-violet-600 text-white font-mono font-bold text-xs uppercase tracking-widest rounded-full shadow-md">
                                        HEAT {nextHeatNum} STARTING HERE
                                      </span>
                                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">Split partition for subsequent group flight</p>
                                      <div className="h-3 w-px bg-violet-500/30 mt-0.5" />
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          const updatedSplits = (activeHeat.splits || []).filter(s => s !== row.index);
                                          await onUpdateHeat(activeHeat.id, { splits: updatedSplits, isCustom: true });
                                        }}
                                        className="absolute right-6 top-1/2 -translate-y-1/2 p-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl cursor-pointer transition-all shadow-sm"
                                        title="Remove Cut-off"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  );
                                })() : (
                                  <div 
                                    className={`w-full py-1.5 flex items-center justify-center gap-2 border-t border-dashed border-slate-200 dark:border-slate-800/60 opacity-30 group-hover:opacity-100 transition-all ${
                                      draggedOverRowIndex === row.index ? "opacity-100 border-violet-500 text-violet-500 font-bold bg-violet-500/[0.04] py-3 rounded-lg" : ""
                                    }`}
                                  >
                                    {draggedOverRowIndex === row.index ? (
                                      <span className="text-[10px] uppercase font-bold tracking-widest text-violet-500 animate-pulse flex items-center gap-1.5">
                                        <Scissors className="w-3.5 h-3.5 animate-bounce" />
                                        DROP HERE TO CREATE HEAT CUT-OFF PARTITION
                                      </span>
                                    ) : (
                                      <span className="text-[9px] uppercase font-bold tracking-widest text-slate-400 dark:text-slate-500 select-none opacity-0 hover:opacity-100 transition-opacity">
                                        [ Drop Cut-off Line Here ]
                                      </span>
                                    )}
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}

                    {orderedHeatRows.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-6 text-center text-slate-500">
                          No competitors currently on the scoring sheet. Add a competitor below.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ))}

            {/* Interactive Heat Sheet Splitter */}
            {(activeHeat?.splits || []).length < 2 && (
              <div className="p-4 bg-violet-500/[0.03] dark:bg-violet-950/20 border border-violet-500/15 rounded-xl flex flex-col items-center gap-2 select-none animate-fade-in mb-6">
                <div className="text-center">
                  <span className="text-xs font-bold text-violet-500 font-mono uppercase tracking-wider block">Interactive Heat Sheet Splitter</span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">Drag this line down into any gap between table rows below to split the active heat:</span>
                </div>
                <div
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", "active-heat-split");
                  }}
                  className="w-full py-2.5 cursor-grab active:cursor-grabbing group hover:opacity-90 transition-opacity"
                >
                  <div className="flex items-center gap-3">
                    <span className="p-1.5 bg-violet-600 text-white rounded-full shadow-md group-hover:scale-105 transition-transform">
                      <Scissors className="w-4 h-4" />
                    </span>
                    <div className="flex-1 border-t-2 border-dashed border-violet-500 relative">
                      <span className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 px-3 py-1 bg-violet-600 text-white text-[10px] font-mono font-bold uppercase rounded-lg tracking-widest shadow-md">
                        Heat Cut-Off
                      </span>
                    </div>
                    <span className="p-1.5 bg-violet-600 text-white rounded-full shadow-md group-hover:scale-105 transition-transform">
                      <Scissors className="w-4 h-4" />
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Form Section to Add Dancer/Couple */}
            <div className={`p-4 rounded-xl border ${
              isDarkMode ? "bg-slate-950 border-slate-800" : "bg-slate-50 border-slate-200"
            }`}>
              <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                <PlusCircle className="w-4 h-4 text-violet-500" />
                Add Competitor manually to Scoring Sheet
              </h3>
              {activeHeat.role === "Mixed" ? (
                // Add Decoupled Leader/Follower Fields
                <div className="flex flex-col md:flex-row gap-4">
                  {/* Add Leader */}
                  <div className="flex-1 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/20 dark:bg-slate-900/40">
                    <label className="block text-[9px] font-semibold text-slate-400 font-mono uppercase tracking-wider mb-1">Add Leader to Heat</label>
                    <div className="flex gap-2">
                      <select
                        id="add-lead-select"
                        value={addLeadBib}
                        onChange={(e) => setAddLeadBib(e.target.value)}
                        className={`flex-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg border focus:outline-none focus:ring-1 focus:ring-violet-500 transition-all ${
                          isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 text-slate-800"
                        }`}
                      >
                        <option value="">— Choose Lead to Add —</option>
                        {competitors
                          .filter(c => c.division === activeHeat.division && c.role === "Lead" && c.checkedIn && !c.scratched && !(activeHeat.couples || []).some(cp => cp.leadBib === c.bib))
                          .map(c => (
                            <option key={c.bib} value={c.bib}>#{c.bib} {c.name}</option>
                          ))}
                      </select>
                      <button
                        type="button"
                        id="add-lead-btn"
                        onClick={async () => {
                          if (!addLeadBib) return;
                          const newCouple = { id: `${addLeadBib}_`, leadBib: addLeadBib, followBib: "" };
                          const couplesList = [...(activeHeat.couples || []), newCouple];
                          const bibsList = [...activeHeat.competitorBibs, newCouple.id];
                          await onUpdateHeat(activeHeat.id, { competitorBibs: bibsList, couples: couplesList, isCustom: true });
                          setAddLeadBib("");
                        }}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors whitespace-nowrap"
                      >
                        Add Leader
                      </button>
                    </div>
                  </div>

                  {/* Add Follower */}
                  <div className="flex-1 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/20 dark:bg-slate-900/40">
                    <label className="block text-[9px] font-semibold text-slate-400 font-mono uppercase tracking-wider mb-1">Add Follower to Heat</label>
                    <div className="flex gap-2">
                      <select
                        id="add-follow-select"
                        value={addFollowBib}
                        onChange={(e) => setAddFollowBib(e.target.value)}
                        className={`flex-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg border focus:outline-none focus:ring-1 focus:ring-violet-500 transition-all ${
                          isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 text-slate-800"
                        }`}
                      >
                        <option value="">— Choose Follow to Add —</option>
                        {competitors
                          .filter(c => c.division === activeHeat.division && c.role === "Follow" && c.checkedIn && !c.scratched && !(activeHeat.couples || []).some(cp => cp.followBib === c.bib))
                          .map(c => (
                            <option key={c.bib} value={c.bib}>#{c.bib} {c.name}</option>
                          ))}
                      </select>
                      <button
                        type="button"
                        id="add-follow-btn"
                        onClick={async () => {
                          if (!addFollowBib) return;
                          const couplesList = [...(activeHeat.couples || [])];
                          const emptyFollowIndex = couplesList.findIndex(cp => !cp.followBib);
                          if (emptyFollowIndex !== -1) {
                            couplesList[emptyFollowIndex].followBib = addFollowBib;
                            couplesList[emptyFollowIndex].id = `${couplesList[emptyFollowIndex].leadBib}_${addFollowBib}`;
                          } else {
                            couplesList.push({ id: `_${addFollowBib}`, leadBib: "", followBib: addFollowBib });
                          }
                          const bibsList = couplesList.map(cp => cp.id);
                          await onUpdateHeat(activeHeat.id, { competitorBibs: bibsList, couples: couplesList, isCustom: true });
                          setAddFollowBib("");
                        }}
                        className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg transition-colors whitespace-nowrap"
                      >
                        Add Follower
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                // Add Individual Field
                <div className="flex flex-col sm:flex-row gap-3 items-end">
                  <div className="flex-1">
                    <label className="block text-[9px] font-semibold text-slate-400 font-mono uppercase tracking-wider mb-1">Select Registered Dancer ({activeHeat.division} {activeHeat.role})</label>
                    <select
                      value={addBibSelection}
                      onChange={(e) => setAddBibSelection(e.target.value)}
                      className={`w-full px-2.5 py-1.5 text-xs font-semibold rounded-lg border focus:outline-none focus:ring-1 focus:ring-violet-500 transition-all ${
                        isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 text-slate-800"
                      }`}
                    >
                      <option value="">— Choose Competitor to Add —</option>
                      {competitors
                        .filter(c => c.division === activeHeat.division && c.role === activeHeat.role && c.checkedIn && !c.scratched && !activeHeat.competitorBibs.includes(c.bib))
                        .map(c => (
                          <option key={c.bib} value={c.bib}>#{c.bib} {c.name}</option>
                        ))}
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={async () => {
                      if (!addBibSelection) return;
                      const list = [...activeHeat.competitorBibs, addBibSelection];
                      await onUpdateHeat(activeHeat.id, { competitorBibs: list, isCustom: true });
                      setAddBibSelection("");
                    }}
                    className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer shadow-md transition-colors h-9"
                  >
                    <Plus className="w-4 h-4" />
                    Add Dancer
                  </button>
                </div>
              )}
            </div>

          </div>
        ) : (
          <p className="text-xs text-slate-400 text-center py-4">Select an active heat to view the scoring sheet.</p>
        )}
          </React.Fragment>
        )}

        {!collapsedCards.scoringSheetEditor && contestEditorTab === "judges" && (
          <div className="space-y-4">
            <p className="text-xs text-slate-400 mb-2 leading-relaxed">
              Live status for every judge assigned a scoring role in the current Live Contest — quota progress, who has and hasn't submitted scores, and the ability to log a judge out (immediately freeing their name for someone else to claim).
            </p>

            {!activeHeat ? (
              <p className="text-xs text-slate-400 text-center py-4">Select an active heat to view judge status.</p>
            ) : judgeStatusRows.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">No judges are currently assigned a scoring role. Configure judges in Scoring Configurations.</p>
            ) : (
              <div className="space-y-3">
                {judgeStatusRows.map((row) => (
                  <div
                    key={row.name}
                    id={`judge-status-row-${row.name.replace(/\s+/g, "-").toLowerCase()}`}
                    className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center gap-3 justify-between transition-all ${
                      isDarkMode ? "bg-slate-950 border-slate-800" : "bg-slate-50 border-slate-200"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${row.isClaimed ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold truncate">{row.name}</span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-400 font-semibold uppercase tracking-wider font-mono">
                            {row.role}
                          </span>
                          {row.isFinalized && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 font-semibold uppercase tracking-wider font-mono">
                              Finalized
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] font-mono text-slate-400 mt-0.5">
                          {row.isClaimed ? "Logged In" : "Not Logged In"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 flex-wrap justify-end">
                      <div className="text-right">
                        <span className="text-[9px] font-mono uppercase tracking-wider text-slate-400 block">Submitted</span>
                        <span className={`text-xs font-bold font-mono ${
                          row.totalCount > 0 && row.scoredCount === row.totalCount ? "text-green-500" : "text-amber-500"
                        }`}>
                          {row.scoredCount} / {row.totalCount}
                        </span>
                      </div>

                      {settings.judgingStyle === "callback" && (
                        <div className="text-right">
                          <span className={`text-[9px] font-mono uppercase tracking-wider block ${row.isQuotaSatisfied ? "text-green-500" : "text-red-500"}`}>
                            Quota
                          </span>
                          <span className={`text-xs font-bold font-mono block ${row.isQuotaSatisfied ? "text-green-500" : "text-red-500"}`}>
                            Callbacks: {row.yesCount}/{judgeTargetCallbackCount}
                          </span>
                          <span className={`text-xs font-bold font-mono block ${row.isQuotaSatisfied ? "text-green-500" : "text-red-500"}`}>
                            Alts: {row.altCount}/{judgeTargetAlternateCount}
                          </span>
                        </div>
                      )}

                      <button
                        type="button"
                        id={`judge-logout-btn-${row.name.replace(/\s+/g, "-").toLowerCase()}`}
                        disabled={!row.isClaimed || loading}
                        onClick={async () => {
                          setLoading(true);
                          try {
                            await onUpdateSettings({
                              claimedJudges: (settings.claimedJudges || []).filter((n) => n !== row.name)
                            });
                          } finally {
                            setLoading(false);
                          }
                        }}
                        className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition-all ${
                          row.isClaimed
                            ? "border-rose-500/30 text-rose-500 hover:bg-rose-500/10 cursor-pointer"
                            : "border-slate-300 dark:border-slate-700 text-slate-400 cursor-not-allowed opacity-50"
                        }`}
                      >
                        Log Out
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

    {/* Standalone Complete Heat Action Card */}
    <div className={`p-6 rounded-2xl border transition-all ${
      canCompleteHeat 
        ? "bg-green-500/5 border-green-500/20" 
        : "bg-amber-500/5 border-amber-500/20"
    }`}>
      <h2 className="text-sm font-bold tracking-tight mb-2 flex items-center gap-1.5">
        <CheckSquare className={`w-4 h-4 ${canCompleteHeat ? "text-green-500" : "text-amber-500"}`} />
        Complete Contest
      </h2>
      <p className="text-[11px] text-slate-400 mb-4 leading-relaxed">
        Clicking <strong>Complete Contest</strong> sends the finalized judge results to Scoring and advances the live rotation floor. It requires all judge scores to be complete.
      </p>

      {!canCompleteHeat ? (
        <div className="p-3 rounded-xl bg-violet-500/10 border border-violet-500/25 text-violet-600 dark:text-violet-400 text-[10px] font-semibold flex items-start gap-2 mb-3">
          <span>ℹ</span>
          <span>Waiting for all judges to submit their sheets before advancing the floor.</span>
        </div>
      ) : (
        <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/25 text-green-600 dark:text-green-400 text-[10px] font-semibold flex items-start gap-2 mb-3">
          <span>✅</span>
          <span>All systems ready. You can now complete and advance this heat.</span>
        </div>
      )}

      <button
        id="complete-heat-btn"
        type="button"
        disabled={!canCompleteHeat || loading}
        onClick={async () => {
          setLoading(true);
          try {
            let updatedCompletedResults = settings.completedResults || [];

            // 1. End/score/record contest: calculate results for the live heat
            const liveHeatToComplete = heats.find(h => h.id === settings.currentHeatId);
            if (liveHeatToComplete) {
              const hCallbackCount = liveHeatToComplete.role === "Lead"
                ? (settings.callbackCountLeaders !== undefined ? settings.callbackCountLeaders : settings.callbackCount)
                : liveHeatToComplete.role === "Follow"
                  ? (settings.callbackCountFollowers !== undefined ? settings.callbackCountFollowers : settings.callbackCount)
                  : (settings.callbackCount || 5);

              const hAlternateCount = liveHeatToComplete.role === "Lead"
                ? (settings.alternateCountLeaders !== undefined ? settings.alternateCountLeaders : (settings.alternateCount !== undefined ? settings.alternateCount : 2))
                : liveHeatToComplete.role === "Follow"
                  ? (settings.alternateCountFollowers !== undefined ? settings.alternateCountFollowers : (settings.alternateCount !== undefined ? settings.alternateCount : 2))
                  : (settings.alternateCount !== undefined ? settings.alternateCount : 2);

              const results = calculateHeatResults(
                liveHeatToComplete,
                competitors,
                scores,
                settings.judgingStyle || "raw",
                hCallbackCount,
                hAlternateCount,
                settings.callbackCountLeaders,
                settings.callbackCountFollowers,
                settings.alternateCountLeaders,
                settings.alternateCountFollowers,
                settings
              );

              const completedItem: CompletedContestResult = {
                id: `${liveHeatToComplete.id}_${Date.now()}`,
                heatId: liveHeatToComplete.id,
                name: liveHeatToComplete.name,
                division: liveHeatToComplete.division,
                heatType: liveHeatToComplete.heatType || "Prelim",
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                judgingStyle: settings.judgingStyle || "raw",
                rankings: results.map((r, index) => ({
                  rank: r.rank || (index + 1),
                  bib: r.competitor.bib,
                  name: r.competitor.name,
                  averageScore: r.averageScore,
                  averagePlacement: r.averagePlacement,
                  qualified: r.qualified,
                  isAlternate: r.isAlternate
                }))
              };

              updatedCompletedResults = [
                ...updatedCompletedResults.filter(r => r.heatId !== liveHeatToComplete.id), // replace if already exists
                completedItem
              ];
            }

            // 2. Advance / Reset logic
            if (settings.queuedHeatId) {
              const nextHeat = heats.find(h => h.id === settings.queuedHeatId);
              const promotePayload: any = {
                completedResults: updatedCompletedResults,
                currentHeatId: settings.queuedHeatId,
                queuedHeatId: null,
                checkInFinalized: false, // Reset check-in finalization for the next live heat!
                finalizedSheets: [], // Reset finalized sheets for the next live heat!
                ...(settings.nextContestType ? { contestType: settings.nextContestType, nextContestType: null } : {}),
                ...(settings.nextDivision ? { division: settings.nextDivision, nextDivision: null } : {}),
                ...(settings.nextHeatType ? { heatType: settings.nextHeatType, nextHeatType: null } : {}),
                ...(settings.nextJudgingStyle ? { judgingStyle: settings.nextJudgingStyle, nextJudgingStyle: null } : {}),
                ...(settings.nextCallbackCount ? { callbackCount: settings.nextCallbackCount, nextCallbackCount: null } : {}),
                ...(settings.nextAlternateCount !== undefined ? { alternateCount: settings.nextAlternateCount, nextAlternateCount: null } : {}),
                ...(settings.nextCallbackCountLeaders ? { callbackCountLeaders: settings.nextCallbackCountLeaders, nextCallbackCountLeaders: null } : {}),
                ...(settings.nextCallbackCountFollowers ? { callbackCountFollowers: settings.nextCallbackCountFollowers, nextCallbackCountFollowers: null } : {}),
                ...(settings.nextAlternateCountLeaders !== undefined ? { alternateCountLeaders: settings.nextAlternateCountLeaders, nextAlternateCountLeaders: null } : {}),
                ...(settings.nextAlternateCountFollowers !== undefined ? { alternateCountFollowers: settings.nextAlternateCountFollowers, nextAlternateCountFollowers: null } : {}),
                ...(settings.nextJudgeNames ? { judgeNames: settings.nextJudgeNames, nextJudgeNames: null } : {}),
                ...(settings.nextJudgeRoles ? { judgeRoles: settings.nextJudgeRoles, nextJudgeRoles: null } : {}),
                ...(settings.nextChiefJudgeName ? { chiefJudgeName: settings.nextChiefJudgeName, nextChiefJudgeName: null } : {}),
                ...(settings.nextChiefJudgeRole ? { chiefJudgeRole: settings.nextChiefJudgeRole, nextChiefJudgeRole: null } : {}),
              };
              await onUpdateSettings(promotePayload);
              setActiveHeatControlTab("live");
              alert(`Contest ended & recorded! ${nextHeat ? nextHeat.name : "Queued heat"} is now LIVE with promoted configuration settings.`);
            } else {
              // No Next Heat exists, reset admin panel!
              await onUpdateSettings({
                completedResults: updatedCompletedResults,
                currentHeatId: null,
                checkInFinalized: false,
                finalizedSheets: [],
                contestType: "Jack & Jill",
                division: "Novice",
                heatType: "Prelim",
                queuedHeatId: null
              });
              setContestType("Jack & Jill");
              setDivision("Novice");
              setHeatType("Prelim");
              setActiveHeatControlTab("live");
              alert("Contest ended & recorded! No further heats are queued. Admin panel has been reset.");
            }
          } catch (err) {
            console.error(err);
            alert("Failed to complete heat.");
          } finally {
            setLoading(false);
          }
        }}
        className={`w-full py-2.5 rounded-xl font-bold text-xs shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
          canCompleteHeat
            ? "bg-emerald-600 hover:bg-emerald-700 text-white"
            : "bg-slate-300 dark:bg-slate-800 text-slate-600 dark:text-slate-500 cursor-not-allowed opacity-60"
        }`}
      >
        <CheckSquare className="w-4 h-4" />
        Complete Contest
      </button>

      <button
        type="button"
        onClick={() => { window.location.search = "?role=scoring"; }}
        className="w-full mt-2 py-2 rounded-xl font-bold text-[11px] border border-violet-500/30 text-violet-500 hover:bg-violet-500/10 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
      >
        <ExternalLink className="w-3.5 h-3.5" />
        Go to Scoring
      </button>
    </div>
    </>)}

    {/* System Database Reset (Standalone System Control Card) */}
    <div className={`p-6 rounded-2xl border transition-all ${isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 shadow-sm text-slate-800"}`}>
      <h2 className="text-sm font-bold tracking-tight mb-2 flex items-center gap-1.5">
        <RefreshCw className="w-4 h-4 text-emerald-500" />
        System Database Control
      </h2>
      <p className="text-[11px] text-slate-400 mb-4 leading-relaxed">
        Restore all references and entries back to the default reference contest starting catalog.
      </p>
      {!showResetConfirm ? (
        <button
          id="reset-database-btn"
          onClick={() => setShowResetConfirm(true)}
          disabled={loading}
          className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-750 dark:text-emerald-400 border border-slate-200 dark:border-slate-700 text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
        >
          <RefreshCw className="w-4 h-4 animate-spin-slow" />
          Reset System Database
        </button>
      ) : (
        <div className="space-y-2 p-1 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-100 dark:border-slate-800">
          <p className="text-[11px] text-amber-500 font-semibold text-center">Are you sure? This will restore all default dancers and heats, and wipe all scores.</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleReset}
              disabled={loading}
              className="py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-all cursor-pointer text-center"
            >
              {loading ? "Resetting..." : "Yes, Reset"}
            </button>
            <button
              onClick={() => setShowResetConfirm(false)}
              disabled={loading}
              className="py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-xs font-bold transition-all cursor-pointer text-center"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {resetStatus && (
        <div className="mt-2 text-center text-[11px] font-semibold text-emerald-500 dark:text-emerald-400 font-mono animate-pulse">
          {resetStatus}
        </div>
      )}
    </div>

    {/* Quick Simulator & Reset */}
    <div className={`p-6 rounded-2xl border transition-all ${isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 shadow-sm text-slate-800"}`}>
      <div 
        className="flex items-center justify-between mb-3 cursor-pointer select-none"
        onClick={() => toggleCard("devUtils")}
      >
        <h2 className="text-sm font-bold tracking-tight flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-violet-500" />
          Developer Utilities
        </h2>
        {collapsedCards.devUtils ? (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronUp className="w-4 h-4 text-slate-400" />
        )}
      </div>

      {!collapsedCards.devUtils && (
        <div className="space-y-3">
          <button
            id="simulate-scores-btn"
            onClick={handleSimulate}
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-750 text-white text-xs font-bold shadow transition-all flex items-center justify-center gap-2"
          >
            <Play className="w-4 h-4" />
            Simulate 3 Judges Sheets
          </button>
          <p className="text-[10px] text-slate-400 text-center leading-relaxed">
            Instantly populates realistic scores for Judge A, B, and C in the active heat to immediately view completed results matrices!
          </p>

          <button
            id="clear-all-database-btn"
            onClick={handleClearAll}
            disabled={loading}
            className="w-full mt-2 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm shadow-red-600/15"
          >
            <Trash2 className="w-4 h-4" />
            Wipe & Clear All Database
          </button>
        </div>
      )}
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
</React.Fragment>
  );
}
