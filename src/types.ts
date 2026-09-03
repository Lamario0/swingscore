export type Division = "Newcomer" | "Novice" | "Intermediate" | "Advanced" | "Advance" | "All-Star" | "All Stars" | "Pro" | "Open";
export type Role = "Lead" | "Follow" | "Mixed";
export type CallbackValue = "Yes" | "No" | "Alt 1" | "Alt 2" | "Alt 3";
export type JudgingStyle = "raw" | "placement" | "callback";

export interface Competitor {
  bib: string;
  name: string;
  division: string;
  role: "Lead" | "Follow";
  checkedIn: boolean;
  scratched?: boolean;
  registryPoints?: number;
}

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
    qualified?: boolean;
    isAlternate?: boolean;
  }[];
}

export interface AppState {
  competitors: Competitor[];
  heats: Heat[];
  scores: ScoreRecord[];
  settings: AppSettings;
}

export type ViewRole = "admin" | "coordinator" | "judge" | "competitor" | "results";
