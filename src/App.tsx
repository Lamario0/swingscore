import React, { useState, useEffect, useRef } from "react";
import { Award, RefreshCw, Moon, Sun, AlertCircle, Globe, ShieldAlert, UserCheck, Users, Landmark, LogOut } from "lucide-react";
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
import SampleDancersButton from "./components/SampleDancersButton";
import { doc, setDoc, waitForPendingWrites, writeBatch } from "firebase/firestore";
import { db } from "./firebase";
import { canReadAllScores, useCommunityState } from "./hooks/useCommunityState";
import { useGatewaySession } from "./hooks/useGatewaySession";
import { AppSettings, Competitor, Division, ViewRole, CallbackValue, ContestEntryFields, ScoreRecord, StaffRole } from "./types";
import { apiRequest } from "./utils/api";
import { getScoreDocId, toDocId } from "./utils/ids";
import { isCouplesHeat, projectCompetitorsForHeat } from "./utils/partners";
import { parsePortalLink, readPortalPass } from "./utils/portalLinks";

const PORTAL_NAMES: Record<StaffRole | "portal", string> = {
  portal: "the Central Gateway",
  admin: "Admin",
  judge: "the Judge Station",
  coordinator: "Floor Coordinator",
  competitor: "Registration",
  scoring: "Scoring & Results"
};

export default function App() {
  // Navigation & Preferences (Dynamically detected via URL slug, query string, or subdomains)
  const [portalLink] = useState(() => parsePortalLink(window.location.pathname));
  const [portalPass, setPortalPass] = useState(() => (portalLink ? readPortalPass(window.location.hash) : ""));
  const [currentRole, setCurrentRole] = useState<ViewRole | "portal">(portalLink?.role || "portal");
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
  const [registrationDivision, setRegistrationDivision] = useState<Division>("Novice");

  // Parse the current virtual environment at mount time
  useEffect(() => {
    const detectRole = (): ViewRole | "portal" => {
      if (portalLink) return portalLink.role;

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
  const { session, isReady, connect, connectWithLink, connectWithPass, loginRole, logoutRole, applyToken, leaveGateway } = useGatewaySession();
  const { communityName, competitors, heats, scores, settings, error, isOffline, hasUnsyncedScores, loading } = useCommunityState(session);

  // A portal link connects the device itself. Once it has, the session remembers
  // the link, so a judge can reload the page without a connection.
  const [linkError, setLinkError] = useState("");
  const connectingSlugRef = useRef("");
  const isOnLinkedSession = !!portalLink && session?.linkSlug === portalLink.slug;
  useEffect(() => {
    if (!isReady || !portalLink || portalPass || isOnLinkedSession || connectingSlugRef.current === portalLink.slug) return;
    connectingSlugRef.current = portalLink.slug;
    connectWithLink(portalLink.slug).catch((err) => setLinkError(err.message));
  }, [isReady, portalLink, portalPass, isOnLinkedSession, connectWithLink]);

  // A QR code signs the device straight in. If it can't, the plain link above
  // takes over and the passcode screen says why. Either way the pass leaves the
  // address, so it can't be reloaded, shared or left in the browser's history.
  const [passError, setPassError] = useState("");
  const isUsingPassRef = useRef(false);
  useEffect(() => {
    if (!isReady || !portalLink || !portalPass || isUsingPassRef.current) return;
    isUsingPassRef.current = true;
    const finish = () => {
      window.history.replaceState(null, "", window.location.pathname);
      isUsingPassRef.current = false;
      setPortalPass("");
    };
    if (isOnLinkedSession && session?.roles.includes(portalLink.role as StaffRole)) {
      finish();
      return;
    }
    connectWithPass(portalLink.slug, portalLink.role, portalPass)
      .then(() => {
        // Like a passcode sign-in: a new arrival picks their judge name themselves.
        if (portalLink.role === "judge") setSelectedJudgeId("");
      })
      .catch((err) => setPassError(err.message))
      .finally(finish);
  }, [isReady, portalLink, portalPass, isOnLinkedSession, session, connectWithPass]);

  // Opening a QR link on its own portal's page doesn't reload the app.
  useEffect(() => {
    if (!portalLink) return;
    const readPass = () => setPortalPass(readPortalPass(window.location.hash));
    window.addEventListener("hashchange", readPass);
    return () => window.removeEventListener("hashchange", readPass);
  }, [portalLink]);

  // The owner app's "Open Admin portal" link signs this browser in as Admin of
  // the owner's own community, then shows its Central Gateway.
  const [ownerAdminLink] = useState(() =>
    window.location.pathname === "/owner-admin" ? new URLSearchParams(window.location.hash.slice(1)) : null
  );
  const [isOpeningOwnerAdmin, setIsOpeningOwnerAdmin] = useState(!!ownerAdminLink);
  const isUsingOwnerAdminLinkRef = useRef(false);
  useEffect(() => {
    if (!isReady || !ownerAdminLink || isUsingOwnerAdminLinkRef.current) return;
    isUsingOwnerAdminLinkRef.current = true;
    apiRequest("/api/gateway/owner-admin-pass", { communityId: ownerAdminLink.get("community"), pass: ownerAdminLink.get("pass") })
      .then(({ token }) => applyToken(token))
      .catch((err) => setActionError(err.message))
      .finally(() => {
        window.history.replaceState(null, "", "/?role=portal");
        setCurrentRole("portal");
        setIsOpeningOwnerAdmin(false);
      });
  }, [isReady, ownerAdminLink, applyToken]);

  // Anyone connected can see Results. The Central Gateway is the Admin's alone.
  const requiredRole: StaffRole | null = currentRole === "results" ? null : currentRole === "portal" ? "admin" : currentRole;
  const isAuthenticated = !requiredRole || !!session?.roles.includes(requiredRole);
  const isAdmin = !!session?.roles.includes("admin");

  // Logging out of a portal brings back its passcode screen. A judge's name is
  // freed for someone else first.
  const handleLogOut = async () => {
    if (!requiredRole) return;
    if (requiredRole === "judge") {
      if (myClaimedJudge) await handleReleaseJudge(myClaimedJudge).catch(() => {});
      setSelectedJudgeId("");
    }
    await logoutRole(requiredRole).catch((err) => setActionError(err.message));
  };

  // Only the Admin has a Central Gateway to return to. Other portals sign out
  // on the way back to it.
  const returnToGateway = async () => {
    if (currentRole !== "admin" && session?.roles.includes(currentRole as StaffRole)) {
      await logoutRole(currentRole as StaffRole).catch(() => {});
    }
    window.location.href = "/?role=portal";
  };
  const myClaimedJudge = session?.judgeName || "";
  const isOnOpenRegistration = currentRole === "competitor" && !!session && isAuthenticated && !loading && settings.registrationEnabled !== false;

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

  const handleDeleteCompetitor = async (bib: string) => {
    await apiRequest("/api/competitor/delete", { bib });
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
          {!isReady || isOpeningOwnerAdmin ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <RefreshCw className="w-8 h-8 text-violet-500 animate-spin" />
            </div>
          ) : portalLink && linkError && !isOnLinkedSession ? (
            <div id="portal-link-error" className="max-w-md w-full mx-auto my-12 p-8 rounded-3xl border border-rose-500/20 bg-rose-500/5 text-center">
              <AlertCircle className="w-10 h-10 mx-auto text-rose-500 mb-4" />
              <h2 className="text-lg font-bold tracking-tight">This link isn't working</h2>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">{linkError}</p>
            </div>
          ) : portalLink && (portalPass || !isOnLinkedSession) ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <RefreshCw className="w-8 h-8 text-violet-500 animate-spin" />
              <p className="text-xs text-slate-400 font-mono">Opening your portal...</p>
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
              role={requiredRole as StaffRole}
              isDarkMode={isDarkMode}
              notice={passError}
              onLogin={async (passcode) => {
                await loginRole(requiredRole as StaffRole, passcode);
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
              {requiredRole && (
                <div id="portal-session-bar" className="mb-6 flex items-center justify-end gap-3 flex-wrap">
                  <span className="text-xs text-slate-400">
                    Signed in to <span className="font-semibold text-slate-300">{PORTAL_NAMES[currentRole as StaffRole | "portal"]}</span>
                  </span>
                  <button
                    type="button"
                    id="portal-logout-btn"
                    onClick={handleLogOut}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border border-rose-500/40 text-rose-500 bg-rose-500/5 hover:bg-rose-500/15 transition-all cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    Log Out
                  </button>
                </div>
              )}

              {currentRole === "portal" && isAdmin && (
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
                  communityId={session.communityId}
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
                  onUpdateCompetitor={handleUpdateCompetitor}
                  onDeleteCompetitor={handleDeleteCompetitor}
                  division={registrationDivision}
                  setDivision={setRegistrationDivision}
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
        <footer className={`pt-6 px-4 border-t text-center text-[10px] font-mono ${isOnOpenRegistration ? "pb-20 lg:pb-6" : "pb-6"} ${
          isDarkMode ? "bg-slate-900/50 border-slate-900 text-slate-500" : "bg-white border-slate-200 text-slate-400"
        }`}>
          {isOnOpenRegistration && <SampleDancersButton division={registrationDivision} onAdd={handleAddSampleDancers} />}
          <div>WCS Real-Time Scoring Engine</div>
          <div className="mt-1 opacity-75">Designed with Desktop precision and Mobile optimized tactile controls</div>
          {session && isAdmin && currentRole !== "portal" ? (
            <button
              type="button"
              id="return-to-gateway-btn"
              onClick={returnToGateway}
              className="mt-2 underline hover:text-slate-300 cursor-pointer"
            >
              Return To Gateway
            </button>
          ) : session && (
            <button
              type="button"
              id="leave-gateway-btn"
              onClick={() => {
                if (window.confirm("Disconnect this device from the gateway? You'll need your portal link or gateway code to reconnect.")) {
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
