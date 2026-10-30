import { Competitor, ScoreRecord, Heat, AppSettings, ContestOptions, JudgingStyle } from "../types";
import { isCouplesHeat, projectCompetitorsForHeat } from "./partners";

export interface CompetitorResult {
  competitor: Competitor;
  scoresByJudge: { 
    [judgeId: string]: { 
      score: number; 
      isCallback: string; 
      placement: number; // calculated ordinal placement for this judge (1st, 2nd, 3rd, etc.)
    } 
  };
  averageScore: number;
  averagePlacement: number;
  yesCount: number;
  altCount: number;
  alt1Count?: number;
  alt2Count?: number;
  alt3Count?: number;
  noCount: number;
  prelimPoints?: number; // point-based score for prelim ranking
  countedPlacements: number[]; // placements that count toward this result
  rank: number;
  qualified: boolean;
  isAlternate?: boolean;
  alternateRank?: number;
  tieGroup?: number; // set when scores can't separate dancers at a cut line
  isChiefCounted: boolean; // a side uses all of the Chief Judge's scores or none
  majorityCalculatedRank?: number; // WSDC relative placement rank
}

export function calculateHeatResults(
  heat: Heat,
  allCompetitors: Competitor[],
  scores: ScoreRecord[],
  judgingStyle: "raw" | "placement" | "callback",
  callbackCount: number,
  alternateCount: number = 0,
  callbackCountLeaders?: number,
  callbackCountFollowers?: number,
  alternateCountLeaders?: number,
  alternateCountFollowers?: number,
  settings?: AppSettings
): CompetitorResult[] {
  // Read each dancer's entry for this heat's contest+division (role/division),
  // so a second-division entry is ranked on the side it was entered on.
  const competitors = projectCompetitorsForHeat(allCompetitors, heat);
  // If Mixed heat and not judged as couples (Finals, or any partnered-contest
  // round), calculate results separately for Leaders and Followers
  if (heat.role === "Mixed" && !isCouplesHeat(heat)) {
    // Split the heat's bibs into Leads and Follows. The normal case (created by
    // Auto-fill Next Heat / Apply Contest Parameters for any non-Finals Mixed
    // heat) is a FLAT list of individual bibs with no couples pairing at all --
    // so split those by each competitor's own registered role. Only fall back
    // to treating an entry as a "lead_follow" paired id (via heat.couples, or
    // splitting on "_" for legacy data with no couples array) when it doesn't
    // match a real competitor bib directly -- splitting on "_" unconditionally
    // previously misparsed plain numeric bibs (no underscore), which silently
    // dumped every competitor -- leads and follows alike -- into "leadHeat" and
    // left followHeat empty, corrupting the callback ranking for the followers.
    const coupleList = heat.couples || [];
    let leadBibs: string[] = [];
    let followBibs: string[] = [];
    if (coupleList.length > 0) {
      leadBibs = coupleList.map(couple => couple.leadBib).filter(Boolean);
      followBibs = coupleList.map(couple => couple.followBib).filter(Boolean);
    } else {
      heat.competitorBibs.forEach((bibOrId) => {
        const directMatch = competitors.find((c) => c.bib === bibOrId);
        if (directMatch) {
          if (directMatch.role === "Lead") leadBibs.push(bibOrId);
          else if (directMatch.role === "Follow") followBibs.push(bibOrId);
        } else if (bibOrId.includes("_")) {
          const [leadBib, followBib] = bibOrId.split("_");
          if (leadBib) leadBibs.push(leadBib);
          if (followBib) followBibs.push(followBib);
        }
      });
    }

    const leadHeat: Heat = { ...heat, role: "Lead", competitorBibs: leadBibs };
    const followHeat: Heat = { ...heat, role: "Follow", competitorBibs: followBibs };

    const leadCB = callbackCountLeaders !== undefined ? callbackCountLeaders : callbackCount;
    const followCB = callbackCountFollowers !== undefined ? callbackCountFollowers : callbackCount;
    const leadAlt = alternateCountLeaders !== undefined ? alternateCountLeaders : alternateCount;
    const followAlt = alternateCountFollowers !== undefined ? alternateCountFollowers : alternateCount;

    const leadResults = calculateHeatResults(
      leadHeat,
      competitors,
      scores,
      judgingStyle,
      leadCB,
      leadAlt,
      callbackCountLeaders,
      callbackCountFollowers,
      alternateCountLeaders,
      alternateCountFollowers,
      settings
    );
    const followResults = calculateHeatResults(
      followHeat,
      competitors,
      scores,
      judgingStyle,
      followCB,
      followAlt,
      callbackCountLeaders,
      callbackCountFollowers,
      alternateCountLeaders,
      alternateCountFollowers,
      settings
    );
    return [...leadResults, ...followResults];
  }

  // 1. Identify judged units (Individuals or Couples)
  let units: Competitor[] = [];

  if (heat.role === "Mixed") {
    // Couples mode
    const couples = heat.couples || [];
    units = couples.map((couple) => {
      const lead = competitors.find((c) => c.bib === couple.leadBib);
      const follow = competitors.find((c) => c.bib === couple.followBib);
      
      const leadName = lead ? lead.name : `Lead #${couple.leadBib}`;
      const followName = follow ? follow.name : `Follow #${couple.followBib}`;
      
      return {
        bib: couple.id,
        name: `${leadName} & ${followName}`,
        division: heat.division,
        role: "Lead", // virtual role
        checkedIn: true,
        scratched: (lead?.scratched || follow?.scratched) || false
      };
    });
  } else {
    // Individual competitors mode
    const heatCompetitorBibs = heat.competitorBibs;
    units = competitors.filter((c) => heatCompetitorBibs.includes(c.bib));
  }

  // Filter out any scratched competitors/units
  units = units.filter((u) => !u.scratched);

  // Chief Judge options for this side, set per contest on the Scoring Ledger
  const chiefJudgeName = settings?.chiefJudgeName || "Chief Judge";
  const contestOptions = settings?.contestOptions?.[heat.id];
  const chiefShownOption = heat.role === "Follow" ? contestOptions?.chiefShownFollowers : contestOptions?.chiefShownLeaders;
  const isChiefWeighted = (heat.role === "Follow" ? contestOptions?.chiefWeightFollowers : contestOptions?.chiefWeightLeaders) !== false;
  const isChiefIncluded = contestOptions?.includeChiefScores !== false;
  const chiefTieOrder = contestOptions?.chiefTieOrder || [];

  // Get scores for this heat
  const heatScores = scores.filter((s) => s.heatId === heat.id);

  // Identify expected judges based on settings
  let expectedJudgeIds: string[] = [];
  if (settings) {
    const defaultNames = ["Judge A", "Judge B", "Judge C", "Judge D", "Judge E"];
    const defaultRoles = ["None", "None", "None", "None", "None"];
    const names = settings.judgeNames || defaultNames;
    const roles = settings.judgeRoles || defaultRoles;
    const chiefRole = settings.chiefJudgeRole || "Both";

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
      const role = roles[idx] || "None";
      if (isRoleExpected(role)) {
        expectedJudgeIds.push(name);
      }
    });

    if (isRoleExpected(chiefRole)) {
      expectedJudgeIds.push(chiefJudgeName);
    }
  }

  // Identify all unique judges who have submitted scores
  const activeJudges = Array.from(new Set(heatScores.map((s) => s.judgeId))).sort();
  const judges = (expectedJudgeIds.length > 0) ? expectedJudgeIds : activeJudges;

  // 2. Pre-calculate individual judge placements for each judge
  // For a given judge, rank their scores: highest raw score = 1st, or in
  // placement judging the score already is the rank, so lowest = 1st.
  const judgePlacements: { [judgeId: string]: { [bib: string]: number } } = {};

  judges.forEach((judgeId) => {
    judgePlacements[judgeId] = {};
    const judgeRecords = heatScores.filter((s) => s.judgeId === judgeId);
    
    const sortedRecords = judgingStyle === "placement"
      ? judgeRecords.filter((s) => s.score > 0).sort((a, b) => a.score - b.score)
      : [...judgeRecords].sort((a, b) => b.score - a.score);
    sortedRecords.forEach((record, index) => {
      judgePlacements[judgeId][record.competitorBib] = index + 1;
    });
  });

  const compareBibs = (a: CompetitorResult, b: CompetitorResult): number =>
    a.competitor.bib.localeCompare(b.competitor.bib, undefined, { numeric: true });

  // Scores the sheet with or without the Chief Judge. Only scores rank dancers:
  // those they can't separate share a rank, and bib order just lists them.
  const scoreUnits = (isChiefCounted: boolean): CompetitorResult[] => {
    const doesChiefBreakTies = isChiefCounted && isChiefWeighted;

    // 3. Map units to their results
    const results: CompetitorResult[] = units.map((unit) => {
      const compScores = heatScores.filter((s) => s.competitorBib === unit.bib && (isChiefCounted || s.judgeId !== chiefJudgeName));

      const scoresByJudge: { [judgeId: string]: { score: number; isCallback: string; placement: number } } = {};
      let totalScore = 0;
      let scoreCount = 0;
      const countedPlacements: number[] = [];
      let yesCount = 0;
      let alt1Count = 0;
      let alt2Count = 0;
      let alt3Count = 0;
      let noCount = 0;

      // Initialize with empty scores (in callback mode, default to 'No')
      judges.filter((judgeId) => isChiefCounted || judgeId !== chiefJudgeName).forEach((judgeId) => {
        scoresByJudge[judgeId] = {
          score: 0,
          isCallback: judgingStyle === "callback" ? "No" : "-",
          placement: 999
        };
      });

      compScores.forEach((s) => {
        const calcPlacement = judgePlacements[s.judgeId]?.[unit.bib] || 999;
        scoresByJudge[s.judgeId] = {
          score: s.score,
          isCallback: s.isCallback,
          placement: calcPlacement
        };
      });

      // Aggregate totals and counts from resolved scoresByJudge
      Object.keys(scoresByJudge).forEach((judgeId) => {
        const s = scoresByJudge[judgeId];
        if (s.score > 0) {
          totalScore += s.score;
          scoreCount++;
        }

        if (s.placement < 999) countedPlacements.push(s.placement);

        if (s.isCallback === "Yes") yesCount++;
        else if (s.isCallback === "Alt 1" || s.isCallback === "Alternate" as any) alt1Count++;
        else if (s.isCallback === "Alt 2") alt2Count++;
        else if (s.isCallback === "Alt 3") alt3Count++;
        else if (s.isCallback === "No") noCount++;
      });

      const averageScore = scoreCount > 0 ? Number((totalScore / scoreCount).toFixed(2)) : 0;
      const averagePlacement = countedPlacements.length > 0
        ? Number((countedPlacements.reduce((sum, p) => sum + p, 0) / countedPlacements.length).toFixed(2))
        : 999;

      const resObj: CompetitorResult = {
        competitor: unit,
        scoresByJudge,
        averageScore,
        averagePlacement,
        yesCount,
        altCount: alt1Count + alt2Count + alt3Count,
        alt1Count,
        alt2Count,
        alt3Count,
        noCount,
        countedPlacements,
        rank: 999, // to be calculated
        qualified: false, // to be calculated
        isChiefCounted
      };
      resObj.prelimPoints = getPrelimPoints(resObj);
      return resObj;
    });

    // The Chief Judge's order for dancers their scores couldn't separate.
    const compareChiefDecision = (a: CompetitorResult, b: CompetitorResult): number => {
      const orderA = chiefTieOrder.indexOf(a.competitor.bib);
      const orderB = chiefTieOrder.indexOf(b.competitor.bib);
      if (orderA === orderB) return 0;
      if (orderA === -1) return 1;
      if (orderB === -1) return -1;
      return orderA - orderB;
    };

    // Section 5: the outcome for callbacks is the sum of point values across
    // judges; once that's tied, the Chief Judge's score breaks the tie. Shared
    // by the "callback" style's own sort and the callback cut computed below.
    const getChiefCallbackValue = (r: CompetitorResult): number => {
      const chief = r.scoresByJudge[chiefJudgeName];
      if (!chief) return 0;
      return judgingStyle === "raw" ? chief.score : CALLBACK_POINTS[chief.isCallback] || 0;
    };
    const compareByCallbackPoints = (a: CompetitorResult, b: CompetitorResult): number => {
      const ptsA = a.prelimPoints || 0;
      const ptsB = b.prelimPoints || 0;
      if (ptsB !== ptsA) {
        return ptsB - ptsA;
      }
      if (doesChiefBreakTies) {
        const chiefA = getChiefCallbackValue(a);
        const chiefB = getChiefCallbackValue(b);
        if (chiefB !== chiefA) return chiefB - chiefA;
      }
      return compareChiefDecision(a, b);
    };

    // 4. Compare results based on the chosen judging style
    const compareResults = (a: CompetitorResult, b: CompetitorResult): number => {
      if (judgingStyle === "callback") {
        // Callbacks: rank by point total, Chief Judge score breaks ties (Section 5)
        return compareByCallbackPoints(a, b);
      }
      if (judgingStyle === "placement") {
        // Placements: WSDC Relative Placement (Majority) ranking system
        if (a.countedPlacements.length > 0 && b.countedPlacements.length > 0) {
          const cmp = compareWSDCPlacement(a.countedPlacements, b.countedPlacements);
          if (cmp !== 0) return cmp;
        }
        if (a.averagePlacement !== b.averagePlacement) {
          return a.averagePlacement - b.averagePlacement;
        }
        if (doesChiefBreakTies) {
          const chiefA = a.scoresByJudge[chiefJudgeName]?.placement ?? 999;
          const chiefB = b.scoresByJudge[chiefJudgeName]?.placement ?? 999;
          if (chiefA !== chiefB) return chiefA - chiefB;
        }
        return compareChiefDecision(a, b);
      }
      // Raw scores: higher average is better (e.g. 95.5 is best)
      if (b.averageScore !== a.averageScore) {
        return b.averageScore - a.averageScore;
      }
      // Tie breaker 1: average placement (lower is better)
      if (a.averagePlacement !== b.averagePlacement) {
        return a.averagePlacement - b.averagePlacement;
      }
      if (doesChiefBreakTies) {
        const chiefA = a.scoresByJudge[chiefJudgeName]?.score || 0;
        const chiefB = b.scoresByJudge[chiefJudgeName]?.score || 0;
        if (chiefA !== chiefB) return chiefB - chiefA;
      }
      return compareChiefDecision(a, b);
    };

    results.sort((a, b) => compareResults(a, b) || compareBibs(a, b));

    // Assign ranks: dancers scores can't separate share one
    results.forEach((res, index) => {
      const previous = results[index - 1];
      res.rank = previous && compareResults(previous, res) === 0 ? previous.rank : index + 1;
    });

    // 5. Calculate Callback Rankings (for prelim rounds) using point-based ranking
    const callbackRankedResults = [...results].sort((a, b) => compareByCallbackPoints(a, b) || compareBibs(a, b));

    // A tie across a cut line can't be decided here: scores don't separate those
    // dancers, so none of them is placed either side of the line.
    const tiedBibs = new Map<string, number>();
    [callbackCount, callbackCount + alternateCount].forEach((line) => {
      if (line <= 0 || line >= callbackRankedResults.length) return;
      if (compareByCallbackPoints(callbackRankedResults[line - 1], callbackRankedResults[line]) !== 0) return;
      let start = line - 1;
      while (start > 0 && compareByCallbackPoints(callbackRankedResults[start - 1], callbackRankedResults[start]) === 0) start--;
      for (let i = start; i < callbackRankedResults.length; i++) {
        if (compareByCallbackPoints(callbackRankedResults[start], callbackRankedResults[i]) !== 0) break;
        tiedBibs.set(callbackRankedResults[i].competitor.bib, start);
      }
    });

    // Mark qualified competitors based on callback settings
    callbackRankedResults.forEach((res, index) => {
      const mainRes = results.find((r) => r.competitor.bib === res.competitor.bib);
      if (mainRes) {
        const tieGroup = tiedBibs.get(res.competitor.bib);
        mainRes.tieGroup = tieGroup;
        mainRes.qualified = tieGroup === undefined && index < callbackCount;
        mainRes.isAlternate = tieGroup === undefined && index >= callbackCount && index < (callbackCount + alternateCount);
        if (mainRes.isAlternate) {
          mainRes.alternateRank = index - callbackCount + 1;
        } else {
          mainRes.alternateRank = undefined;
        }
      }
    });

    return results;
  };

  // A side uses all of the Chief Judge's scores or none of them. They're needed
  // when fewer than two other judges score the side (one judge alone can't be
  // the whole panel), or when the other judges tie. Manual toggles override that.
  const hasChiefScores = heatScores.some((s) => s.judgeId === chiefJudgeName && units.some((u) => u.bib === s.competitorBib));
  if (!hasChiefScores || !isChiefIncluded || chiefShownOption === false) return scoreUnits(false);
  const otherJudgeCount = judges.filter((judgeId) => judgeId !== chiefJudgeName).length;
  if (chiefShownOption === true || otherJudgeCount < 2) return scoreUnits(true);

  const withoutChief = scoreUnits(false);
  const isTieOpen = heat.heatType === "Finals"
    ? withoutChief.some((r, index) => index > 0 && withoutChief[index - 1].rank === r.rank)
    : withoutChief.some((r) => r.tieGroup !== undefined);
  return isChiefWeighted && isTieOpen ? scoreUnits(true) : withoutChief;
}

export function getContestOptions(settings: AppSettings | undefined, heatId: string): ContestOptions {
  return settings?.contestOptions?.[heatId] || {};
}

export interface ContestOutcome {
  results: CompetitorResult[];
  judgeIds: string[]; // judges shown on the sheet
  judgingStyle: JudgingStyle;
  chiefJudgeName: string;
  callbackCount: number;
  alternateCount: number;
  callbackCountLeaders?: number;
  callbackCountFollowers?: number;
  alternateCountLeaders?: number;
  alternateCountFollowers?: number;
}

// A contest's results as shown on the Scoring Ledger and Results Terminal. A
// completed contest uses the judging style, quotas and roster frozen when it
// was completed, not whatever the live settings have since moved on to.
export function getContestOutcome(heat: Heat, competitors: Competitor[], scores: ScoreRecord[], settings: AppSettings): ContestOutcome {
  const completed = (settings.completedResults || []).find((c) => c.heatId === heat.id);
  const config = completed?.configSnapshot;
  const contestSettings: AppSettings = config
    ? {
        ...settings,
        judgeNames: config.judgeNames ?? settings.judgeNames,
        judgeRoles: config.judgeRoles ?? settings.judgeRoles,
        chiefJudgeName: config.chiefJudgeName ?? settings.chiefJudgeName,
        chiefJudgeRole: config.chiefJudgeRole ?? settings.chiefJudgeRole
      }
    : settings;
  const judgingStyle = completed?.judgingStyle || settings.judgingStyle || "raw";
  const callbackCountLeaders = config ? config.callbackCountLeaders : settings.callbackCountLeaders;
  const callbackCountFollowers = config ? config.callbackCountFollowers : settings.callbackCountFollowers;
  const alternateCountLeaders = config ? config.alternateCountLeaders : settings.alternateCountLeaders;
  const alternateCountFollowers = config ? config.alternateCountFollowers : settings.alternateCountFollowers;
  const baseCallbackCount = config ? config.callbackCount : (settings.callbackCount || 5);
  const baseAlternateCount = config ? config.alternateCount : (settings.alternateCount ?? 2);
  const callbackCount = heat.role === "Lead"
    ? (callbackCountLeaders ?? baseCallbackCount)
    : heat.role === "Follow"
      ? (callbackCountFollowers ?? baseCallbackCount)
      : baseCallbackCount;
  const alternateCount = heat.role === "Lead"
    ? (alternateCountLeaders ?? baseAlternateCount)
    : heat.role === "Follow"
      ? (alternateCountFollowers ?? baseAlternateCount)
      : baseAlternateCount;

  const results = calculateHeatResults(
    heat,
    competitors,
    scores,
    judgingStyle,
    callbackCount,
    alternateCount,
    callbackCountLeaders,
    callbackCountFollowers,
    alternateCountLeaders,
    alternateCountFollowers,
    contestSettings
  );

  const chiefJudgeName = contestSettings.chiefJudgeName || "Chief Judge";
  const judgeIds = Array.from(new Set(scores.filter((s) => s.heatId === heat.id).map((s) => s.judgeId)))
    .filter((judgeId) => results.some((r) => r.scoresByJudge[judgeId]))
    .sort();

  return {
    results,
    judgeIds,
    judgingStyle,
    chiefJudgeName,
    callbackCount,
    alternateCount,
    callbackCountLeaders,
    callbackCountFollowers,
    alternateCountLeaders,
    alternateCountFollowers
  };
}

// Non-Finals rounds are listed callbacks first, then anyone tied at a cut line,
// then alternates, then cuts.
export const CUT_GROUP_LABELS = ["Callbacks", "Tied", "Alternates", "Cut"];
export function getCutGroup(res: { qualified?: boolean; isAlternate?: boolean; tieGroup?: number }): number {
  return res.qualified ? 0 : res.tieGroup !== undefined ? 1 : res.isAlternate ? 2 : 3;
}

// Each side's callback quota for a judge's sheet. The Chief Judge scores both
// sides of a Leaders+Followers round on one sheet, and each side keeps its own.
export interface SheetQuota<T> {
  side: "Lead" | "Follow" | null;
  competitors: T[];
  callbackCount: number;
  alternateCount: number;
}

export function getSheetQuotas<T extends { role: "Lead" | "Follow" }>(heat: Heat, sheet: T[], settings: AppSettings): SheetQuota<T>[] {
  const callbackCountFor = (side: "Lead" | "Follow") =>
    (side === "Lead" ? settings.callbackCountLeaders : settings.callbackCountFollowers) ?? settings.callbackCount;
  const alternateCountFor = (side: "Lead" | "Follow") =>
    (side === "Lead" ? settings.alternateCountLeaders : settings.alternateCountFollowers) ?? (settings.alternateCount || 0);

  if (heat.role === "Mixed" && !isCouplesHeat(heat)) {
    return (["Lead", "Follow"] as const)
      .filter((side) => sheet.some((c) => c.role === side))
      .map((side) => ({
        side,
        competitors: sheet.filter((c) => c.role === side),
        callbackCount: callbackCountFor(side),
        alternateCount: alternateCountFor(side)
      }));
  }
  return [{
    side: null,
    competitors: sheet,
    callbackCount: heat.role === "Mixed" ? settings.callbackCount : callbackCountFor(heat.role),
    alternateCount: heat.role === "Mixed" ? (settings.alternateCount || 0) : alternateCountFor(heat.role)
  }];
}

// Whether a sheet side's marks meet its quota: exact callbacks, one of each alternate.
export function checkSheetQuota<T extends { bib: string }>(quota: SheetQuota<T>, getCallback: (bib: string) => string | undefined) {
  const marks = quota.competitors.map((c) => getCallback(c.bib));
  const yesCount = marks.filter((m) => m === "Yes").length;
  const altCount = marks.filter((m) => m && m !== "No" && m !== "Yes").length;
  const areAltsSatisfied = [1, 2, 3].every((r) => marks.filter((m) => m === `Alt ${r}`).length === (r <= quota.alternateCount ? 1 : 0));
  return { yesCount, altCount, areAltsSatisfied, isMet: yesCount === quota.callbackCount && areAltsSatisfied };
}

// Whether a dancer's name is redacted by the contest's name options. Their bib
// and scores stay visible either way.
export function isResultNameHidden(res: CompetitorResult, options: ContestOptions, isFinals: boolean, judgingStyle: JudgingStyle): boolean {
  const isCut = !isFinals && getCutGroup(res) === 3;
  const isAllNo = judgingStyle === "callback" && res.yesCount === 0 && res.altCount === 0;
  return (!!options.hideCutNames && isCut) || (!!options.hideAllNoNames && isAllNo);
}

// Determine the exact set of competitors (or virtual couple units) a given judge
// role sees for a heat -- shared between the Judge Portal (so a judge's own
// sheet lines up with what the app expects of them) and the Admin Panel's
// Judges tab (so the live "who has/hasn't submitted" view matches exactly).
export function getJudgeHeatCompetitors(
  heat: Heat,
  allCompetitors: Competitor[],
  judgeRole: "Leaders" | "Followers" | "Finals" | "Both" | "None"
): Competitor[] {
  const competitors = projectCompetitorsForHeat(allCompetitors, heat);
  const rawHeatCompetitors = heat.competitorBibs
    .map((bib) => {
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

        if (isCouplesHeat(heat) || judgeRole === "Both") {
          const leadName = lead ? lead.name : `Lead #${leadBib}`;
          const followName = follow ? follow.name : `Follow #${followBib}`;
          return {
            bib,
            name: `${leadName} & ${followName}`,
            division: heat.division,
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
            division: heat.division,
            role: "Lead" as const,
            checkedIn: true
          } as Competitor;
        }
      }
      return undefined;
    })
    .filter((c): c is Competitor => !!c);

  const isHeatFinals = isCouplesHeat(heat);
  // Preserve the heat's own competitor order (matches the Floor Coordinator check-in sheet)
  // instead of re-sorting by bib, so a heat split lines up identically on both sheets.
  const baseHeatCompetitors = rawHeatCompetitors;

  return baseHeatCompetitors.filter((c) => {
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
}

// Official WSCA Section 5 callback point values (Yes=10, Alt1=4.5, Alt2=4.3,
// Alt3=4.2, No=0) -- see the "Callback System for Preliminary Competitions"
// reference. The outcome for callbacks is the sum of these values across judges.
const CALLBACK_POINTS: Record<string, number> = { Yes: 10, "Alt 1": 4.5, Alternate: 4.5, "Alt 2": 4.3, "Alt 3": 4.2, No: 0 };

export function getPrelimPoints(res: Partial<CompetitorResult>): number {
  if (!res.scoresByJudge) return 0;
  let totalPoints = 0;
  Object.keys(res.scoresByJudge).forEach((judgeId) => {
    totalPoints += CALLBACK_POINTS[res.scoresByJudge[judgeId].isCallback] || 0;
  });
  return totalPoints;
}

export function compareWSDCPlacement(aPlacements: number[], bPlacements: number[]): number {
  const numJudges = aPlacements.length;
  if (numJudges === 0) return 0;
  const majorityCount = Math.floor(numJudges / 2) + 1;

  const maxRank = Math.max(...aPlacements, ...bPlacements, 20);

  for (let r = 1; r <= maxRank; r++) {
    const countA = aPlacements.filter(p => p <= r).length;
    const countB = bPlacements.filter(p => p <= r).length;

    const hasMajA = countA >= majorityCount;
    const hasMajB = countB >= majorityCount;

    if (hasMajA && !hasMajB) {
      return -1;
    }
    if (!hasMajA && hasMajB) {
      return 1;
    }
    if (hasMajA && hasMajB) {
      if (countA !== countB) {
        return countB - countA;
      }
      const sumA = aPlacements.filter(p => p <= r).reduce((sum, p) => sum + p, 0);
      const sumB = bPlacements.filter(p => p <= r).reduce((sum, p) => sum + p, 0);
      if (sumA !== sumB) {
        return sumA - sumB;
      }
    }
  }

  return 0;
}
