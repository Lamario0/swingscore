import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";

interface Competitor {
  bib: string;
  name: string;
  email?: string;
  division: string;
  role: "Lead" | "Follow";
  checkedIn: boolean;
  scratched?: boolean;
  registryPoints?: number;
}

interface Heat {
  id: string;
  name: string;
  division: string;
  role: "Lead" | "Follow" | "Mixed";
  competitorBibs: string[];
  couples?: { id: string; leadBib: string; followBib: string }[];
  isCustom?: boolean;
  contestType?: "Jack & Jill" | "Strictly Swing" | "Routine";
  heatType?: "Prelim" | "Semi-Final" | "Quarter Final" | "Finals";
  splits?: number[];
}

interface ScoreRecord {
  id: string;
  judgeId: string;
  heatId: string;
  competitorBib: string;
  score: number; // For raw: 0-100, For placement: 1 - N ranking
  isCallback: "Yes" | "No" | "Alt 1" | "Alt 2" | "Alt 3";
  timestamp: number;
}

interface AppSettings {
  currentHeatId: string | null;
  judgingStyle: "raw" | "placement" | "callback";
  callbackCount: number;
  alternateCount?: number;
  finalizedSheets?: string[];
  callbackCountLeaders?: number;
  callbackCountFollowers?: number;
  alternateCountLeaders?: number;
  alternateCountFollowers?: number;
  isPublished?: boolean;
  registrationEnabled?: boolean;
  checkInEnabled?: boolean;
  judgingEnabled?: boolean;
  contestType?: "Jack & Jill" | "Strictly Swing" | "Routine";
  division?: string;
  heatType?: "Prelim" | "Semi-Final" | "Quarter Final" | "Finals";
  queuedHeatId?: string | null;
  checkInFinalized?: boolean;
  publishedHeatIds?: string[];
  judgeNames?: string[];
  judgeRoles?: ("Leaders" | "Followers" | "Finals" | "None")[];
  chiefJudgeName?: string;
  chiefJudgeRole?: "Leaders" | "Followers" | "Both" | "Finals" | "None";
  nextContestType?: "Jack & Jill" | "Strictly Swing" | "Routine" | null;
  nextDivision?: string | null;
  nextHeatType?: "Prelim" | "Semi-Final" | "Quarter Final" | "Finals" | null;
  nextJudgingStyle?: "raw" | "placement" | "callback";
  nextCallbackCount?: number;
  nextAlternateCount?: number;
  nextCallbackCountLeaders?: number;
  nextCallbackCountFollowers?: number;
  nextAlternateCountLeaders?: number;
  nextAlternateCountFollowers?: number;
  lockedDivisions?: string[];
  queuedCheckInFinalized?: boolean;
  completedResults?: CompletedContestResult[];
  claimedJudges?: string[];
}

interface CompletedContestResult {
  id: string;
  heatId: string;
  name: string;
  division: string;
  heatType: "Prelim" | "Semi-Final" | "Quarter Final" | "Finals";
  timestamp: string;
  judgingStyle: "raw" | "placement" | "callback";
  rankings: {
    rank: number;
    bib: string;
    name: string;
    averageScore?: number;
    averagePlacement?: number;
    qualified?: boolean;
    isAlternate?: boolean;
  }[];
}

interface AppState {
  competitors: Competitor[];
  heats: Heat[];
  scores: ScoreRecord[];
  settings: AppSettings;
}

const DATA_FILE = path.join(process.cwd(), "data.json");

const SEED_COMPETITORS: Competitor[] = [
  // Leaders from the spreadsheet reference
  { bib: "1", name: "Jules Green", email: "jules.green@example.com", division: "Novice", role: "Lead", checkedIn: true, scratched: false, registryPoints: 84 },
  { bib: "2", name: "Joel Blue", email: "joel.blue@example.com", division: "Novice", role: "Lead", checkedIn: true, scratched: false, registryPoints: 85 },
  { bib: "3", name: "Josiah Yellow", email: "josiah.yellow@example.com", division: "Novice", role: "Lead", checkedIn: true, scratched: false, registryPoints: 90 },
  { bib: "4", name: "Ron Red", email: "ron.red@example.com", division: "Novice", role: "Lead", checkedIn: true, scratched: false, registryPoints: 80 },

  // Followers from the spreadsheet reference
  { bib: "11", name: "Rachel Red", email: "rachel.red@example.com", division: "Novice", role: "Follow", checkedIn: true, scratched: false, registryPoints: 75 },
  { bib: "12", name: "Mallory Blue", email: "mallory.blue@example.com", division: "Novice", role: "Follow", checkedIn: true, scratched: false, registryPoints: 80 },
  { bib: "13", name: "Willow Green", email: "willow.green@example.com", division: "Novice", role: "Follow", checkedIn: true, scratched: false, registryPoints: 69 },
  { bib: "14", name: "Mindy (Yellow)", email: "mindy.yellow@example.com", division: "Novice", role: "Follow", checkedIn: false, scratched: false, registryPoints: 55 },
  { bib: "15", name: "Misty (Green)", email: "misty.green@example.com", division: "Novice", role: "Follow", checkedIn: true, scratched: false, registryPoints: 85 }
];

const SEED_HEATS: Heat[] = [
  {
    id: "heat-prelims-leaders",
    name: "Novice Prelims - Leaders",
    division: "Novice",
    role: "Lead",
    competitorBibs: ["1", "2", "3", "4"]
  },
  {
    id: "heat-prelims-followers",
    name: "Novice Prelims - Followers",
    division: "Novice",
    role: "Follow",
    competitorBibs: ["11", "12", "13", "14", "15"]
  },
  {
    id: "heat-strictly-finals",
    name: "Novice Strictly Finals",
    division: "Novice",
    role: "Mixed",
    competitorBibs: ["4_12", "1_11", "2_13", "3_15"],
    couples: [
      { id: "4_12", leadBib: "4", followBib: "12" },
      { id: "1_11", leadBib: "1", followBib: "11" },
      { id: "2_13", leadBib: "2", followBib: "13" },
      { id: "3_15", leadBib: "3", followBib: "15" }
    ]
  }
];

const SEED_SCORES: ScoreRecord[] = [
  // Judge 1 Scores (matches spreadsheet)
  { id: "s1", judgeId: "Judge A", heatId: "heat-strictly-finals", competitorBib: "4_12", score: 64.0, isCallback: "No", timestamp: Date.now() },
  { id: "s2", judgeId: "Judge A", heatId: "heat-strictly-finals", competitorBib: "1_11", score: 84.0, isCallback: "Yes", timestamp: Date.now() },
  { id: "s3", judgeId: "Judge A", heatId: "heat-strictly-finals", competitorBib: "2_13", score: 85.0, isCallback: "Yes", timestamp: Date.now() },
  { id: "s4", judgeId: "Judge A", heatId: "heat-strictly-finals", competitorBib: "3_15", score: 90.0, isCallback: "Yes", timestamp: Date.now() },

  // Judge 3 Scores (matches spreadsheet)
  { id: "s5", judgeId: "Judge C", heatId: "heat-strictly-finals", competitorBib: "4_12", score: 78.0, isCallback: "Yes", timestamp: Date.now() },
  { id: "s6", judgeId: "Judge C", heatId: "heat-strictly-finals", competitorBib: "1_11", score: 85.0, isCallback: "Yes", timestamp: Date.now() },
  { id: "s7", judgeId: "Judge C", heatId: "heat-strictly-finals", competitorBib: "2_13", score: 69.0, isCallback: "No", timestamp: Date.now() },
  { id: "s8", judgeId: "Judge C", heatId: "heat-strictly-finals", competitorBib: "3_15", score: 60.0, isCallback: "No", timestamp: Date.now() },

  // Judge 5 Scores (matches spreadsheet)
  { id: "s9", judgeId: "Judge E", heatId: "heat-strictly-finals", competitorBib: "1_11", score: 82.0, isCallback: "Yes", timestamp: Date.now() }
];

const DEFAULT_STATE: AppState = {
  competitors: SEED_COMPETITORS,
  heats: SEED_HEATS,
  scores: SEED_SCORES,
  settings: {
    currentHeatId: "heat-strictly-finals",
    judgingStyle: "placement",
    callbackCount: 3,
    alternateCount: 2,
    callbackCountLeaders: 3,
    callbackCountFollowers: 3,
    alternateCountLeaders: 2,
    alternateCountFollowers: 2,
    isPublished: false,
    registrationEnabled: true,
    checkInEnabled: true,
    judgingEnabled: true,
    contestType: "Strictly Swing",
    division: "Novice",
    heatType: "Finals",
    queuedHeatId: null,
    // The seeded demo heat ("heat-strictly-finals") ships with SEED_SCORES already
    // recorded against it, so check-in must already be finalized for that heat to
    // make sense out of the box. /api/reset and /api/clear-all both explicitly
    // override this back to false for a genuinely blank slate.
    checkInFinalized: true,
    publishedHeatIds: [],
    finalizedSheets: [],
    judgeNames: ["Judge A", "Judge B", "Judge C", "Judge D", "Judge E"],
    judgeRoles: ["None", "None", "None", "None", "None"],
    chiefJudgeName: "Chief Judge",
    chiefJudgeRole: "Both",
    lockedDivisions: [],
    queuedCheckInFinalized: false,
    completedResults: [],
    claimedJudges: []
  }
};

function autoPopulateHeats(state: AppState) {
  const leadsByDiv: { [div: string]: string[] } = {};
  const followsByDiv: { [div: string]: string[] } = {};

  state.competitors.forEach((c) => {
    if (c.checkedIn && !c.scratched) {
      const div = c.division;
      if (c.role === "Lead") {
        if (!leadsByDiv[div]) leadsByDiv[div] = [];
        leadsByDiv[div].push(c.bib);
      } else {
        if (!followsByDiv[div]) followsByDiv[div] = [];
        followsByDiv[div].push(c.bib);
      }
    }
  });

  state.heats.forEach((heat) => {
    if (heat.isCustom) return; // Skip custom heats to preserve manual admin modifications

    const div = heat.division;
    const leads = leadsByDiv[div] || [];
    const follows = followsByDiv[div] || [];

    if (heat.role === "Lead") {
      heat.competitorBibs = leads;
    } else if (heat.role === "Follow") {
      heat.competitorBibs = follows;
    } else if (heat.role === "Mixed") {
      heat.competitorBibs = [...leads, ...follows];
      heat.couples = [];
    }
  });
}

function readState(): AppState {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, "utf-8");
      const state = JSON.parse(content);
      autoPopulateHeats(state);
      return state;
    }
  } catch (error) {
    console.error("Error reading state file, using default state", error);
  }
  const defaultStateCopy = JSON.parse(JSON.stringify(DEFAULT_STATE));
  autoPopulateHeats(defaultStateCopy);
  return defaultStateCopy;
}

function writeState(state: AppState) {
  try {
    autoPopulateHeats(state);
    fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2), "utf-8");
  } catch (error) {
    console.error("Error writing state file", error);
  }
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // API endpoints
  app.get("/api/state", (req, res) => {
    const state = readState();
    res.json(state);
  });

  app.post("/api/register", (req, res) => {
    const { bib, name, email, division, role } = req.body;
    if (!bib || !name || !email || !division || !role) {
      res.status(400).json({ error: "Missing required competitor fields" });
      return;
    }

    const state = readState();

    if (state.settings.registrationEnabled === false) {
      res.status(403).json({ error: "Registration is currently closed by the event administrators" });
      return;
    }

    if ((state.settings.lockedDivisions || []).includes(division)) {
      res.status(403).json({ error: `Registration for the ${division} division is closed — check-in has already been created for this division` });
      return;
    }

    // Check if bib already exists
    const exists = state.competitors.some((c) => c.bib === bib);
    if (exists) {
      res.status(400).json({ error: `Competitor with bib ${bib} already exists` });
      return;
    }

    const newCompetitor: Competitor = {
      bib,
      name,
      email,
      division,
      role,
      checkedIn: false
    };

    state.competitors.push(newCompetitor);
    writeState(state);
    res.json({ success: true, competitor: newCompetitor });
  });

  app.post("/api/check-in", (req, res) => {
    const { bib, checkedIn, scratched, registryPoints } = req.body;
    if (bib === undefined) {
      res.status(400).json({ error: "Missing bib parameter" });
      return;
    }

    const state = readState();
    const competitor = state.competitors.find((c) => c.bib === bib);
    if (!competitor) {
      res.status(404).json({ error: "Competitor not found" });
      return;
    }

    if (checkedIn !== undefined) competitor.checkedIn = checkedIn;
    if (scratched !== undefined) competitor.scratched = scratched;
    if (registryPoints !== undefined) competitor.registryPoints = Number(registryPoints);

    writeState(state);
    res.json({ success: true, competitor });
  });

  app.post("/api/competitor/update", (req, res) => {
    const { oldBib, newBib, name, email, role, division, checkedIn, scratched } = req.body;
    if (!oldBib || !newBib || !role || !division) {
      res.status(400).json({ error: "Missing required competitor update fields" });
      return;
    }

    const state = readState();

    if (oldBib !== newBib) {
      const exists = state.competitors.some((c) => c.bib === newBib);
      if (exists) {
        res.status(400).json({ error: `Competitor with bib ${newBib} already exists` });
        return;
      }
    }

    const competitor = state.competitors.find((c) => c.bib === oldBib);
    if (!competitor) {
      res.status(404).json({ error: "Competitor not found" });
      return;
    }

    competitor.bib = newBib;
    if (name !== undefined) competitor.name = name;
    if (email !== undefined) competitor.email = email;
    competitor.role = role;
    competitor.division = division;
    if (checkedIn !== undefined) competitor.checkedIn = checkedIn;
    if (scratched !== undefined) competitor.scratched = scratched;

    if (oldBib !== newBib) {
      state.heats.forEach((heat) => {
        heat.competitorBibs = heat.competitorBibs.map((b) => {
          if (b === oldBib) return newBib;
          if (b.includes("_")) {
            return b.split("_").map((part) => (part === oldBib ? newBib : part)).join("_");
          }
          return b;
        });

        if (heat.couples) {
          heat.couples.forEach((couple) => {
            if (couple.leadBib === oldBib) couple.leadBib = newBib;
            if (couple.followBib === oldBib) couple.followBib = newBib;
            couple.id = `${couple.leadBib}_${couple.followBib}`;
          });
        }
      });

      state.scores.forEach((score) => {
        if (score.competitorBib === oldBib) {
          score.competitorBib = newBib;
        } else if (score.competitorBib.includes("_")) {
          score.competitorBib = score.competitorBib.split("_").map((part) => (part === oldBib ? newBib : part)).join("_");
        }
      });
    }

    writeState(state);
    res.json({ success: true, competitor });
  });

  app.post("/api/heats/create", (req, res) => {
    const { name, division, role, competitorBibs, couples, target, heatType, contestType } = req.body;
    if (!name || !division || !role || !competitorBibs) {
      res.status(400).json({ error: "Missing required heat fields" });
      return;
    }

    const state = readState();
    
    let finalCouples = couples || [];

    const newHeat: Heat = {
      id: "heat-" + Date.now(),
      name,
      division,
      role,
      competitorBibs,
      couples: finalCouples,
      isCustom: true,
      heatType: heatType || (name.includes("Finals") ? "Finals" : name.includes("Semi-Final") ? "Semi-Final" : name.includes("Quarter Final") ? "Quarter Final" : "Prelim"),
      contestType: contestType || (name.includes("Routine") ? "Routine" : name.includes("Strictly") ? "Strictly Swing" : "Jack & Jill")
    };

    state.heats.push(newHeat);
    if (target !== "next") {
      state.settings.checkInFinalized = false;
    }
    writeState(state);
    res.json({ success: true, heat: newHeat });
  });

  app.post("/api/heats/update", (req, res) => {
    const { heatId, name, division, role, competitorBibs, couples, isCustom, splits, heatType, contestType } = req.body;
    if (!heatId) {
      res.status(400).json({ error: "Missing heatId" });
      return;
    }

    const state = readState();
    const heat = state.heats.find((h) => h.id === heatId);
    if (!heat) {
      res.status(404).json({ error: "Heat not found" });
      return;
    }

    if (name !== undefined) {
      heat.name = name;
      // Re-infer if name changes and heatType/contestType are not explicitly passed
      if (heatType === undefined) {
        heat.heatType = name.includes("Finals") ? "Finals" : name.includes("Semi-Final") ? "Semi-Final" : name.includes("Quarter Final") ? "Quarter Final" : "Prelim";
      }
      if (contestType === undefined) {
        heat.contestType = name.includes("Routine") ? "Routine" : name.includes("Strictly") ? "Strictly Swing" : "Jack & Jill";
      }
    }
    if (division !== undefined) {
      heat.division = division;
    }
    if (role !== undefined) {
      heat.role = role;
    }
    if (competitorBibs !== undefined) {
      heat.competitorBibs = competitorBibs;
    }
    if (couples !== undefined) {
      heat.couples = couples;
    }
    if (isCustom !== undefined) {
      heat.isCustom = isCustom;
    }
    if (splits !== undefined) {
      heat.splits = splits;
    }
    if (heatType !== undefined) {
      heat.heatType = heatType;
    }
    if (contestType !== undefined) {
      heat.contestType = contestType;
    }

    writeState(state);
    res.json({ success: true, heat });
  });

  app.post("/api/heats/delete", (req, res) => {
    const { heatId } = req.body;
    if (!heatId) {
      res.status(400).json({ error: "Missing heatId" });
      return;
    }

    const state = readState();
    state.heats = state.heats.filter((h) => h.id !== heatId);
    // Remove scores associated with this heat
    state.scores = state.scores.filter((s) => s.heatId !== heatId);
    
    if (state.settings.queuedHeatId === heatId) {
      state.settings.queuedHeatId = null;
    }

    if (state.settings.currentHeatId === heatId) {
      state.settings.currentHeatId = state.heats.find(h => h.id !== state.settings.queuedHeatId)?.id || null;
    }

    writeState(state);
    res.json({ success: true });
  });

  app.post("/api/settings", (req, res) => {
    const state = readState();
    
    const oldHeatId = state.settings.currentHeatId;
    const newHeatId = req.body.currentHeatId;
    const isNewHeatActivated = newHeatId !== undefined && newHeatId !== oldHeatId && newHeatId !== null;

    // Check if finalizing check-in
    const finalized = req.body.checkInFinalized === true && state.settings.checkInFinalized !== true;
    
    state.settings = {
      ...state.settings,
      ...req.body
    };

    if (isNewHeatActivated) {
      // Reset all competitor check-in and scratch statuses by default for the new contest!
      state.competitors.forEach((c) => {
        c.checkedIn = false;
        c.scratched = false;
      });
      state.settings.checkInFinalized = false;
      state.settings.finalizedSheets = [];
      
      // Keep activeHeat custom so its admin-created competitor list (check-in sheet) is preserved
      // and not overwritten by autoPopulateHeats before check-in.
      const activeHeat = state.heats.find((h) => h.id === newHeatId);
      if (activeHeat) {
        activeHeat.isCustom = true;
      }
    }

    if (finalized) {
      // Find the active heat and set it to not custom so autoPopulateHeats can update its competitors
      const activeHeat = state.heats.find(h => h.id === state.settings.currentHeatId);
      if (activeHeat) {
        activeHeat.isCustom = false;
      }

      // Synchronize all heats with the finalized check-in status
      autoPopulateHeats(state);

      // Send the sheets to the Active Heat Editor by marking all heats as custom (isCustom = true)
      // so that the admin can adjust/customize them as needed while the event is happening.
      state.heats.forEach((h) => {
        h.isCustom = true;
      });
      
      // Auto populate current heat if empty
      if (!state.settings.currentHeatId && state.heats.length > 0) {
        state.settings.currentHeatId = state.heats[0].id;
      }
    }

    writeState(state);
    res.json({ success: true, settings: state.settings });
  });

  app.post("/api/score", (req, res) => {
    const { judgeId, heatId, competitorBib, score, isCallback } = req.body;
    if (!judgeId || !heatId || !competitorBib) {
      res.status(400).json({ error: "Missing scoring data" });
      return;
    }

    const state = readState();
    
    // Find if a score already exists for this judge, heat, and competitor
    const existingScoreIdx = state.scores.findIndex(
      (s) => s.judgeId === judgeId && s.heatId === heatId && s.competitorBib === competitorBib
    );

    const newRecord: ScoreRecord = {
      id: existingScoreIdx >= 0 ? state.scores[existingScoreIdx].id : "score-" + Date.now() + "-" + Math.random().toString(36).substr(2, 4),
      judgeId,
      heatId,
      competitorBib,
      score: score !== undefined ? Number(score) : 0,
      isCallback: isCallback || "No",
      timestamp: Date.now()
    };

    if (existingScoreIdx >= 0) {
      state.scores[existingScoreIdx] = newRecord;
    } else {
      state.scores.push(newRecord);
    }

    writeState(state);
    res.json({ success: true, score: newRecord });
  });

  // Bulk score update endpoint for judges submitting a full heat sheet
  app.post("/api/score/bulk", (req, res) => {
    const { judgeId, heatId, scores } = req.body; // scores: { competitorBib: string, score: number, isCallback: 'Yes' | 'No' | 'Alternate' }[]
    if (!judgeId || !heatId || !Array.isArray(scores)) {
      res.status(400).json({ error: "Missing or invalid bulk scoring data" });
      return;
    }

    const state = readState();
    
    scores.forEach((item) => {
      const existingIdx = state.scores.findIndex(
        (s) => s.judgeId === judgeId && s.heatId === heatId && s.competitorBib === item.competitorBib
      );

      const record: ScoreRecord = {
        id: existingIdx >= 0 ? state.scores[existingIdx].id : "score-" + Date.now() + "-" + Math.random().toString(36).substr(2, 4),
        judgeId,
        heatId,
        competitorBib: item.competitorBib,
        score: item.score !== undefined ? Number(item.score) : 0,
        isCallback: item.isCallback || "No",
        timestamp: Date.now()
      };

      if (existingIdx >= 0) {
        state.scores[existingIdx] = record;
      } else {
        state.scores.push(record);
      }
    });

    writeState(state);
    res.json({ success: true });
  });

  app.post("/api/reset", (req, res) => {
    const clearedState = {
      ...DEFAULT_STATE,
      heats: [],
      scores: [],
      settings: {
        ...DEFAULT_STATE.settings,
        currentHeatId: null,
        queuedHeatId: null,
        publishedHeatIds: [],
        checkInFinalized: false,
        queuedCheckInFinalized: false,
        finalizedSheets: [],
        lockedDivisions: [],
        completedResults: [],
        claimedJudges: []
      }
    };
    writeState(clearedState);
    res.json({ success: true, state: clearedState });
  });

  app.post("/api/clear-all", (req, res) => {
    const EMPTY_STATE: AppState = {
      competitors: [],
      heats: [],
      scores: [],
      settings: {
        currentHeatId: null,
        judgingStyle: "raw",
        callbackCount: 3,
        alternateCount: 0,
        finalizedSheets: [],
        callbackCountLeaders: 3,
        callbackCountFollowers: 3,
        alternateCountLeaders: 0,
        alternateCountFollowers: 0,
        isPublished: false,
        registrationEnabled: true,
        checkInEnabled: true,
        judgingEnabled: true,
        contestType: "Jack & Jill",
        division: "Novice",
        heatType: "Prelim",
        queuedHeatId: null,
        checkInFinalized: false,
        publishedHeatIds: [],
        judgeNames: ["Judge A", "Judge B", "Judge C", "Judge D", "Judge E"],
        judgeRoles: ["None", "None", "None", "None", "None"],
        chiefJudgeName: "Chief Judge",
        chiefJudgeRole: "Both",
        lockedDivisions: [],
        queuedCheckInFinalized: false,
        completedResults: [],
        claimedJudges: []
      }
    };
    writeState(EMPTY_STATE);
    res.json({ success: true, state: EMPTY_STATE });
  });

  // Vite integration middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const PORT = 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
