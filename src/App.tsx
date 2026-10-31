import React, { useState, useEffect } from "react";
import { Award, RefreshCw, Moon, Sun, AlertCircle, ArrowLeft, Globe, ShieldAlert, UserCheck, Users, Landmark } from "lucide-react";
import Header from "./components/Header";
import RegisterCompetitor from "./components/RegisterCompetitor";
import CoordinatorCheckIn from "./components/CoordinatorCheckIn";
import JudgePortal from "./components/JudgePortal";
import AdminPanel from "./components/AdminPanel";
import ResultsDashboard from "./components/ResultsDashboard";
import ScoringDashboard from "./components/ScoringDashboard";
import PlatformPortal from "./components/PlatformPortal";
import RoleLogin from "./components/RoleLogin";
import GatewayConnect from "./components/GatewayConnect";
import GatewaySettings from "./components/GatewaySettings";
import { doc, setDoc, waitForPendingWrites, writeBatch } from "firebase/firestore";
import { db } from "./firebase";
import { canReadAllScores, useCommunityState } from "./hooks/useCommunityState";
import { useGatewaySession } from "./hooks/useGatewaySession";
import { AppSettings, Competitor, ViewRole, CallbackValue, ContestEntryFields, ScoreRecord, StaffRole } from "./types";
import { apiRequest } from "./utils/api";
import { getScoreDocId, toDocId } from "./utils/ids";
import { isCouplesHeat, projectCompetitorsForHeat } from "./utils/partners";

export default function App() {
  // Navigation & Preferences (Dynamically detected via URL slug, query string, or subdomains)
  const [currentRole, setCurrentRole] = useState<ViewRole | "portal">("portal");
  const [selectedJudgeId, setSelectedJudgeIdState] = useState<string>(() => {
    try {
      return localStorage.getItem("swingscore_judge_claim") || "";
    } catch {
      return "";
    }
  });
  // Remember which judge name THIS browser has claimed, so a refresh doesn't
  // bounce a judge back to the picker screen mid-heat. The Log Out button in
  // JudgePortal releases the claim server-side (removes it from
  // settings.claimedJudges) and then calls this with "" -- at that point we
  // clear the local marker too, so a stale match here can't make a name someone
  // else has since claimed look like it's still this browser's.
  const setSelectedJudgeId = (id: string) => {
    setSelectedJudgeIdState(id);
    try {
      if (id) {
        localStorage.setItem("swingscore_judge_claim", id);
      } else {
        localStorage.removeItem("swingscore_judge_claim");
      }
    } catch {
      // ignore storage errors (private browsing, etc.)
    }
  };
  const [isDarkMode, setIsDarkMode] = useState<boolean>(true);
  const [actionError, setActionError] = useState("");

  // Parse the current virtual environment at mount time
  useEffect(() => {
    const detectRole = (): ViewRole | "portal" => {
      const hostname = window.location.hostname.toLowerCase();
      const pathname = window.location.pathname.toLowerCase();
      const searchParams = new URLSearchParams(window.location.search);
      const queryRole = searchParams.get("role")?.toLowerCase() || searchParams.get("slug")?.toLowerCase();
      const hash = window.location.hash.toLowerCase();

      // 1. Subdomain detection
      if (hostname.startsWith("admin.")) return "admin";
      if (hostname.startsWith("judge.")) return "judge";
      if (hostname.startsWith("registration.") || hostname.startsWith("register.")) return "competitor";
      if (hostname.startsWith("floorcord.") || hostname.startsWith("coordinator.") || hostname.startsWith("checkin.")) return "coordinator";
      if (hostname.startsWith("results.")) return "results";
      if (hostname.startsWith("scoring.")) return "scoring";

      // 2. Query parameter or testing slugs
      if (queryRole === "admin") return "admin";
      if (queryRole === "judge") return "judge";
      if (queryRole === "registration" || queryRole === "competitor" || queryRole === "register") return "competitor";
      if (queryRole === "floorcord" || queryRole === "coordinator" || queryRole === "checkin") return "coordinator";
      if (queryRole === "results") return "results";
      if (queryRole === "scoring") return "scoring";

      // 3. Pathname check-in
      if (pathname.includes("/admin")) return "admin";
      if (pathname.includes("/judge")) return "judge";
      if (pathname.includes("/registration") || pathname.includes("/competitor") || pathname.includes("/register")) return "competitor";
      if (pathname.includes("/floorcord") || pathname.includes("/coordinator") || pathname.includes("/checkin") || pathname.includes("/check-in")) return "coordinator";
      if (pathname.includes("/results")) return "results";
      if (pathname.includes("/scoring")) return "scoring";

      // 4. Hash fallback
      if (hash.includes("admin")) return "admin";
      if (hash.includes("judge")) return "judge";
      if (hash.includes("registration") || hash.includes("competitor") || hash.includes("register")) return "competitor";
      if (hash.includes("floorcord") || hash.includes("coordinator") || hash.includes("checkin")) return "coordinator";
      if (hash.includes("results")) return "results";
      if (hash.includes("scoring")) return "scoring";

      return "portal";
    };

    setCurrentRole(detectRole());
  }, []);

  // This device's gateway connection and its community's live data
  const { session, isReady, connect, loginRole, logoutRole, applyToken, leaveGateway } = useGatewaySession();
  const { communityName, competitors, heats, scores, settings, error, isOffline, hasUnsyncedScores, loading } = useCommunityState(session);

  // Results and the portal page only need the gateway code.
  const isOpenPortal = currentRole === "portal" || currentRole === "results";
  const isAuthenticated = isOpenPortal || !!session?.roles.includes(currentRole as StaffRole);
  const myClaimedJudge = session?.judgeName || "";

  // Live data arrives by itself, so the portals' refresh buttons have nothing to do.
  const refreshState = async () => {};

  // If the currently selected judge profile becomes disabled (role set to "None"), send
  // the judge back to the picker: scores can only be saved under a name they've claimed.
  // Guarded on !loading: settings starts out as a hardcoded placeholder (no judgeNames/
  // judgeRoles/chiefJudgeRole at all) until the first live data arrives. Without this
  // guard, this effect ran against that placeholder immediately after a judge picked their
  // profile, saw every role fall back to "None", and force-switched them away from their
  // profile before the real settings ever loaded -- while the judge's own name stayed marked
  // claimed/locked from the picker's own claim update. That is why logging a judge out and
  // picking them back in from the picker appeared to log into a different profile and
  // re-lock the one that was just freed.
  useEffect(() => {
    if (loading) return;
    if (!selectedJudgeId) return;

    const defaultNames = ["Judge A", "Judge B", "Judge C", "Judge D", "Judge E"];
    const defaultRoles = ["None", "None", "None", "None", "None"];
    const names = settings.judgeNames || defaultNames;
    const roles = settings.judgeRoles || defaultRoles;
    const chiefName = settings.chiefJudgeName || "Chief Judge";
    const chiefRole = settings.chiefJudgeRole || "Both";

    const idx = names.indexOf(selectedJudgeId);
    const isDisabled = idx !== -1 ? roles[idx] === "None" : selectedJudgeId === chiefName && chiefRole === "None";
    if (isDisabled) setSelectedJudgeId("");
  }, [settings, selectedJudgeId, loading]);

  // Actions
  const handleRegisterCompetitor = async (competitor: { bib: string; name: string; email: string; division: string; role: "Lead" | "Follow" } & ContestEntryFields) => {
    await apiRequest("/api/register", competitor);
  };

  const handleAddSampleDancers = async (division: string) => {
    await apiRequest("/api/register/samples", { division });
  };

  // Check-in and scratch apply to one contest (heat); registry points are global.
  const handleCheckInToggle = async (bib: string, heatId: string, checkedIn: boolean, scratched?: boolean, registryPoints?: number) => {
    await apiRequest("/api/check-in", { bib, heatId, checkedIn, scratched, registryPoints });
  };

  const handleAssignPartner = async (heatId: string, bib: string, partnerBib: string) => {
    await apiRequest("/api/heats/assign-partner", { heatId, bib, partnerBib });
  };

  const handleUpdateCompetitor = async (
    oldBib: string,
    updates: { bib: string; name: string; email?: string; division: string; role: "Lead" | "Follow"; checkedIn?: boolean; scratched?: boolean; heatId?: string } & ContestEntryFields
  ) => {
    await apiRequest("/api/competitor/update", { oldBib, newBib: updates.bib, ...updates });
  };

  const handleCreateHeat = async (
    heatData: { name: string; division: string; role: "Lead" | "Follow" | "Mixed"; competitorBibs: string[]; couples?: { id: string; leadBib: string; followBib: string }[]; unpairedBibs?: string[]; finalistBibs?: string[]; heatType?: "Prelim" | "Semi-Final" | "Quarter Final" | "Finals"; contestType?: "Jack & Jill" | "Strictly Swing" | "Routine" },
    target: "live" | "next" = "live"
  ) => {
    const data = await apiRequest("/api/heats/create", { ...heatData, target });
    if (target === "next") {
      await handleUpdateSettings({ queuedHeatId: data.heat.id, queuedCheckInFinalized: false });
    } else {
      await handleUpdateSettings({ currentHeatId: data.heat.id });
    }
  };

  const handleDeleteHeat = async (heatId: string) => {
    await apiRequest("/api/heats/delete", { heatId });
  };

  const handleUpdateHeat = async (heatId: string, updates: { name?: string; division?: string; role?: "Lead" | "Follow" | "Mixed"; competitorBibs?: string[]; couples?: any[]; isCustom?: boolean; splits?: number[]; heatType?: "Prelim" | "Semi-Final" | "Quarter Final" | "Finals"; contestType?: "Jack & Jill" | "Strictly Swing" | "Routine" }) => {
    await apiRequest("/api/heats/update", { heatId, ...updates });
  };

  const handleUpdateSettings = async (newSettings: Partial<AppSettings>) => {
    await apiRequest("/api/settings", newSettings);
  };

  const handleClaimJudge = async (name: string) => {
    const { token } = await apiRequest("/api/judge/claim", { name });
    await applyToken(token);
  };

  const handleReleaseJudge = async (name: string) => {
    const { token } = await apiRequest("/api/judge/release", { name });
    await applyToken(token);
  };

  // The sheet's scores must reach the server first, or it would refuse the sheet.
  const handleFinalizeSheet = async (key: string, name: string) => {
    await waitForPendingWrites(db);
    await apiRequest("/api/judge/finalize", { key, name });
  };

  const scoreDoc = (heatId: string, id: string) =>
    doc(db, `communities/${session!.communityId}/heats/${toDocId(heatId)}/scores/${id}`);

  // Scores go straight to Firestore so they survive a Wi-Fi drop. Firestore only
  // finishes this write once the server has it, which offline could be minutes
  // away, so the sheet doesn't wait: the device's copy updates immediately.
  const handleSaveScore = async (scoreData: {
    judgeId: string;
    heatId: string;
    competitorBib: string;
    score: number;
    isCallback: CallbackValue;
  }) => {
    const id = getScoreDocId(scoreData.judgeId, scoreData.competitorBib);
    const record: ScoreRecord = { ...scoreData, id, timestamp: Date.now() };
    setDoc(scoreDoc(scoreData.heatId, id), record).catch((err) => {
      console.error("A score was rejected", err);
      setActionError(`A score for bib ${scoreData.competitorBib} couldn't be saved. Please log out and choose your judge profile again.`);
    });
  };

  // Automated Mock Score Simulator based on Judging Configuration
  const handleSimulateScores = async (heatId: string) => {
    const heat = heats.find((h) => h.id === heatId);
    if (!heat) return;
    // Dancers as this heat sees them (their entry for its contest+division).
    const heatCompetitors = projectCompetitorsForHeat(competitors, heat);

    const defaultNames = ["Judge A", "Judge B", "Judge C", "Judge D", "Judge E"];
    const defaultRoles = ["None", "None", "None", "None", "None"];
    const names = settings.judgeNames || defaultNames;
    const roles = settings.judgeRoles || defaultRoles;
    const chiefName = settings.chiefJudgeName || "Chief Judge";
    const chiefRole = settings.chiefJudgeRole || "Both";

    const simulatedJudges: string[] = [];

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
        simulatedJudges.push(name);
      }
    });

    if (isRoleExpected(chiefRole)) {
      simulatedJudges.push(chiefName);
    }

    for (const judge of simulatedJudges) {
      let judgeRole: "Leaders" | "Followers" | "Finals" | "Both" | "None" = "None";
      if (judge === chiefName) {
        judgeRole = chiefRole;
      } else {
        const idx = names.indexOf(judge);
        if (idx !== -1) {
          judgeRole = roles[idx] as any;
        }
      }

      const isHeatFinals = isCouplesHeat(heat);
      const rawHeatCompetitors = heat.competitorBibs
        .map((bib) => {
          const comp = heatCompetitors.find((c) => c.bib === bib);
          if (comp) return comp;

          if (bib.includes("_")) {
            const [leadBib, followBib] = bib.split("_");
            if (isHeatFinals || judgeRole === "Both") {
              const lead = heatCompetitors.find((c) => c.bib === leadBib);
              const follow = heatCompetitors.find((c) => c.bib === followBib);
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
              return heatCompetitors.find((c) => c.bib === leadBib);
            } else if (judgeRole === "Followers") {
              return heatCompetitors.find((c) => c.bib === followBib);
            } else {
              const lead = heatCompetitors.find((c) => c.bib === leadBib);
              const follow = heatCompetitors.find((c) => c.bib === followBib);
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

      const judgeExpectedCompetitors = rawHeatCompetitors.filter((c) => {
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

      const judgeExpectedBibs = judgeExpectedCompetitors.map(c => c.bib);
      if (judgeExpectedBibs.length === 0) continue;

      const simulatedData = [];

      if (settings.judgingStyle === "placement") {
        // Must assign sequential non-duplicate ranks 1 to N
        // Shuffle competitor bibs first
        const shuffledBibs = [...judgeExpectedBibs].sort(() => Math.random() - 0.5);
        shuffledBibs.forEach((bib, index) => {
          const rank = index + 1;
          const altType = Math.random() < 0.33 ? "Alt 1" : (Math.random() < 0.5 ? "Alt 2" : "Alt 3");
          const isCallback: CallbackValue = Math.random() < 0.4 ? "Yes" : (Math.random() < 0.65 ? altType : "No");
          simulatedData.push({ competitorBib: bib, score: rank, isCallback });
        });
      } else {
        // Raw Mode: random integer scores between 65 and 98
        judgeExpectedBibs.forEach((bib) => {
          const score = Math.floor(Math.random() * 34) + 65; // 65 to 98
          const altType = Math.random() < 0.33 ? "Alt 1" : (Math.random() < 0.5 ? "Alt 2" : "Alt 3");
          const isCallback: CallbackValue = Math.random() < 0.4 ? "Yes" : (Math.random() < 0.65 ? altType : "No");
          simulatedData.push({ competitorBib: bib, score, isCallback });
        });
      }

      const batch = writeBatch(db);
      simulatedData.forEach(({ competitorBib, score, isCallback }) => {
        const id = getScoreDocId(judge, competitorBib);
        batch.set(scoreDoc(heatId, id), { id, judgeId: judge, heatId, competitorBib, score, isCallback, timestamp: Date.now() });
      });
      await batch.commit();
    }
  };

  const handleResetDatabase = async () => {
    await apiRequest("/api/reset");
    // The server already clears settings.claimedJudges on reset, freeing every
    // judge name up for anyone to pick -- but THIS browser's own remembered
    // claim (swingscore_judge_claim) survives a server reset on its own, and
    // would otherwise silently resume the old judge identity next time this
    // browser opens the Judge domain. Clear it here too so a reset always
    // means every judge picks fresh.
    setSelectedJudgeId("");
  };

  const handleClearAllDatabase = async () => {
    await apiRequest("/api/clear-all");
    setSelectedJudgeId("");
  };

  const isTestingEnv = !window.location.hostname.includes("swingscore.com");

  return (
    <div className={isDarkMode ? "dark" : ""}>
      <div className={`min-h-screen transition-colors duration-300 flex flex-col ${
        isDarkMode ? "bg-slate-950 text-slate-100" : "bg-slate-50 text-slate-800"
      }`}>
        {/* Navigation Header */}
        <Header
          currentRole={currentRole}
          selectedJudgeId={selectedJudgeId}
          setSelectedJudgeId={setSelectedJudgeId}
          isDarkMode={isDarkMode}
          setIsDarkMode={setIsDarkMode}
          settings={settings}
          communityName={communityName}
        />

        {/* Global Lost Connection / Loading banners */}
        {session && isOffline && (
          <div id="offline-banner" className="bg-amber-600 text-white text-xs py-2 px-4 flex items-center justify-center gap-2 font-mono text-center">
            <AlertCircle className="w-4 h-4 animate-bounce flex-shrink-0" />
            <span>Reconnecting. Judges' scores stay on this device and sync automatically. Other changes need a connection.</span>
          </div>
        )}
        {!isOffline && currentRole === "judge" && hasUnsyncedScores && (
          <div id="unsynced-scores-banner" className="bg-violet-600 text-white text-xs py-2 px-4 flex items-center justify-center gap-2 font-mono">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            <span>Syncing scores...</span>
          </div>
        )}
        {(error || actionError) && (
          <div className="bg-amber-600 text-white text-xs py-2 px-4 flex items-center justify-center gap-2 font-mono">
            <AlertCircle className="w-4 h-4 animate-bounce" />
            <span>{actionError || error}</span>
          </div>
        )}

        {/* Core Layout Stage */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-8">
          {/* Quick simulation exit button for sandbox test environments */}
          {currentRole !== "portal" && isTestingEnv && (
            <div className="mb-6 flex justify-start">
              <button
                onClick={async () => {
                  // Staff portals sign out on the way back to the directory
                  if (session?.roles.includes(currentRole as StaffRole)) {
                    await logoutRole(currentRole as StaffRole).catch(() => {});
                  }
                  window.location.search = "?role=portal";
                }}
                className={`group flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border transition-all ${
                  isDarkMode
                    ? "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                    : "bg-white border-slate-200 text-slate-500 hover:text-slate-800 hover:border-slate-300 shadow-sm"
                }`}
              >
                <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" />
                Return to Portal Directory
              </button>
            </div>
          )}

          {!isReady ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <RefreshCw className="w-8 h-8 text-violet-500 animate-spin" />
            </div>
          ) : !session ? (
            <GatewayConnect isDarkMode={isDarkMode} onConnect={connect} />
          ) : loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <RefreshCw className="w-8 h-8 text-violet-500 animate-spin" />
              <p className="text-xs text-slate-400 font-mono">Loading WCS database state...</p>
            </div>
          ) : !isAuthenticated ? (
            // Render the lock screen if the user has navigated to a protected domain slug and is unauthenticated
            <RoleLogin
              role={currentRole as StaffRole}
              isDarkMode={isDarkMode}
              onLogin={async (passcode) => {
                await loginRole(currentRole as StaffRole, passcode);
                // Entering a passcode to get into the Judge domain means this
                // browser wasn't already recognized (a fresh device, a cleared
                // session, or someone new sitting down at this station) -- so
                // never let it silently resume whichever judge name it may have
                // claimed in a past session. Clear the local claim so the judge
                // picker always shows and they choose explicitly.
                if (currentRole === "judge") {
                  setSelectedJudgeId("");
                }
              }}
            />
          ) : (
            <div className="transition-all duration-300">
              {currentRole === "portal" && (
                <PlatformPortal
                  isDarkMode={isDarkMode}
                  settings={settings}
                  competitors={competitors}
                  heats={heats}
                  scores={scores}
                  canReadAllScores={canReadAllScores(session)}
                  communityName={communityName}
                />
              )}

              {currentRole === "results" && (
                <ResultsDashboard
                  competitors={competitors}
                  heats={heats}
                  scores={scores}
                  settings={settings}
                  isDarkMode={isDarkMode}
                  onRefresh={refreshState}
                  canPreviewDrafts={!!session?.roles.some((role) => role === "admin" || role === "scoring")}
                />
              )}

              {currentRole === "scoring" && (
                <ScoringDashboard
                  settings={settings}
                  competitors={competitors}
                  heats={heats}
                  scores={scores}
                  isDarkMode={isDarkMode}
                  onRefresh={refreshState}
                  onUpdateSettings={handleUpdateSettings}
                />
              )}

              {currentRole === "competitor" && (
                <RegisterCompetitor
                  competitors={competitors}
                  onRegister={handleRegisterCompetitor}
                  onAddSampleDancers={handleAddSampleDancers}
                  onUpdateCompetitor={handleUpdateCompetitor}
                  isDarkMode={isDarkMode}
                  settings={settings}
                />
              )}

              {currentRole === "coordinator" && (
                <CoordinatorCheckIn
                  competitors={competitors}
                  heats={heats}
                  onCheckInToggle={handleCheckInToggle}
                  onAssignPartner={handleAssignPartner}
                  isDarkMode={isDarkMode}
                  settings={settings}
                  onUpdateSettings={handleUpdateSettings}
                  onUpdateCompetitor={handleUpdateCompetitor}
                />
              )}

              {currentRole === "judge" && (
                <JudgePortal
                  competitors={competitors}
                  heats={heats}
                  scores={scores}
                  activeHeatId={settings.currentHeatId}
                  judgingStyle={settings.judgingStyle}
                  judgeId={selectedJudgeId}
                  onSaveScore={handleSaveScore}
                  isDarkMode={isDarkMode}
                  onRefresh={refreshState}
                  settings={settings}
                  onSelectJudge={setSelectedJudgeId}
                  onClaimJudge={handleClaimJudge}
                  onReleaseJudge={handleReleaseJudge}
                  onFinalizeSheet={handleFinalizeSheet}
                  myClaimedJudge={myClaimedJudge}
                />
              )}

              {currentRole === "admin" && (
                <GatewaySettings
                  isDarkMode={isDarkMode}
                  communityName={communityName}
                  settings={settings}
                  onUpdateSettings={handleUpdateSettings}
                  onApplyToken={applyToken}
                />
              )}

              {currentRole === "admin" && (
                <AdminPanel
                  competitors={competitors}
                  heats={heats}
                  scores={scores}
                  settings={settings}
                  onUpdateSettings={handleUpdateSettings}
                  onCreateHeat={handleCreateHeat}
                  onDeleteHeat={handleDeleteHeat}
                  onUpdateHeat={handleUpdateHeat}
                  onSimulateScores={handleSimulateScores}
                  onResetDatabase={handleResetDatabase}
                  onClearAllDatabase={handleClearAllDatabase}
                  onSaveScore={handleSaveScore}
                  isDarkMode={isDarkMode}
                  onUpdateCompetitor={handleUpdateCompetitor}
                />
              )}
            </div>
          )}
        </main>

        {/* Footer */}
        <footer className={`py-6 border-t text-center text-[10px] font-mono ${
          isDarkMode ? "bg-slate-900/50 border-slate-900 text-slate-500" : "bg-white border-slate-200 text-slate-400"
        }`}>
          <div>WCS Real-Time Scoring Engine</div>
          <div className="mt-1 opacity-75">Designed with Desktop precision and Mobile optimized tactile controls</div>
          {session && (
            <button
              type="button"
              id="leave-gateway-btn"
              onClick={() => {
                if (window.confirm("Disconnect this device from the gateway? You'll need the gateway code to reconnect.")) {
                  leaveGateway();
                }
              }}
              className="mt-2 underline hover:text-slate-300 cursor-pointer"
            >
              Leave this gateway
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
