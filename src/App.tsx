import React, { useState, useEffect, useCallback } from "react";
import { Award, RefreshCw, Moon, Sun, AlertCircle, ArrowLeft, Globe, ShieldAlert, UserCheck, Users, Landmark } from "lucide-react";
import Header from "./components/Header";
import RegisterCompetitor from "./components/RegisterCompetitor";
import CoordinatorCheckIn from "./components/CoordinatorCheckIn";
import JudgePortal from "./components/JudgePortal";
import AdminPanel from "./components/AdminPanel";
import ResultsDashboard from "./components/ResultsDashboard";
import PlatformPortal from "./components/PlatformPortal";
import RoleLogin from "./components/RoleLogin";
import { Competitor, Heat, ScoreRecord, AppSettings, ViewRole, CallbackValue } from "./types";

export default function App() {
  // Navigation & Preferences (Dynamically detected via URL slug, query string, or subdomains)
  const [currentRole, setCurrentRole] = useState<ViewRole | "portal">("portal");
  const [selectedJudgeId, setSelectedJudgeId] = useState<string>("");
  const [isDarkMode, setIsDarkMode] = useState<boolean>(true);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

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

      // 2. Query parameter or testing slugs
      if (queryRole === "admin") return "admin";
      if (queryRole === "judge") return "judge";
      if (queryRole === "registration" || queryRole === "competitor" || queryRole === "register") return "competitor";
      if (queryRole === "floorcord" || queryRole === "coordinator" || queryRole === "checkin") return "coordinator";
      if (queryRole === "results") return "results";

      // 3. Pathname check-in
      if (pathname.includes("/admin")) return "admin";
      if (pathname.includes("/judge")) return "judge";
      if (pathname.includes("/registration") || pathname.includes("/competitor") || pathname.includes("/register")) return "competitor";
      if (pathname.includes("/floorcord") || pathname.includes("/coordinator") || pathname.includes("/checkin") || pathname.includes("/check-in")) return "coordinator";
      if (pathname.includes("/results")) return "results";

      // 4. Hash fallback
      if (hash.includes("admin")) return "admin";
      if (hash.includes("judge")) return "judge";
      if (hash.includes("registration") || hash.includes("competitor") || hash.includes("register")) return "competitor";
      if (hash.includes("floorcord") || hash.includes("coordinator") || hash.includes("checkin")) return "coordinator";
      if (hash.includes("results")) return "results";

      return "portal";
    };

    const role = detectRole();
    setCurrentRole(role);

    // Results panel and Central portal do not require passcodes
    if (role === "results" || role === "portal") {
      setIsAuthenticated(true);
    } else {
      // Check if session is already authenticated locally
      const storedAuth = localStorage.getItem(`swingscore_auth_${role}`);
      if (storedAuth === "true") {
        setIsAuthenticated(true);
      } else {
        setIsAuthenticated(false);
      }
    }
  }, []);

  // Synced Application State
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [heats, setHeats] = useState<Heat[]>([]);
  const [scores, setScores] = useState<ScoreRecord[]>([]);
  const [settings, setSettings] = useState<AppSettings>({
    currentHeatId: null,
    judgingStyle: "raw",
    callbackCount: 3,
    callbackCountLeaders: 3,
    callbackCountFollowers: 3,
    alternateCountLeaders: 2,
    alternateCountFollowers: 2
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Fetch full state from server
  const fetchState = useCallback(async () => {
    try {
      const res = await fetch("/api/state");
      if (!res.ok) throw new Error("Server failed to respond");
      const data = await res.json();
      setCompetitors(data.competitors || []);
      setHeats(data.heats || []);
      setScores(data.scores || []);
      setSettings(data.settings || { currentHeatId: null, judgingStyle: "raw", callbackCount: 3 });
      setError("");
    } catch (err: any) {
      console.error("Failed to sync application state:", err);
      setError("Lost connection to server scoring database. Retrying...");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch and automatic periodic state polling for real-time synchronization
  useEffect(() => {
    fetchState();
    const interval = setInterval(() => {
      fetchState();
    }, 1500); // Poll every 1.5s for snappy real-time multi-device sync

    return () => clearInterval(interval);
  }, [fetchState]);

  // If the currently selected judge profile becomes disabled (role set to "None"), switch to the first enabled judge profile.
  useEffect(() => {
    if (!selectedJudgeId) return;

    const defaultNames = ["Judge A", "Judge B", "Judge C", "Judge D", "Judge E"];
    const defaultRoles = ["None", "None", "None", "None", "None"];
    const names = settings.judgeNames || defaultNames;
    const roles = settings.judgeRoles || defaultRoles;
    const chiefName = settings.chiefJudgeName || "Chief Judge";
    const chiefRole = settings.chiefJudgeRole || "Both";

    const idx = names.indexOf(selectedJudgeId);
    if (idx !== -1) {
      if (roles[idx] === "None") {
        const firstEnabledIdx = roles.findIndex((r) => r !== "None");
        if (firstEnabledIdx !== -1) {
          setSelectedJudgeId(names[firstEnabledIdx]);
        } else if (chiefRole !== "None") {
          setSelectedJudgeId(chiefName);
        }
      }
    } else if (selectedJudgeId === chiefName && chiefRole === "None") {
      const firstEnabledIdx = roles.findIndex((r) => r !== "None");
      if (firstEnabledIdx !== -1) {
        setSelectedJudgeId(names[firstEnabledIdx]);
      }
    }
  }, [settings, selectedJudgeId]);

  // Actions
  const handleRegisterCompetitor = async (competitor: { bib: string; name: string; division: string; role: "Lead" | "Follow" }) => {
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(competitor)
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Failed to register");
    }
    await fetchState();
  };

  const handleCheckInToggle = async (bib: string, checkedIn: boolean, scratched?: boolean, registryPoints?: number) => {
    const res = await fetch("/api/check-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bib, checkedIn, scratched, registryPoints })
    });
    if (!res.ok) throw new Error("Failed to toggle check-in");
    await fetchState();
  };

  const handleUpdateCompetitor = async (
    oldBib: string,
    updates: { bib: string; name: string; division: string; role: "Lead" | "Follow"; checkedIn?: boolean; scratched?: boolean }
  ) => {
    const res = await fetch("/api/competitor/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oldBib, newBib: updates.bib, ...updates })
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Failed to update competitor");
    }
    await fetchState();
  };

  const handleCreateHeat = async (
    heatData: { name: string; division: string; role: "Lead" | "Follow" | "Mixed"; competitorBibs: string[] },
    target: "live" | "next" = "live"
  ) => {
    const res = await fetch("/api/heats/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...heatData, target })
    });
    if (!res.ok) throw new Error("Failed to create heat");
    const data = await res.json();
    if (data.heat && data.heat.id) {
      if (target === "next") {
        await handleUpdateSettings({ queuedHeatId: data.heat.id });
      } else {
        await handleUpdateSettings({ currentHeatId: data.heat.id });
      }
    } else {
      await fetchState();
    }
  };

  const handleDeleteHeat = async (heatId: string) => {
    const res = await fetch("/api/heats/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ heatId })
    });
    if (!res.ok) throw new Error("Failed to delete heat");
    await fetchState();
  };

  const handleUpdateHeat = async (heatId: string, updates: { name?: string; division?: string; role?: "Lead" | "Follow" | "Mixed"; competitorBibs?: string[]; couples?: any[]; isCustom?: boolean; splits?: number[] }) => {
    const res = await fetch("/api/heats/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ heatId, ...updates })
    });
    if (!res.ok) throw new Error("Failed to update heat");
    await fetchState();
  };

  const handleUpdateSettings = async (newSettings: Partial<AppSettings>) => {
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newSettings)
    });
    if (!res.ok) throw new Error("Failed to update configurations");
    await fetchState();
  };

  const handleSaveScore = async (scoreData: {
    judgeId: string;
    heatId: string;
    competitorBib: string;
    score: number;
    isCallback: CallbackValue;
  }) => {
    const res = await fetch("/api/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(scoreData)
    });
    if (!res.ok) throw new Error("Failed to upload score");
    await fetchState();
  };

  // Automated Mock Score Simulator based on Judging Configuration
  const handleSimulateScores = async (heatId: string) => {
    const heat = heats.find((h) => h.id === heatId);
    if (!heat) return;

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

      const isHeatFinals = heat.heatType === "Finals" || heat.name.includes("Finals");
      const rawHeatCompetitors = heat.competitorBibs
        .map((bib) => {
          const comp = competitors.find((c) => c.bib === bib);
          if (comp) return comp;

          if (bib.includes("_")) {
            const [leadBib, followBib] = bib.split("_");
            const isFinals = heat.heatType === "Finals" || heat.name.includes("Finals");

            if (isFinals || judgeRole === "Both") {
              const lead = competitors.find((c) => c.bib === leadBib);
              const follow = competitors.find((c) => c.bib === followBib);
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
              return competitors.find((c) => c.bib === leadBib);
            } else if (judgeRole === "Followers") {
              return competitors.find((c) => c.bib === followBib);
            } else {
              const lead = competitors.find((c) => c.bib === leadBib);
              const follow = competitors.find((c) => c.bib === followBib);
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

      await fetch("/api/score/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ judgeId: judge, heatId, scores: simulatedData })
      });
    }

    await fetchState();
  };

  const handleResetDatabase = async () => {
    const res = await fetch("/api/reset", { method: "POST" });
    if (!res.ok) throw new Error("Failed to reset database");
    await fetchState();
  };

  const handleClearAllDatabase = async () => {
    const res = await fetch("/api/clear-all", { method: "POST" });
    if (!res.ok) throw new Error("Failed to clear database");
    await fetchState();
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
        />

        {/* Global Lost Connection / Loading banners */}
        {error && (
          <div className="bg-amber-600 text-white text-xs py-2 px-4 flex items-center justify-center gap-2 font-mono">
            <AlertCircle className="w-4 h-4 animate-bounce" />
            <span>{error}</span>
          </div>
        )}

        {/* Core Layout Stage */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-8">
          {/* Quick simulation exit button for sandbox test environments */}
          {currentRole !== "portal" && isTestingEnv && (
            <div className="mb-6 flex justify-start">
              <button
                onClick={() => {
                  // Clear simulated session auth state for testing and return to directory
                  localStorage.removeItem(`swingscore_auth_${currentRole}`);
                  window.location.search = "?role=portal";
                }}
                className={`group flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border transition-all ${
                  isDarkMode
                    ? "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                    : "bg-white border-slate-200 text-slate-500 hover:text-slate-800 hover:border-slate-300 shadow-sm"
                }`}
              >
                <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" />
                Return to Virtual Domain Directory
              </button>
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <RefreshCw className="w-8 h-8 text-violet-500 animate-spin" />
              <p className="text-xs text-slate-400 font-mono">Loading WCS database state...</p>
            </div>
          ) : !isAuthenticated ? (
            // Render the lock screen if the user has navigated to a protected domain slug and is unauthenticated
            <RoleLogin
              role={currentRole === "portal" ? "results" : currentRole}
              isDarkMode={isDarkMode}
              onSuccess={() => setIsAuthenticated(true)}
            />
          ) : (
            <div className="transition-all duration-300">
              {currentRole === "portal" && (
                <PlatformPortal
                  isDarkMode={isDarkMode}
                  settings={settings}
                  onUpdateSettings={handleUpdateSettings}
                />
              )}

              {currentRole === "results" && (
                <ResultsDashboard
                  competitors={competitors}
                  heats={heats}
                  scores={scores}
                  settings={settings}
                  isDarkMode={isDarkMode}
                  onRefresh={fetchState}
                />
              )}

              {currentRole === "competitor" && (
                <RegisterCompetitor
                  competitors={competitors}
                  onRegister={handleRegisterCompetitor}
                  isDarkMode={isDarkMode}
                  settings={settings}
                />
              )}

              {currentRole === "coordinator" && (
                <CoordinatorCheckIn
                  competitors={competitors}
                  heats={heats}
                  onCheckInToggle={handleCheckInToggle}
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
                  onRefresh={fetchState}
                  settings={settings}
                  onSelectJudge={setSelectedJudgeId}
                  onUpdateSettings={handleUpdateSettings}
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
          <div>WCS Real-Time Scoring Engine • Separated Domain Tenant Architecture</div>
          <div className="mt-1 opacity-75">Designed with Desktop precision and Mobile optimized tactile controls</div>
        </footer>
      </div>
    </div>
  );
}
