import React, { useState, useEffect } from "react";
import { Award, Check, Save, User, Clock, AlertTriangle, ChevronUp, ChevronDown, RefreshCw } from "lucide-react";
import { Competitor, Heat, ScoreRecord, JudgingStyle, CallbackValue, AppSettings } from "../types";

interface JudgePortalProps {
  competitors: Competitor[];
  heats: Heat[];
  scores: ScoreRecord[];
  activeHeatId: string | null;
  judgingStyle: JudgingStyle;
  judgeId: string;
  onSaveScore: (scoreData: {
    judgeId: string;
    heatId: string;
    competitorBib: string;
    score: number;
    isCallback: CallbackValue;
  }) => Promise<void>;
  isDarkMode: boolean;
  onRefresh: () => Promise<void>;
  settings: AppSettings;
  onSelectJudge?: (id: string) => void;
  onUpdateSettings: (newSettings: Partial<AppSettings>) => Promise<void>;
  // The judge name (if any) that THIS browser has already claimed, so it can
  // still re-select that same name after a logout or refresh even though the
  // name is otherwise locked out for everyone else.
  myClaimedJudge?: string;
}

export default function JudgePortal({
  competitors,
  heats,
  scores,
  activeHeatId,
  judgingStyle,
  judgeId,
  onSaveScore,
  isDarkMode,
  onRefresh,
  settings,
  onSelectJudge,
  onUpdateSettings,
  myClaimedJudge,
}: JudgePortalProps) {
  const [localScores, setLocalScores] = useState<{ [bib: string]: number }>({});
  const [localCallbacks, setLocalCallbacks] = useState<{ [bib: string]: CallbackValue }>({});
  const [localRawScores, setLocalRawScores] = useState<{ [bib: string]: string }>({});
  const [savedStatus, setSavedStatus] = useState<{ [bib: string]: "idle" | "saving" | "saved" | "error" }>({});
  const [syncing, setSyncing] = useState(false);
  const isSheetFinalized = !!(activeHeatId && settings.finalizedSheets?.includes(`${activeHeatId}:${judgeId}`));

  // Name selection dropdown states
  const [tempSelectedJudge, setTempSelectedJudge] = useState(judgeId || "");

  // Pull down to refresh implementation
  const [pullProgress, setPullProgress] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const startYRef = React.useRef(0);

  useEffect(() => {
    setTempSelectedJudge(judgeId || "");
  }, [judgeId]);

  React.useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      if (window.scrollY === 0) {
        startYRef.current = e.touches[0].clientY;
        setIsPulling(true);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isPulling) return;
      const currentY = e.touches[0].clientY;
      const diff = currentY - startYRef.current;
      if (diff > 0) {
        const progress = Math.min(diff / 120, 1);
        setPullProgress(progress);
        if (diff > 10 && e.cancelable) {
          e.preventDefault();
        }
      }
    };

    const handleTouchEnd = async () => {
      if (isPulling) {
        setIsPulling(false);
        if (pullProgress >= 1) {
          setSyncing(true);
          try {
            await onRefresh();
          } finally {
            setTimeout(() => setSyncing(false), 500);
          }
        }
        setPullProgress(0);
      }
    };

    window.addEventListener("touchstart", handleTouchStart, { passive: false });
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd);

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [isPulling, pullProgress, onRefresh]);

  const defaultNames = ["Judge A", "Judge B", "Judge C", "Judge D", "Judge E"];
  const defaultRoles = ["None", "None", "None", "None", "None"];
  const names = settings.judgeNames || defaultNames;
  const roles = settings.judgeRoles || defaultRoles;
  const chiefName = settings.chiefJudgeName || "Chief Judge";
  const chiefRole = settings.chiefJudgeRole || "Both";

  const enabledJudges = names
    .map((name, idx) => ({ name, role: roles[idx] || "Finals" }))
    .filter((j) => j.role !== "None");

  const isChiefEnabled = chiefRole !== "None";

  // A name is available to pick if nobody has claimed it yet, OR this browser is
  // the one that claimed it (so the rightful judge can always get back in).
  const claimedJudges = settings.claimedJudges || [];
  const isNameClaimedByOther = (name: string) => claimedJudges.includes(name) && name !== myClaimedJudge;

  // Check if current judgeId is enabled and in active list
  const isCurrentJudgeEnabled = !!judgeId && ((judgeId === chiefName && isChiefEnabled) || 
    enabledJudges.some(j => j.name === judgeId));

  // Get active judge role
  let judgeRole: "Leaders" | "Followers" | "Finals" | "Both" | "None" = "None";
  if (judgeId === chiefName) {
    judgeRole = chiefRole;
  } else {
    const idx = names.indexOf(judgeId);
    if (idx !== -1) {
      judgeRole = roles[idx] as "Leaders" | "Followers" | "Finals" | "None";
    }
  }

  const activeHeat = heats.find((h) => h.id === activeHeatId);
  const targetCallbackCount = activeHeat && activeHeat.role === "Lead"
    ? (settings.callbackCountLeaders !== undefined ? settings.callbackCountLeaders : settings.callbackCount)
    : activeHeat && activeHeat.role === "Follow"
      ? (settings.callbackCountFollowers !== undefined ? settings.callbackCountFollowers : settings.callbackCount)
      : settings.callbackCount;

  const targetAlternateCount = activeHeat && activeHeat.role === "Lead"
    ? (settings.alternateCountLeaders !== undefined ? settings.alternateCountLeaders : (settings.alternateCount || 0))
    : activeHeat && activeHeat.role === "Follow"
      ? (settings.alternateCountFollowers !== undefined ? settings.alternateCountFollowers : (settings.alternateCount || 0))
      : (settings.alternateCount || 0);

  const rawHeatCompetitors = activeHeat
    ? activeHeat.competitorBibs.map((bib) => {
        // Try finding direct competitor profile
        const comp = competitors.find((c) => c.bib === bib);
        if (comp) {
          if (comp.checkedIn && !comp.scratched) {
            return comp;
          }
          return undefined;
        }

        // If bib contains underscore, it represents a couple (e.g. "1_11")
        if (bib.includes("_")) {
          const [leadBib, followBib] = bib.split("_");
          const lead = competitors.find((c) => c.bib === leadBib);
          const follow = competitors.find((c) => c.bib === followBib);

          const isLeadOk = lead ? (lead.checkedIn && !lead.scratched) : false;
          const isFollowOk = follow ? (follow.checkedIn && !follow.scratched) : false;
          if (!isLeadOk || !isFollowOk) {
            return undefined;
          }

          const isFinals = activeHeat.heatType === "Finals" || activeHeat.name.includes("Finals");

          if (isFinals || judgeRole === "Both") {
            const leadName = lead ? lead.name : `Lead #${leadBib}`;
            const followName = follow ? follow.name : `Follow #${followBib}`;
            return {
              bib,
              name: `${leadName} & ${followName}`,
              division: activeHeat.division,
              role: "Lead" as const, // virtual role for layout
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
              division: activeHeat.division,
              role: "Lead" as const,
              checkedIn: true
            } as Competitor;
          }
        }
        return undefined;
      }).filter((c): c is Competitor => !!c)
    : [];

  const isHeatFinals = activeHeat ? (activeHeat.heatType === "Finals" || activeHeat.name.includes("Finals")) : false;
  const baseHeatCompetitors = activeHeat && !isHeatFinals
    ? [...rawHeatCompetitors].sort((a, b) => a.bib.localeCompare(b.bib, undefined, { numeric: true }))
    : rawHeatCompetitors;

  // Filter based on judge role
  const heatCompetitors = activeHeat
    ? baseHeatCompetitors.filter((c) => {
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
      })
    : [];

  let isAssignedToThisHeat = true;
  let notAssignedMessage = "";

  if (activeHeat) {
    if (isHeatFinals) {
      if (judgeRole !== "Finals" && judgeRole !== "Both") {
        isAssignedToThisHeat = false;
        notAssignedMessage = `Your assigned role is "${judgeRole}", but this is a Finals heat (which is only judged by Finals or Chief judges).`;
      }
    } else {
      if (judgeRole === "Finals") {
        isAssignedToThisHeat = false;
        notAssignedMessage = `Your assigned role is "Finals", but this is a ${activeHeat.heatType || (activeHeat.name.includes("Finals") ? "Finals" : "Prelim")} heat. Please wait for a Finals heat to be activated.`;
      } else if (judgeRole === "Leaders" && activeHeat.role === "Follow") {
        isAssignedToThisHeat = false;
        notAssignedMessage = `Your assigned role is "Leaders", but this heat is for Followers.`;
      } else if (judgeRole === "Followers" && activeHeat.role === "Lead") {
        isAssignedToThisHeat = false;
        notAssignedMessage = `Your assigned role is "Followers", but this heat is for Leaders.`;
      }
    }
  }

  // Serialize only the scores relevant to this judge and this heat to prevent infinite re-renders.
  // This primitive string will only change when actual database scores for this judge/heat change.
  const relevantScoresKey = JSON.stringify(
    scores
      .filter((s) => s.judgeId === judgeId && s.heatId === activeHeatId)
      .map((s) => `${s.competitorBib}:${s.score}:${s.isCallback}`)
      .sort()
  );

  // Serialize competitor list for this heat to safely track changes
  const competitorBibsKey = activeHeat ? activeHeat.competitorBibs.join(",") : "";

  // Initialize local states when active heat or scores update
  useEffect(() => {
    if (!activeHeat) return;

    const initialScores: { [bib: string]: number } = {};
    const initialCallbacks: { [bib: string]: CallbackValue } = {};
    const initialRawScores: { [bib: string]: string } = {};
    const initialStatus: { [bib: string]: "idle" } = {};

    heatCompetitors.forEach((c) => {
      // Find existing score
      const existing = scores.find(
        (s) => s.judgeId === judgeId && s.heatId === activeHeat.id && s.competitorBib === c.bib
      );

      initialScores[c.bib] = existing ? existing.score : 0;
      initialCallbacks[c.bib] = existing ? existing.isCallback : "No";
      initialRawScores[c.bib] = (judgingStyle === "placement" && existing && existing.isCallback !== "No") ? existing.isCallback : "";
      initialStatus[c.bib] = "idle";
    });

    setLocalScores(initialScores);
    setLocalCallbacks(initialCallbacks);
    setLocalRawScores(initialRawScores);
    setSavedStatus(initialStatus);
  }, [activeHeatId, judgeId, judgingStyle, relevantScoresKey, competitorBibsKey, judgeRole]);

  // Identity Select Screen
  if (!judgeId || !isCurrentJudgeEnabled) {
    return (
      <div className="max-w-md w-full mx-auto my-12 animate-fade-in">
        <div className={`p-8 rounded-3xl border transition-all ${
          isDarkMode 
            ? "bg-slate-900 border-slate-800 text-slate-100 shadow-2xl" 
            : "bg-white border-slate-200 text-slate-800 shadow-xl"
        }`}>
          <div className="flex flex-col items-center text-center">
            <div className="p-4 rounded-2xl mb-4 border border-violet-500/20 text-violet-500 bg-violet-500/5">
              <User className="w-10 h-10" />
            </div>

            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-violet-400 bg-violet-500/10 px-2.5 py-1 rounded">
              Adjudicator Verification
            </span>

            <h2 className="text-2xl font-bold tracking-tight mt-4 text-slate-900 dark:text-slate-100 font-sans">
              Select Your Name
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
              Please choose your assigned judge profile to enter the secure real-time WCS scoring console.
            </p>
          </div>

          <div className="mt-6 space-y-4">
            <div>
              <label className="block text-xs font-mono font-bold text-slate-400 uppercase tracking-wider mb-2">
                Judge Profile
              </label>
              <select
                id="judge-identity-select"
                value={tempSelectedJudge}
                onChange={(e) => setTempSelectedJudge(e.target.value)}
                className={`w-full text-sm px-4 py-3 rounded-xl border focus:outline-none focus:ring-1 focus:ring-violet-500 font-sans transition-all cursor-pointer ${
                  isDarkMode
                    ? "bg-slate-800 border-slate-700 text-slate-100"
                    : "bg-slate-50 border-slate-200 text-slate-800"
                }`}
              >
                <option value="">Choose your profile...</option>
                {enabledJudges.map((j) => {
                  const takenByOther = isNameClaimedByOther(j.name);
                  return (
                    <option key={j.name} value={j.name} disabled={takenByOther}>
                      {j.name} ({j.role}){takenByOther ? " — Already Claimed" : ""}
                    </option>
                  );
                })}
                {isChiefEnabled && (() => {
                  const takenByOther = isNameClaimedByOther(chiefName);
                  return (
                    <option value={chiefName} disabled={takenByOther}>
                      {chiefName} (Chief / {chiefRole}){takenByOther ? " — Already Claimed" : ""}
                    </option>
                  );
                })()}
              </select>
            </div>

            <button
              id="enter-scoring-console-btn"
              disabled={!tempSelectedJudge || isNameClaimedByOther(tempSelectedJudge)}
              onClick={async () => {
                if (!tempSelectedJudge || isNameClaimedByOther(tempSelectedJudge)) return;
                if (!claimedJudges.includes(tempSelectedJudge)) {
                  await onUpdateSettings({ claimedJudges: [...claimedJudges, tempSelectedJudge] });
                }
                if (onSelectJudge) {
                  onSelectJudge(tempSelectedJudge);
                }
              }}
              className={`w-full py-3 rounded-xl font-semibold text-xs tracking-wide uppercase transition-all ${
                tempSelectedJudge && !isNameClaimedByOther(tempSelectedJudge)
                  ? "bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-500/20 cursor-pointer"
                  : "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50"
              }`}
            >
              Enter Scoring Console
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (settings.judgingEnabled === false) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className={`p-4 rounded-2xl border flex justify-between items-center transition-all ${
          isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100 shadow-sm"
        }`}>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-xs font-mono font-bold text-slate-300">
              Logged in as: <strong className="text-violet-400">{judgeId}</strong> ({judgeRole})
            </span>
          </div>
          <button
            onClick={() => {
              if (onSelectJudge) onSelectJudge("");
            }}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold transition-all"
          >
            Log Out
          </button>
        </div>

        <div className="max-w-md w-full mx-auto my-12 animate-fade-in">
          <div className={`p-8 rounded-3xl border text-center transition-all ${
            isDarkMode 
              ? "bg-slate-900 border-slate-800 text-slate-100 shadow-2xl" 
              : "bg-white border-slate-200 text-slate-800 shadow-xl"
          }`}>
            <div className="p-4 rounded-2xl mb-4 border border-rose-500/25 text-rose-500 bg-rose-500/5 inline-block">
              <AlertTriangle className="w-10 h-10 animate-pulse" />
            </div>
            
            <h2 className="text-xl font-bold tracking-tight mt-2 text-slate-900 dark:text-slate-100 font-sans">Live Judging Suspended</h2>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              The live judging console for <strong>{judgeId}</strong> has been suspended by the event administrators. Score card entries and callback updates are frozen.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const handleScoreChange = async (bib: string, newScore: number) => {
    // Bound check
    let scoreVal = Number(newScore);
    if (judgingStyle === "raw") {
      if (scoreVal < 0) scoreVal = 0;
      if (scoreVal > 100) scoreVal = 100;
      scoreVal = Number(scoreVal.toFixed(2)); // Standard scores (allowing decimals)
    }

    const tempScores = { ...localScores, [bib]: scoreVal };

    // Auto-calculate callbacks in raw mode
    const nextCallbacks = { ...localCallbacks };
    if (judgingStyle === "raw") {
      const scored = [...heatCompetitors]
        .map(c => ({ bib: c.bib, score: tempScores[c.bib] || 0 }))
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return a.bib.localeCompare(b.bib, undefined, { numeric: true });
        });

      scored.forEach((item, index) => {
        let cbStatus: CallbackValue = "No";
        if (item.score > 0) {
          if (index < targetCallbackCount) {
            cbStatus = "Yes";
          } else if (index < targetCallbackCount + targetAlternateCount) {
            const altIndex = index - targetCallbackCount;
            if (altIndex === 0) cbStatus = "Alt 1";
            else if (altIndex === 1) cbStatus = "Alt 2";
            else if (altIndex === 2) cbStatus = "Alt 3";
            else cbStatus = "Alt 1";
          }
        }
        nextCallbacks[item.bib] = cbStatus;
      });
      setLocalCallbacks(nextCallbacks);
    }

    setLocalScores(tempScores);

    // Save the changed competitor's score and computed callback status
    const currentCB = judgingStyle === "raw" ? nextCallbacks[bib] : (localCallbacks[bib] || "No");
    await triggerSave(bib, scoreVal, currentCB);

    // Also trigger save for other competitors whose Callback Status might have shifted in raw mode
    if (judgingStyle === "raw") {
      for (const item of heatCompetitors) {
        if (item.bib !== bib) {
          const oldCB = localCallbacks[item.bib];
          const newCB = nextCallbacks[item.bib];
          if (oldCB !== newCB) {
            await triggerSave(item.bib, tempScores[item.bib] || 0, newCB);
          }
        }
      }
    }
  };

  const decreaseScore = async (bib: string, currentScore: number) => {
    let scoreVal = currentScore - 0.25;
    if (scoreVal < 0) scoreVal = 0;
    scoreVal = Math.round(scoreVal * 100) / 100;
    await handleScoreChange(bib, scoreVal);
  };

  const increaseScore = async (bib: string, currentScore: number) => {
    let scoreVal = currentScore + 0.25;
    if (scoreVal > 100) scoreVal = 100;
    scoreVal = Math.round(scoreVal * 100) / 100;
    await handleScoreChange(bib, scoreVal);
  };

  const handleRawScoreChangeLocal = async (bib: string, val: string) => {
    // 1. Change commas to decimals
    let filteredVal = val.replace(/,/g, ".");

    // 2. Only allow numbers and a single decimal point.
    // If anything other than digits and '.' is entered, OR if there's more than one '.', clear the field.
    const isValidChar = /^[0-9.]*$/.test(filteredVal);
    const decimalCount = (filteredVal.match(/\./g) || []).length;
    if (!isValidChar || decimalCount > 1) {
      filteredVal = "";
    }

    const updatedRawScores = { ...localRawScores, [bib]: filteredVal };
    setLocalRawScores(updatedRawScores);

    // Auto calculate suggested placements for finalists who have raw scores entered
    const competitorsWithRaw = heatCompetitors
      .map(comp => {
        const rawStr = updatedRawScores[comp.bib] || "";
        const scoreVal = parseFloat(rawStr);
        return {
          bib: comp.bib,
          rawScore: isNaN(scoreVal) ? -1 : scoreVal
        };
      })
      .filter(item => item.rawScore >= 0);

    // Sort descending by raw score
    competitorsWithRaw.sort((a, b) => b.rawScore - a.rawScore);

    const newPlacements = { ...localScores };
    competitorsWithRaw.forEach((item, idx) => {
      newPlacements[item.bib] = idx + 1;
    });

    setLocalScores(newPlacements);

    // Save current competitor's placement and the raw score (stored inside the isCallback field as string)
    const currentPlacement = newPlacements[bib] || 0;
    await triggerSave(bib, currentPlacement, filteredVal as any);

    // Also trigger save for other competitors whose suggested placement shifted
    for (const item of competitorsWithRaw) {
      if (item.bib !== bib) {
        const oldPlacement = localScores[item.bib] || 0;
        const newPlacement = newPlacements[item.bib] || 0;
        if (oldPlacement !== newPlacement) {
          await triggerSave(item.bib, newPlacement, updatedRawScores[item.bib] as any);
        }
      }
    }
  };

  const handlePlacementDropdownChange = async (bib: string, rankVal: number) => {
    setLocalScores((prev) => ({ ...prev, [bib]: rankVal }));
    const rawVal = localRawScores[bib] || "";
    await triggerSave(bib, rankVal, rawVal as any);
  };

  const getOrdinalSuffix = (num: number) => {
    const j = num % 10, k = num % 100;
    if (j === 1 && k !== 11) {
      return "st";
    }
    if (j === 2 && k !== 12) {
      return "nd";
    }
    if (j === 3 && k !== 13) {
      return "rd";
    }
    return "th";
  };

  const getRawPlacement = (bib: string) => {
    const currentScore = localScores[bib] || 0;
    if (currentScore === 0) return "—";

    const scored = heatCompetitors
      .map(c => ({ bib: c.bib, score: localScores[c.bib] || 0 }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score);

    let rank = 1;
    for (let i = 0; i < scored.length; i++) {
      if (scored[i].score > currentScore) {
        rank++;
      }
    }
    return `${rank}${getOrdinalSuffix(rank)} / ${scored.length}`;
  };

  const getRawRankStatus = (bib: string) => {
    const currentScore = localScores[bib] || 0;
    if (currentScore === 0) return "—";

    const scored = [...heatCompetitors]
      .map(c => ({ bib: c.bib, score: localScores[c.bib] || 0 }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.bib.localeCompare(b.bib, undefined, { numeric: true });
      });

    const index = scored.findIndex(item => item.bib === bib);
    if (index === -1) return "—";

    if (index < targetCallbackCount) {
      return "Yes";
    } else if (index < targetCallbackCount + targetAlternateCount) {
      const altIdx = index - targetCallbackCount + 1;
      return `Alt ${altIdx}`;
    } else {
      return "No";
    }
  };

  const getCallbackPlacement = (bib: string) => {
    const cbWeights: Record<CallbackValue, number> = {
      "Yes": 4,
      "Alt 1": 3,
      "Alt 2": 2,
      "Alt 3": 1,
      "No": 0
    };

    const currentWeight = cbWeights[localCallbacks[bib] || "No"];

    const list = heatCompetitors.map(c => ({
      bib: c.bib,
      weight: cbWeights[localCallbacks[c.bib] || "No"]
    }));

    let rank = 1;
    for (let i = 0; i < list.length; i++) {
      if (list[i].weight > currentWeight) {
        rank++;
      }
    }
    return `${rank}${getOrdinalSuffix(rank)} / ${list.length}`;
  };

  const handleCallbackChange = async (bib: string, cbVal: CallbackValue) => {
    setLocalCallbacks((prev) => {
      const updated = { ...prev };
      
      // If cbVal is an Alt rank (e.g. "Alt 1", "Alt 2", "Alt 3"),
      // check if another competitor has that value, and reset them to "No"
      if (cbVal !== "Yes" && cbVal !== "No") {
        Object.keys(updated).forEach((otherBib) => {
          if (otherBib !== bib && updated[otherBib] === cbVal) {
            updated[otherBib] = "No";
            triggerSave(otherBib, localScores[otherBib] || 0, "No");
          }
        });
      }
      
      updated[bib] = cbVal;
      return updated;
    });
    
    await triggerSave(bib, localScores[bib] || 0, cbVal);
  };

  const triggerSave = async (bib: string, scoreVal: number, cbVal: CallbackValue) => {
    if (!activeHeat) return;
    setSavedStatus((prev) => ({ ...prev, [bib]: "saving" }));

    try {
      await onSaveScore({
        judgeId,
        heatId: activeHeat.id,
        competitorBib: bib,
        score: scoreVal,
        isCallback: cbVal
      });
      setSavedStatus((prev) => ({ ...prev, [bib]: "saved" }));
      setTimeout(() => {
        setSavedStatus((prev) => ({ ...prev, [bib]: "idle" }));
      }, 1500);
    } catch (err) {
      console.error("Autosave score failed", err);
      setSavedStatus((prev) => ({ ...prev, [bib]: "error" }));
    }
  };

  // Reorder for Placement (swapping rank)
  const handleMoveRank = async (bib: string, direction: "up" | "down") => {
    if (judgingStyle !== "placement" || !activeHeat) return;

    // Get list of current heat competitor bibs ordered by current local placements
    // Competitors with 0 placement are placed at the bottom
    const sortedCompetitors = [...heatCompetitors].sort((a, b) => {
      const pA = localScores[a.bib] || 999;
      const pB = localScores[b.bib] || 999;
      return pA - pB;
    });

    const index = sortedCompetitors.findIndex((c) => c.bib === bib);
    if (index === -1) return;

    let targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sortedCompetitors.length) return;

    const currentComp = sortedCompetitors[index];
    const swapComp = sortedCompetitors[targetIndex];

    // Swap their ranks (1-indexed ranks based on their indices)
    const currentRank = index + 1;
    const newRank = targetIndex + 1;

    // Update state and trigger save for both
    setLocalScores((prev) => ({
      ...prev,
      [currentComp.bib]: newRank,
      [swapComp.bib]: currentRank
    }));

    await Promise.all([
      triggerSave(currentComp.bib, newRank, localCallbacks[currentComp.bib] || "No"),
      triggerSave(swapComp.bib, currentRank, localCallbacks[swapComp.bib] || "No")
    ]);
  };

  // Initialize placements if they are 0
  const handleInitializePlacements = async () => {
    if (!activeHeat) return;
    const updatedScores = { ...localScores };

    // Simply assign sequential ranks 1 to N
    for (let i = 0; i < heatCompetitors.length; i++) {
      const bib = heatCompetitors[i].bib;
      const rank = i + 1;
      updatedScores[bib] = rank;
      await triggerSave(bib, rank, localCallbacks[bib] || "No");
    }
    setLocalScores(updatedScores);
  };

  const handleManualRefresh = async () => {
    setSyncing(true);
    try {
      await onRefresh();
    } finally {
      setTimeout(() => setSyncing(false), 500);
    }
  };

  // Statistics about current judge sheet
  const scoredCount = judgingStyle === "callback"
    ? heatCompetitors.length
    : heatCompetitors.filter((c) => (localScores[c.bib] || 0) > 0).length;
  const isSheetComplete = judgingStyle === "callback"
    ? true
    : heatCompetitors.length > 0 && scoredCount === heatCompetitors.length;

  // Let's check for duplicate ranks in placement style
  const assignedPlacements = (Object.values(localScores) as number[]).filter((v) => v > 0);
  const uniquePlacements = new Set(assignedPlacements);
  const hasDuplicatePlacements = judgingStyle === "placement" && assignedPlacements.length !== uniquePlacements.size;

  if (!activeHeat) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className={`p-4 rounded-2xl border flex justify-between items-center transition-all ${
          isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100 shadow-sm"
        }`}>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs font-mono font-bold text-slate-300">
              Logged in as: <strong className="text-violet-400">{judgeId}</strong> ({judgeRole})
            </span>
          </div>
          <button
            onClick={() => {
              if (onSelectJudge) onSelectJudge("");
            }}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold transition-all"
          >
            Log Out
          </button>
        </div>

        <div className={`p-8 rounded-2xl border text-center transition-all ${isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 text-slate-800 shadow-sm"}`}>
          <Clock className="w-12 h-12 mx-auto text-violet-500 mb-4 animate-spin-slow" />
          <h3 className="text-lg font-bold tracking-tight">No Active Heat</h3>
          <p className="text-xs text-slate-400 mt-2 max-w-sm mx-auto">
            Please wait for the Competition Coordinator or Admin to launch and activate a scoring heat.
          </p>
          <button
            onClick={handleManualRefresh}
            className="mt-6 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold flex items-center gap-2 mx-auto transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
            Force Sync Status
          </button>
        </div>
      </div>
    );
  }

  if (!settings.checkInFinalized) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className={`p-4 rounded-2xl border flex justify-between items-center transition-all ${
          isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100 shadow-sm"
        }`}>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
            <span className="text-xs font-mono font-bold text-slate-300">
              Logged in as: <strong className="text-violet-400">{judgeId}</strong> ({judgeRole})
            </span>
          </div>
          <button
            onClick={() => {
              if (onSelectJudge) onSelectJudge("");
            }}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold transition-all"
          >
            Log Out
          </button>
        </div>

        <div className={`p-8 rounded-2xl border text-center transition-all ${isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 text-slate-800 shadow-sm"}`}>
          <Clock className="w-12 h-12 mx-auto text-amber-500 mb-4 animate-pulse" />
          <h3 className="text-lg font-bold tracking-tight">Awaiting Floor Coordinator Check-In</h3>
          <p className="text-xs text-slate-400 mt-2 max-w-sm mx-auto">
            {activeHeat.name} has been created, but the Floor Coordinator has not yet finalized the check-in sheet.
            Judge sheets populate with competitors as soon as check-in is submitted.
          </p>
          <button
            onClick={handleManualRefresh}
            className="mt-6 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold flex items-center gap-2 mx-auto transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
            Force Sync Status
          </button>
        </div>
      </div>
    );
  }

  if (!isAssignedToThisHeat || heatCompetitors.length === 0) {
    const message = notAssignedMessage || `No competitors of your assigned role ("${judgeRole}") are present in this heat.`;
    return (
      <div className="space-y-6 animate-fade-in">
        <div className={`p-4 rounded-2xl border flex justify-between items-center transition-all ${
          isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100 shadow-sm"
        }`}>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
            <span className="text-xs font-mono font-bold text-slate-300">
              Logged in as: <strong className="text-violet-400">{judgeId}</strong> ({judgeRole})
            </span>
          </div>
          <button
            onClick={() => {
              if (onSelectJudge) onSelectJudge("");
            }}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold transition-all"
          >
            Log Out
          </button>
        </div>

        <div className={`p-8 rounded-2xl border text-center transition-all ${
          isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 text-slate-800 shadow-sm"
        }`}>
          <Clock className="w-12 h-12 mx-auto text-amber-500 mb-4 animate-pulse" />
          <h3 className="text-lg font-bold tracking-tight">Active Heat: {activeHeat.name}</h3>
          <p className="text-xs text-slate-400 mt-2 max-w-sm mx-auto leading-relaxed">
            {message}
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <button
              onClick={handleManualRefresh}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition-all"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
              Refresh Status
            </button>
          </div>
        </div>
      </div>
    );
  }



  // Check for duplicate or tied ranks/scores
  const tiedBibs = new Set<string>();
  if (judgingStyle === "raw") {
    const scoredCompetitors = heatCompetitors.filter(c => (localScores[c.bib] || 0) > 0);
    const scoreMap: Record<number, string[]> = {};
    scoredCompetitors.forEach(c => {
      const s = localScores[c.bib];
      if (!scoreMap[s]) scoreMap[s] = [];
      scoreMap[s].push(c.bib);
    });
    Object.values(scoreMap).forEach(bibs => {
      if (bibs.length > 1) {
        bibs.forEach(b => tiedBibs.add(b));
      }
    });
  } else if (judgingStyle === "placement") {
    const rankedCompetitors = heatCompetitors.filter(c => (localScores[c.bib] || 0) > 0);
    const placementMap: Record<number, string[]> = {};
    rankedCompetitors.forEach(c => {
      const p = localScores[c.bib];
      if (!placementMap[p]) placementMap[p] = [];
      placementMap[p].push(c.bib);
    });
    Object.values(placementMap).forEach(bibs => {
      if (bibs.length > 1) {
        bibs.forEach(b => tiedBibs.add(b));
      }
    });
  }

  // Quota satisfied calculation
  const currentYesCount = heatCompetitors.filter(c => localCallbacks[c.bib] === "Yes").length;
  const currentAltCount = heatCompetitors.filter(c => {
    const val = localCallbacks[c.bib];
    return val && val !== "No" && val !== "Yes";
  }).length;
  
  let areAltsSatisfied = true;
  for (let r = 1; r <= targetAlternateCount; r++) {
    const rStr = `Alt ${r}`;
    const cnt = heatCompetitors.filter(c => localCallbacks[c.bib] === rStr).length;
    if (cnt !== 1) areAltsSatisfied = false;
  }
  for (let r = targetAlternateCount + 1; r <= 3; r++) {
    const rStr = `Alt ${r}`;
    const cnt = heatCompetitors.filter(c => localCallbacks[c.bib] === rStr).length;
    if (cnt > 0) areAltsSatisfied = false;
  }

  const isQuotaSatisfied = currentYesCount === targetCallbackCount && areAltsSatisfied;
  const isQuotaReady = (judgingStyle !== "callback") ? true : isQuotaSatisfied;
  const canFinalize = isSheetComplete && isQuotaReady && tiedBibs.size === 0;

  const hasJudgeStartedInput = !!(
    (activeHeat && scores.some((s) => s.judgeId === judgeId && s.heatId === activeHeat.id)) ||
    Object.values(localScores).some((score) => (score as number) > 0) ||
    Object.values(localCallbacks).some((cb) => cb !== "No")
  );

  const handleFinalizeClick = async () => {
    if (!canFinalize || !activeHeatId) return;
    const key = `${activeHeatId}:${judgeId}`;
    const currentFinalized = settings.finalizedSheets || [];
    if (!currentFinalized.includes(key)) {
      const updated = [...currentFinalized, key];
      await onUpdateSettings({ finalizedSheets: updated });
    }
  };

  // Do not re-order the competitors as they are scored. Always render in original bib order (or heat-defined order)
  const orderedCompetitorsForRender = heatCompetitors;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Pull down to refresh indicator */}
      {pullProgress > 0 && (
        <div 
          className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center pointer-events-none transition-all duration-75"
          style={{ 
            transform: `translateY(${pullProgress * 60}px)`, 
            opacity: pullProgress 
          }}
        >
          <div className="bg-violet-600 text-white px-3 py-1.5 rounded-full shadow-lg flex items-center gap-2 text-xs font-bold border border-violet-500/30">
            <RefreshCw className={`w-3.5 h-3.5 ${pullProgress >= 1 ? "animate-spin" : ""}`} />
            {pullProgress >= 1 ? "Release to Refresh" : "Pull to Refresh"}
          </div>
        </div>
      )}

      {/* Active Judge Status & Profile Switcher */}
      <div className={`p-4 rounded-2xl border flex justify-between items-center transition-all ${
        isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100 shadow-sm"
      }`}>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs font-mono font-bold text-slate-300">
            Adjudicator Profile: <strong className="text-violet-400">{judgeId}</strong> ({judgeRole} Engine Active)
          </span>
        </div>
        <button
          onClick={() => {
            if (onSelectJudge) onSelectJudge("");
          }}
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold transition-all"
        >
          Log Out
        </button>
      </div>
      {/* Active Heat Status Header */}
      <div className={`p-5 rounded-2xl border transition-all ${isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100 shadow-sm"}`}>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] bg-red-500/10 text-red-500 px-2 py-0.5 rounded-full font-mono font-bold uppercase tracking-wider animate-pulse">Live Judging Active</span>
              <span className="text-xs font-mono text-slate-400">Heat ID: {activeHeat.id}</span>
            </div>
            <h2 className="text-lg font-bold tracking-tight text-violet-500 mt-1">{activeHeat.name}</h2>
            <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-400">
              <span>{activeHeat.division}</span>
              {activeHeat.role !== "Mixed" && (
                <>
                  <span>•</span>
                  <span className={`px-1.5 py-0.5 rounded font-medium ${
                    activeHeat.role === "Lead" ? "bg-emerald-500/10 text-emerald-500" :
                    "bg-rose-500/10 text-rose-500"
                  }`}>{activeHeat.role}s</span>
                </>
              )}
              <span>•</span>
              <span className="font-mono text-slate-300">Style: {judgingStyle === "raw" ? "Raw Score (0-100)" : (judgingStyle === "placement" ? "Placement Ranks (1-N)" : "Yes / No / Alt Callbacks")}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-200 dark:border-slate-800 flex-wrap sm:flex-nowrap">
            {judgingStyle === "callback" && (
              <div className="text-left sm:text-right pr-3 sm:border-r border-slate-200 dark:border-slate-800">
                <span className={`text-[10px] font-bold font-mono block uppercase tracking-wider ${isQuotaReady && isQuotaSatisfied ? "text-green-500" : "text-red-500"}`}>
                  Callback Quota
                </span>
                <span className={`text-xs font-bold font-mono block ${isQuotaReady && isQuotaSatisfied ? "text-green-500" : "text-red-500"}`}>
                  Callbacks: {currentYesCount}/{targetCallbackCount}
                </span>
                <span className={`text-xs font-bold font-mono block ${isQuotaReady && isQuotaSatisfied ? "text-green-500" : "text-red-500"}`}>
                  Alts: {currentAltCount}/{targetAlternateCount}
                </span>
                {targetAlternateCount > 1 && !areAltsSatisfied && (
                  <span className="block text-[9px] text-rose-500 font-mono mt-0.5 font-bold animate-pulse">
                    Must assign exactly one of each: {Array.from({ length: targetAlternateCount }).map((_, i) => `Alt ${i + 1}`).join(", ")}
                  </span>
                )}
              </div>
            )}

            <div className={`text-left sm:text-right transition-opacity duration-200 ${hasJudgeStartedInput ? "opacity-100" : "opacity-40"}`}>
              <span className="text-[10px] font-medium text-slate-400 font-mono block uppercase tracking-wider">Scored Progress</span>
              <span className={`text-sm font-bold font-mono ${hasJudgeStartedInput ? (isSheetComplete ? "text-green-500" : "text-amber-500 animate-pulse") : "text-slate-400"}`}>
                {hasJudgeStartedInput ? `${scoredCount} / ${heatCompetitors.length} Complete` : "Deactivated (Not Started)"}
              </span>
            </div>

            <button
              id="judge-finalize-btn"
              disabled={!canFinalize}
              onClick={handleFinalizeClick}
              className={`px-4 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer select-none ${
                isSheetFinalized
                  ? "bg-emerald-600 text-white shadow-md cursor-default"
                  : canFinalize
                    ? "bg-green-600 hover:bg-green-700 text-white shadow-md animate-pulse"
                    : "bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed border border-slate-300 dark:border-slate-700"
              }`}
            >
              {isSheetFinalized ? "Finalized ✓" : "Finalize"}
            </button>

            <button
              id="judge-refresh-btn"
              onClick={handleManualRefresh}
              className={`p-2.5 rounded-xl border transition-all ${
                isDarkMode ? "bg-slate-800 border-slate-700 text-slate-200" : "bg-slate-100 border-slate-200 text-slate-700"
              }`}
              title="Force Sync Server State"
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {isSheetFinalized && (
          <div className="mt-4 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs font-medium flex items-center gap-2.5 animate-fade-in">
            <Check className="w-5 h-5 flex-shrink-0 bg-emerald-500 text-slate-900 rounded-full p-0.5" />
            <div>
              <strong className="block text-sm font-bold">Sheet Finalized & Locked!</strong>
              <span>Your scores and callbacks have been successfully registered on the central server and are secure.</span>
            </div>
          </div>
        )}

        {tiedBibs.size > 0 && (
          <div className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 text-xs font-medium flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>Warning: You have active ties on your sheet! Tied cards are highlighted in orange. Please break any ties to finalize your sheet.</span>
          </div>
        )}

        {hasDuplicatePlacements && (
          <div className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 text-xs font-medium flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>Warning: You have assigned duplicate placement ranks! Under WCS rules, each dancer must have a unique rank.</span>
          </div>
        )}
      </div>

      {/* Competitors List for Scoring */}
      <div className="space-y-4">
        {/* Total number of competitors in that role above the first name */}
        <div className="p-3 bg-violet-500/10 border border-violet-500/20 rounded-xl flex items-center justify-between">
          <span className="text-xs font-mono font-bold text-violet-400 uppercase tracking-wider">
            Total Competitors: {heatCompetitors.length}
          </span>
          <span className="text-[10px] font-mono text-slate-400">
            Active Judge Sheet
          </span>
        </div>

        {judgingStyle === "placement" && assignedPlacements.length === 0 && (
          <div className={`p-4 rounded-xl border text-center transition-all ${isDarkMode ? "bg-slate-900 border-slate-800" : "bg-slate-50 border-slate-200"}`}>
            <p className="text-xs text-slate-400 mb-3">Ranks are not initialized for this heat.</p>
            <button
              id="init-placements-btn"
              onClick={handleInitializePlacements}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-750 text-white rounded-xl text-xs font-bold shadow transition-all"
            >
              Initialize Sequential Placements
            </button>
          </div>
        )}

        {orderedCompetitorsForRender.map((c, index) => {
          const score = localScores[c.bib] || 0;
          const callbackVal = localCallbacks[c.bib] || "No";
          const status = savedStatus[c.bib] || "idle";

          const originalIndex = activeHeat ? activeHeat.competitorBibs.indexOf(c.bib) : -1;
          const isSplitActive = originalIndex !== -1 && (activeHeat?.splits || []).includes(originalIndex);
          let nextHeatNum = 1;
          if (isSplitActive && activeHeat) {
            const sameRoleBibs = activeHeat.competitorBibs.filter(bib => {
              const comp = competitors.find(comp => comp.bib === bib);
              return (comp?.role || "Lead") === (c.role || "Lead");
            });
            const splitsForSameRole = (activeHeat.splits || []).filter(s => {
              const splitBib = activeHeat.competitorBibs[s];
              const splitComp = competitors.find(comp => comp.bib === splitBib);
              return (splitComp?.role || "Lead") === (c.role || "Lead");
            });
            const sameRoleSplitsBefore = splitsForSameRole.filter(s => s <= originalIndex).length;
            nextHeatNum = sameRoleSplitsBefore + 1;
          }

          if (judgingStyle === "raw") {
            const isTied = tiedBibs.has(c.bib);
            // Raw Score Format
            return (
              <React.Fragment key={c.bib}>
                <div
                  className={`p-5 rounded-2xl border transition-all relative ${
                    isTied
                      ? isDarkMode
                        ? "bg-amber-950/20 border-amber-500 text-slate-100 shadow-md ring-1 ring-amber-500/30"
                        : "bg-amber-50/50 border-amber-500 text-slate-800 shadow-md ring-1 ring-amber-500/20"
                      : isDarkMode
                        ? "bg-slate-900 border-slate-800 text-slate-100"
                        : "bg-white border-slate-200 text-slate-800 shadow-sm"
                  }`}
                >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Bib No. & Name */}
                  <div className="flex items-center gap-3 min-w-[200px]">
                    <div className="w-10 h-10 rounded-xl bg-violet-600/10 text-violet-500 font-mono font-bold flex items-center justify-center text-sm border border-violet-500/10 shadow-inner">
                      #{c.bib}
                    </div>
                    <div>
                      <h3 className="font-bold text-sm tracking-tight">{c.name}</h3>
                      <p className="text-[10px] text-slate-400 font-mono">
                        {c.division} • {c.role}s
                      </p>
                    </div>
                  </div>

                  {/* 0-100 slider, minus button, raw score, + button */}
                  <div className="flex-1 flex items-center gap-3 max-w-md">
                    {/* Minus button */}
                    <button
                      onClick={() => decreaseScore(c.bib, score > 0 ? score : 75.0)}
                      className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 font-mono font-bold text-sm flex items-center justify-center transition-all border border-slate-200 dark:border-slate-700"
                      title="Decrease score by 0.25"
                    >
                      -
                    </button>

                    {/* Slider */}
                    <div className="flex-1 flex flex-col">
                      <input
                        id={`score-slider-${c.bib}`}
                        type="range"
                        min="0"
                        max="100"
                        step="0.25"
                        value={score > 0 ? score : 75.0}
                        onChange={(e) => handleScoreChange(c.bib, parseFloat(e.target.value))}
                        className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-violet-600 bg-slate-200 dark:bg-slate-700 transition-opacity ${score > 0 ? "opacity-100" : "opacity-40"}`}
                      />
                      <div className="flex justify-between text-[9px] text-slate-400 font-mono mt-1">
                        <span>0</span>
                        <span>50</span>
                        <span>100</span>
                      </div>
                    </div>

                    {/* Plus button */}
                    <button
                      onClick={() => increaseScore(c.bib, score > 0 ? score : 75.0)}
                      className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 font-mono font-bold text-sm flex items-center justify-center transition-all border border-slate-200 dark:border-slate-700"
                      title="Increase score by 0.25"
                    >
                      +
                    </button>

                    {/* Raw score display */}
                    <div className="min-w-[65px] text-center">
                      <span className={`text-xs font-mono font-bold px-2.5 py-1 rounded border ${
                        score > 0 
                          ? "text-violet-500 bg-violet-600/10 border-violet-500/15" 
                          : "text-slate-400 bg-slate-500/10 border-slate-500/15"
                      }`}>
                        {score > 0 ? score.toFixed(2) : "—"}
                      </span>
                    </div>
                  </div>

                  {/* Yes/No/Alt status placement */}
                  <div className="flex items-center gap-4">
                    {/* Computed placement rank */}
                    <div className="text-left sm:text-right min-w-[95px]">
                      <span className="block text-[9px] font-semibold text-slate-400 font-mono uppercase tracking-wider mb-1">Judge Placement</span>
                      <span className={`text-xs font-mono font-bold px-2.5 py-1 rounded border ${
                        getRawRankStatus(c.bib) === "Yes" ? "text-green-500 bg-green-500/10 border-green-500/15" :
                        getRawRankStatus(c.bib).startsWith("Alt") ? "text-amber-500 bg-amber-500/10 border-amber-500/15" :
                        "text-slate-400 bg-slate-500/10 border-slate-500/15"
                      }`}>
                        {getRawRankStatus(c.bib)}
                      </span>
                    </div>

                    {/* Save indicator */}
                    <div className="flex items-center justify-end min-w-[20px]">
                      {status === "saving" && (
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                      )}
                      {status === "saved" && (
                        <Check className="w-4 h-4 text-green-500" />
                      )}
                      {status === "error" && (
                        <span className="text-[9px] text-rose-500 font-mono font-bold">Err</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              {isSplitActive && (
                <div className="my-4 py-2.5 px-6 rounded-2xl bg-violet-600/5 dark:bg-violet-600/15 border border-dashed border-violet-500/30 text-center font-mono text-xs uppercase tracking-widest text-violet-500 font-bold flex flex-col items-center justify-center gap-1.5 print:break-before-page">
                  <div className="h-3 w-px bg-violet-500/30 mb-0.5" />
                  <span>GAP: HEAT {nextHeatNum} STARTING HERE</span>
                  <div className="h-3 w-px bg-violet-500/30 mt-0.5" />
                </div>
              )}
            </React.Fragment>
            );
          }

          if (judgingStyle === "callback") {
            // Callback Format
            return (
              <React.Fragment key={c.bib}>
                <div
                  className={`p-5 rounded-2xl border transition-all relative ${
                    isDarkMode
                      ? "bg-slate-900 border-slate-800 text-slate-100"
                      : "bg-white border-slate-200 text-slate-800 shadow-sm"
                  }`}
                >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  {/* Bib No. & Name */}
                  <div className="flex items-center gap-3 min-w-[200px]">
                    <div className="w-10 h-10 rounded-xl bg-violet-600/10 text-violet-500 font-mono font-bold flex items-center justify-center text-sm border border-violet-500/10 shadow-inner">
                      #{c.bib}
                    </div>
                    <div>
                      <h3 className="font-bold text-sm tracking-tight">{c.name}</h3>
                      <p className="text-[10px] text-slate-400 font-mono">
                        {c.division} • {c.role}s
                      </p>
                    </div>
                  </div>

                  {/* Yes/No/Alt 1, Alt 2, Alt 3 select dropdown */}
                  <div className="min-w-[140px]">
                    <span className="block text-[9px] font-semibold text-slate-400 font-mono uppercase tracking-wider mb-1">Callback Selection</span>
                    <select
                      value={callbackVal}
                      onChange={(e) => handleCallbackChange(c.bib, e.target.value as CallbackValue)}
                      className={`text-xs px-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-violet-500 font-mono w-full ${
                        isDarkMode
                          ? "bg-slate-800 border-slate-700 text-slate-100"
                          : "bg-slate-50 border-slate-200 text-slate-800"
                      }`}
                    >
                      <option value="No">No (Unselected)</option>
                      <option value="Yes">Yes (Callback)</option>
                      {targetAlternateCount >= 1 && <option value="Alt 1">Alt 1 (Alternate 1)</option>}
                      {targetAlternateCount >= 2 && <option value="Alt 2">Alt 2 (Alternate 2)</option>}
                      {targetAlternateCount >= 3 && <option value="Alt 3">Alt 3 (Alternate 3)</option>}
                    </select>
                  </div>

                  {/* placement based off other competitors scored */}
                  <div className="flex items-center gap-4">
                    <div className="text-left md:text-right min-w-[110px]">
                      <span className="block text-[9px] font-semibold text-slate-400 font-mono uppercase tracking-wider mb-1">Callback Rank</span>
                      <span className="text-xs font-mono font-bold text-emerald-500 bg-emerald-500/10 px-2.5 py-1 rounded border border-emerald-500/15">
                        {getCallbackPlacement(c.bib)}
                      </span>
                    </div>

                    {/* Save indicator */}
                    <div className="flex items-center justify-end min-w-[20px]">
                      {status === "saving" && (
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                      )}
                      {status === "saved" && (
                        <Check className="w-4 h-4 text-green-500" />
                      )}
                      {status === "error" && (
                        <span className="text-[9px] text-rose-500 font-mono font-bold">Err</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              {isSplitActive && (
                <div className="my-4 py-2.5 px-6 rounded-2xl bg-violet-600/5 dark:bg-violet-600/15 border border-dashed border-violet-500/30 text-center font-mono text-xs uppercase tracking-widest text-violet-500 font-bold flex flex-col items-center justify-center gap-1.5 print:break-before-page">
                  <div className="h-3 w-px bg-violet-500/30 mb-0.5" />
                  <span>GAP: HEAT {nextHeatNum} STARTING HERE</span>
                  <div className="h-3 w-px bg-violet-500/30 mt-0.5" />
                </div>
              )}
            </React.Fragment>
            );
          }

          if (judgingStyle === "placement") {
            // Placement (Finals) format
            const [leadBib, followBib] = c.bib.includes("_") ? c.bib.split("_") : [c.bib, ""];
            const lead = competitors.find((comp) => comp.bib === leadBib);
            const follow = competitors.find((comp) => comp.bib === followBib);
            const leadName = lead ? lead.name : `Lead #${leadBib}`;
            const followName = follow ? follow.name : (followBib ? `Follow #${followBib}` : "—");
            const rawScoreStr = localRawScores[c.bib] || "";
            const isTied = tiedBibs.has(c.bib);

            return (
              <React.Fragment key={c.bib}>
                <div
                  className={`p-5 rounded-2xl border transition-all relative ${
                    isTied
                      ? isDarkMode
                        ? "bg-amber-950/20 border-amber-500 text-slate-100 shadow-md ring-1 ring-amber-500/30"
                        : "bg-amber-50/50 border-amber-500 text-slate-800 shadow-md ring-1 ring-amber-500/20"
                      : isDarkMode
                        ? "bg-slate-900 border-slate-800 text-slate-100"
                        : "bg-white border-slate-200 text-slate-800 shadow-sm"
                  }`}
                >
                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                  {/* Leaders Bib No., Leaders Name, Followers Bib No., Followers Name */}
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Leader info */}
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-emerald-600/10 text-emerald-500 font-mono font-bold flex items-center justify-center text-xs border border-emerald-500/10 shadow-inner">
                        L#{leadBib}
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-400 font-mono uppercase tracking-wider block">Leader</span>
                        <h4 className="font-bold text-sm tracking-tight">{leadName}</h4>
                      </div>
                    </div>

                    {/* Follower info */}
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-rose-600/10 text-rose-500 font-mono font-bold flex items-center justify-center text-xs border border-rose-500/10 shadow-inner">
                        F#{followBib || "—"}
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-400 font-mono uppercase tracking-wider block">Follower</span>
                        <h4 className="font-bold text-sm tracking-tight">{followName}</h4>
                      </div>
                    </div>
                  </div>

                  {/* text field for entering raw score and dropdown for selecting placement */}
                  <div className="flex flex-wrap items-center gap-4">
                    {/* Raw score text field */}
                    <div className="min-w-[110px]">
                      <label className="block text-[9px] font-semibold text-slate-400 font-mono uppercase tracking-wider mb-1">Raw Score</label>
                      <input
                        type="text"
                        placeholder="e.g. 85.50"
                        value={rawScoreStr}
                        onChange={(e) => handleRawScoreChangeLocal(c.bib, e.target.value)}
                        className={`text-xs px-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-violet-500 font-mono w-full ${
                          isDarkMode
                            ? "bg-slate-800 border-slate-700 text-slate-100 placeholder-slate-500"
                            : "bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400"
                        }`}
                      />
                    </div>

                    {/* Dropdown for selecting placement */}
                    <div className="min-w-[130px]">
                      <label className="block text-[9px] font-semibold text-slate-400 font-mono uppercase tracking-wider mb-1">Final Placement</label>
                      <select
                        value={score}
                        onChange={(e) => handlePlacementDropdownChange(c.bib, Number(e.target.value))}
                        className={`text-xs px-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-violet-500 font-mono w-full ${
                          isDarkMode
                            ? "bg-slate-800 border-slate-700 text-slate-100"
                            : "bg-slate-50 border-slate-200 text-slate-800"
                        }`}
                      >
                        <option value="0">Unranked</option>
                        {heatCompetitors.map((_, i) => (
                          <option key={i + 1} value={i + 1}>
                            Rank {i + 1} {i === 0 ? "🏆" : ""}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Save indicator */}
                    <div className="flex items-center justify-end min-w-[20px] pt-4 xl:pt-0">
                      {status === "saving" && (
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                      )}
                      {status === "saved" && (
                        <Check className="w-4 h-4 text-green-500" />
                      )}
                      {status === "error" && (
                        <span className="text-[9px] text-rose-500 font-mono font-bold">Err</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              {isSplitActive && (
                <div className="my-4 py-2.5 px-6 rounded-2xl bg-violet-600/5 dark:bg-violet-600/15 border border-dashed border-violet-500/30 text-center font-mono text-xs uppercase tracking-widest text-violet-500 font-bold flex flex-col items-center justify-center gap-1.5 print:break-before-page">
                  <div className="h-3 w-px bg-violet-500/30 mb-0.5" />
                  <span>GAP: HEAT {nextHeatNum} STARTING HERE</span>
                  <div className="h-3 w-px bg-violet-500/30 mt-0.5" />
                </div>
              )}
            </React.Fragment>
            );
          }

          return null;
        })}
      </div>
    </div>
  );
}
