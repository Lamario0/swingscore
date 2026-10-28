export type Division = "Newcomer" | "Novice" | "Intermediate" | "Advance" | "All-Star" | "Pro" | "Open";
export type Role = "Lead" | "Follow" | "Mixed";
export type CallbackValue = "Yes" | "No" | "Alt 1" | "Alt 2" | "Alt 3";
export type JudgingStyle = "raw" | "placement" | "callback";

export interface Competitor {
  bib: string;
  name: string;
  email?: string;
  division: string;
  role: "Lead" | "Follow";
  checkedIn: boolean;
  scratched?: boolean;
  registryPoints?: number;
  // Partnered contests: entered with a named partner and that contest's own
  // division. Couples are only ever formed from these pairings (utils/partners).
  strictlySwing?: boolean;
  strictlyPartner?: string;
  strictlyDivision?: string;
  routine?: boolean;
  routinePartner?: string;
  routineDivision?: string;
}

export type PartnerRegistrationFields = Pick<
  Competitor,
  "strictlySwing" | "strictlyPartner" | "strictlyDivision" | "routine" | "routinePartner" | "routineDivision"
>;

export interface Heat {
  id: string;
  name: string;
  division: string;
  role: "Lead" | "Follow" | "Mixed";
  competitorBibs: string[];
  couples?: { id: string; leadBib: string; followBib: string }[];
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

export interface AppSettings {
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

export interface CompletedContestResult {
  id: string;
  heatId: string;
  name: string;
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
