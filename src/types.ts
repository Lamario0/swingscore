export type Division = "Newcomer" | "Novice" | "Intermediate" | "Advance" | "All-Star" | "Pro" | "Open";
export type Role = "Lead" | "Follow" | "Mixed";
export type CallbackValue = "Yes" | "No" | "Alt 1" | "Alt 2" | "Alt 3";
export type JudgingStyle = "raw" | "placement" | "callback";

export interface HeatEntryStatus {
  checkedIn?: boolean;
  scratched?: boolean;
}

export interface Competitor {
  bib: string;
  name: string;
  email?: string;
  // Jack & Jill entry: the dancer's main division and the role they dance in it.
  division: string;
  role: "Lead" | "Follow";
  // Check-in and scratch are tracked per contest (heat) in heatStatus, so a
  // dancer can be checked in for one contest and scratched in another. These
  // two fields hold the status for the heat being viewed, filled in by
  // projectCompetitorsForHeat; on their own they're only a legacy fallback.
  checkedIn: boolean;
  scratched?: boolean;
  heatStatus?: Record<string, HeatEntryStatus>;
  registryPoints?: number;
  // Optional second Jack & Jill entry in another division, with its own role
  // (e.g. lead in Advance and follow in Intermediate).
  jjSecond?: boolean;
  jjSecondDivision?: string;
  jjSecondRole?: "Lead" | "Follow";
  // Partnered contests: entered with a named partner and that contest's own
  // division. Couples are only ever formed from these pairings (utils/partners).
  // Strictly Swing has its own role and, like Jack & Jill, can be entered a
  // second time in another division. Routines have one entry and no role.
  strictlySwing?: boolean;
  strictlyPartner?: string;
  strictlyDivision?: string;
  strictlyRole?: "Lead" | "Follow";
  strictlySecond?: boolean;
  strictlySecondPartner?: string;
  strictlySecondDivision?: string;
  strictlySecondRole?: "Lead" | "Follow";
  routine?: boolean;
  routinePartner?: string;
  routineDivision?: string;
}

// Every contest entry beyond the main Jack & Jill division/role.
export const CONTEST_ENTRY_KEYS = [
  "jjSecond", "jjSecondDivision", "jjSecondRole",
  "strictlySwing", "strictlyPartner", "strictlyDivision", "strictlyRole",
  "strictlySecond", "strictlySecondPartner", "strictlySecondDivision", "strictlySecondRole",
  "routine", "routinePartner", "routineDivision"
] as const;

export type ContestEntryFields = Pick<Competitor, (typeof CONTEST_ENTRY_KEYS)[number]>;

export interface Heat {
  id: string;
  name: string;
  division: string;
  role: "Lead" | "Follow" | "Mixed";
  competitorBibs: string[];
  couples?: { id: string; leadBib: string; followBib: string }[];
  // Partnered contests only: dancers on the check-in sheet whose registered
  // partner couldn't be matched. The Floor Coordinator assigns them a partner,
  // which moves them into `couples`; judges only ever see couples.
  unpairedBibs?: string[];
  // Contests created from a previous round's finalists: the dancers who made
  // the cut. The check-in sheet builder offers only these dancers.
  finalistBibs?: string[];
  contestType?: "Jack & Jill" | "Strictly Swing" | "Routine";
  heatType?: "Prelim" | "Semi-Final" | "Quarter Final" | "Finals";
  isCustom?: boolean;
  splits?: number[];
}

export interface ScoreRecord {
  id: string;
  judgeId: string;
  heatId: string;
  competitorBib: string;
  score: number; // For raw: 0-100, For placement: 1 - N ranking
  isCallback: CallbackValue;
  timestamp: number;
}

// Per-contest options set on the Scoring & Results Ledger, keyed by heat id.
// The name and Chief Judge options also apply to the public Results Terminal.
export interface ContestOptions {
  sortMode?: "score" | "bib";
  sideFilter?: "all" | "leaders" | "followers";
  hideAllNoNames?: boolean;
  hideCutNames?: boolean;
  // false removes the Chief Judge's scores from the contest altogether.
  includeChiefScores?: boolean;
  // A side uses all of the Chief Judge's scores or none of them. Unset follows
  // the default: used when fewer than two other judges score that side, or to
  // settle a tie between the other judges.
  chiefShownLeaders?: boolean;
  chiefShownFollowers?: boolean;
  // CJ Weighted Scores: on (the default), the Chief Judge's score settles a tie.
  chiefWeightLeaders?: boolean;
  chiefWeightFollowers?: boolean;
  // The Chief Judge's order for dancers their scores couldn't separate.
  chiefTieOrder?: string[];
}

export interface AppSettings {
  eventName?: string;
  spreadsheetConnected?: boolean;
  currentHeatId: string | null;
  judgingStyle: JudgingStyle;
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
  queuedCheckInFinalized?: boolean;
  // Once true, the Contest Configuration card's contest type/division/phase
  // fields for that slot (live vs queued) become read-only until the
  // matching Reset button clears the slot back to defaults.
  contestConfigLocked?: boolean;
  nextContestConfigLocked?: boolean;
  publishedHeatIds?: string[];
  contestOptions?: Record<string, ContestOptions>;
  judgeNames?: string[];
  judgeRoles?: ("Leaders" | "Followers" | "Finals" | "None")[];
  chiefJudgeName?: string;
  chiefJudgeRole?: "Leaders" | "Followers" | "Both" | "Finals" | "None";
  nextContestType?: "Jack & Jill" | "Strictly Swing" | "Routine" | null;
  nextDivision?: string | null;
  nextHeatType?: "Prelim" | "Semi-Final" | "Quarter Final" | "Finals" | null;
  nextJudgingStyle?: JudgingStyle;
  nextCallbackCount?: number;
  nextAlternateCount?: number;
  nextCallbackCountLeaders?: number;
  nextCallbackCountFollowers?: number;
  nextAlternateCountLeaders?: number;
  nextAlternateCountFollowers?: number;
  nextJudgeNames?: string[];
  nextJudgeRoles?: ("Leaders" | "Followers" | "Finals" | "None")[];
  nextChiefJudgeName?: string;
  nextChiefJudgeRole?: "Leaders" | "Followers" | "Both" | "Finals" | "None";
  completedResults?: CompletedContestResult[];
  lockedDivisions?: string[];
  // Judge names/Chief Judge name that have been "claimed" by entering the scoring
  // console at least once. A claimed name can no longer be selected by a different
  // browser, preventing two people from submitting scores under the same judge.
  claimedJudges?: string[];
}

export interface SheetJob {
  heatId: string;
  status: "queued" | "saving" | "saved" | "failed";
  error?: string | null;
}

export interface CompletedContestResult {
  id: string;
  heatId: string;
  name: string;
  // Stamped at completion: renaming the event later doesn't alter past contests.
  eventName?: string;
  completedAt?: string;
  division: string;
  heatType: "Prelim" | "Semi-Final" | "Quarter Final" | "Finals";
  timestamp: string;
  judgingStyle: JudgingStyle;
  rankings: {
    rank: number;
    bib: string;
    name: string;
    averageScore?: number;
    averagePlacement?: number;
    prelimPoints?: number;
    qualified?: boolean;
    isAlternate?: boolean;
    alternateRank?: number;
    tieGroup?: number;
  }[];
  // The judging configuration actually in effect when this contest was completed
  // (callback/alternate quotas, judge roster, Chief Judge) -- frozen here so that
  // "advance to next round" can re-run today's scoring engine against the exact
  // quotas/roster used at the time, even if the live settings have since moved on
  // to a different contest. Optional/absent on contests completed before this
  // field existed; callers fall back to live settings in that case.
  configSnapshot?: {
    callbackCount: number;
    alternateCount: number;
    callbackCountLeaders?: number;
    callbackCountFollowers?: number;
    alternateCountLeaders?: number;
    alternateCountFollowers?: number;
    judgeNames?: string[];
    judgeRoles?: ("Leaders" | "Followers" | "Finals" | "None")[];
    chiefJudgeName?: string;
    chiefJudgeRole?: "Leaders" | "Followers" | "Both" | "Finals" | "None";
  };
}

export interface AppState {
  competitors: Competitor[];
  heats: Heat[];
  scores: ScoreRecord[];
  settings: AppSettings;
}

export type ViewRole = "admin" | "coordinator" | "judge" | "competitor" | "results" | "scoring";

// Portals that need a passcode on top of the gateway code. "competitor" is the
// Registration portal, matching its ViewRole.
export type StaffRole = "admin" | "judge" | "coordinator" | "scoring" | "competitor";

export type GatewayStatus = "active" | "grace" | "locked";

// What this device is signed in as, carried in its Firebase token.
export interface GatewaySession {
  communityId: string;
  roles: StaffRole[];
  judgeName?: string;
  linkSlug?: string;
}
