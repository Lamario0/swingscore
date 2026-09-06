import { Competitor, ScoreRecord, Heat, AppSettings } from "../types";

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
  rank: number;
  qualified: boolean;
  isAlternate?: boolean;
  alternateRank?: number;
  majorityCalculatedRank?: number; // WSDC relative placement rank
}

export function calculateHeatResults(
  heat: Heat,
  competitors: Competitor[],
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
  // If Mixed heat and NOT Finals, calculate results separately for Leaders and Followers
  if (heat.role === "Mixed" && heat.heatType !== "Finals") {
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

  // Get scores for this heat
  const heatScores = scores.filter((s) => s.heatId === heat.id);

  // Identify expected judges based on settings
  let expectedJudgeIds: string[] = [];
  if (settings) {
    const defaultNames = ["Judge A", "Judge B", "Judge C", "Judge D", "Judge E"];
    const defaultRoles = ["None", "None", "None", "None", "None"];
    const names = settings.judgeNames || defaultNames;
    const roles = settings.judgeRoles || defaultRoles;
    const chiefName = settings.chiefJudgeName || "Chief Judge";
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
      expectedJudgeIds.push(chiefName);
    }
  }

  // Identify all unique judges who have submitted scores
  const activeJudges = Array.from(new Set(heatScores.map((s) => s.judgeId))).sort();
  const judges = (expectedJudgeIds.length > 0) ? expectedJudgeIds : activeJudges;

  // 2. Pre-calculate individual judge placements for each judge
  // For a given judge, rank all their scores descending (highest score = 1st, 2nd, etc.)
  const judgePlacements: { [judgeId: string]: { [bib: string]: number } } = {};

  judges.forEach((judgeId) => {
    judgePlacements[judgeId] = {};
    const judgeRecords = heatScores.filter((s) => s.judgeId === judgeId);
    
    // Sort descending by score
    const sortedRecords = [...judgeRecords].sort((a, b) => b.score - a.score);
    sortedRecords.forEach((record, index) => {
      judgePlacements[judgeId][record.competitorBib] = index + 1;
    });
  });

  // 3. Map units to their results
  let results: CompetitorResult[] = units.map((unit) => {
    const compScores = heatScores.filter((s) => s.competitorBib === unit.bib);
    
    const scoresByJudge: { [judgeId: string]: { score: number; isCallback: string; placement: number } } = {};
    let totalScore = 0;
    let scoreCount = 0;
    let totalPlacement = 0;
    let placementCount = 0;
    let yesCount = 0;
    let alt1Count = 0;
    let alt2Count = 0;
    let alt3Count = 0;
    let noCount = 0;

    // Initialize with empty scores (in callback mode, default to 'No')
    judges.forEach((judgeId) => {
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

      if (s.placement < 999) {
        totalPlacement += s.placement;
        placementCount++;
      }

      if (s.isCallback === "Yes") yesCount++;
      else if (s.isCallback === "Alt 1" || s.isCallback === "Alternate" as any) alt1Count++;
      else if (s.isCallback === "Alt 2") alt2Count++;
      else if (s.isCallback === "Alt 3") alt3Count++;
      else if (s.isCallback === "No") noCount++;
    });

    const averageScore = scoreCount > 0 ? Number((totalScore / scoreCount).toFixed(2)) : 0;
    const averagePlacement = placementCount > 0 ? Number((totalPlacement / placementCount).toFixed(2)) : 999;

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
      rank: 999, // to be calculated
      qualified: false // to be calculated
    };
    resObj.prelimPoints = getPrelimPoints(resObj);
    return resObj;
  });

  // Section 5: the outcome for callbacks is the sum of point values across
  // judges; only once that's tied does the Chief Judge's own (raw) score break
  // the tie. Shared by both the "callback" style's own sort and the
  // callback-cut ranking computed below regardless of style.
  const chiefJudgeNameForTiebreak = settings?.chiefJudgeName || "Chief Judge";
  const compareByCallbackPoints = (a: CompetitorResult, b: CompetitorResult): number => {
    const ptsA = a.prelimPoints || 0;
    const ptsB = b.prelimPoints || 0;
    if (ptsB !== ptsA) {
      return ptsB - ptsA;
    }
    const chiefScoreA = a.scoresByJudge[chiefJudgeNameForTiebreak]?.score || 0;
    const chiefScoreB = b.scoresByJudge[chiefJudgeNameForTiebreak]?.score || 0;
    if (chiefScoreB !== chiefScoreA) {
      return chiefScoreB - chiefScoreA;
    }
    return a.competitor.bib.localeCompare(b.competitor.bib, undefined, { numeric: true });
  };

  // 4. Sort results based on the chosen judging style
  if (judgingStyle === "placement") {
    // Placements: WSDC Relative Placement (Majority) ranking system
    results.sort((a, b) => {
      const placementsA = Object.values(a.scoresByJudge).map(s => s.placement).filter(p => p < 999);
      const placementsB = Object.values(b.scoresByJudge).map(s => s.placement).filter(p => p < 999);
      
      if (placementsA.length > 0 && placementsB.length > 0) {
        const cmp = compareWSDCPlacement(placementsA, placementsB);
        if (cmp !== 0) return cmp;
      }

      if (a.averagePlacement !== b.averagePlacement) {
        return a.averagePlacement - b.averagePlacement;
      }
      // Tie breaker 1: average score (higher is better)
      if (b.averageScore !== a.averageScore) {
        return b.averageScore - a.averageScore;
      }
      // Fallback: bib sorting
      return a.competitor.bib.localeCompare(b.competitor.bib, undefined, { numeric: true });
    });
  } else if (judgingStyle === "callback") {
    // Callbacks: rank by point total, Chief Judge score breaks ties (Section 5)
    results.sort(compareByCallbackPoints);
  } else {
    // Raw scores: higher average is better (e.g. 95.5 is best)
    results.sort((a, b) => {
      if (b.averageScore !== a.averageScore) {
        return b.averageScore - a.averageScore;
      }
      // Tie breaker 1: average placement (lower is better)
      if (a.averagePlacement !== b.averagePlacement) {
        return a.averagePlacement - b.averagePlacement;
      }
      // Fallback: bib sorting
      return a.competitor.bib.localeCompare(b.competitor.bib, undefined, { numeric: true });
    });
  }

  // Assign ranks
  results.forEach((res, index) => {
    res.rank = index + 1;
  });

  // 5. Calculate Callback Rankings (for prelim rounds) using point-based ranking
  const callbackRankedResults = [...results].sort(compareByCallbackPoints);

  // Mark qualified competitors based on callback settings
  callbackRankedResults.forEach((res, index) => {
    const mainRes = results.find((r) => r.competitor.bib === res.competitor.bib);
    if (mainRes) {
      mainRes.qualified = index < callbackCount;
      mainRes.isAlternate = index >= callbackCount && index < (callbackCount + alternateCount);
      if (mainRes.isAlternate) {
        mainRes.alternateRank = index - callbackCount + 1;
      } else {
        mainRes.alternateRank = undefined;
      }
    }
  });

  return results;
}

// Determine the exact set of competitors (or virtual couple units) a given judge
// role sees for a heat -- shared between the Judge Portal (so a judge's own
// sheet lines up with what the app expects of them) and the Admin Panel's
// Judges tab (so the live "who has/hasn't submitted" view matches exactly).
export function getJudgeHeatCompetitors(
  heat: Heat,
  competitors: Competitor[],
  judgeRole: "Leaders" | "Followers" | "Finals" | "Both" | "None"
): Competitor[] {
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

        const isFinals = heat.heatType === "Finals" || heat.name.includes("Finals");

        if (isFinals || judgeRole === "Both") {
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

  const isHeatFinals = heat.heatType === "Finals" || heat.name.includes("Finals");
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
export function getPrelimPoints(res: Partial<CompetitorResult>): number {
  if (!res.scoresByJudge) return 0;
  let totalPoints = 0;
  Object.keys(res.scoresByJudge).forEach((judgeId) => {
    const val = res.scoresByJudge[judgeId].isCallback;
    if (val === "Yes") totalPoints += 10;
    else if (val === "Alt 1" || val === "Alternate") totalPoints += 4.5;
    else if (val === "Alt 2") totalPoints += 4.3;
    else if (val === "Alt 3") totalPoints += 4.2;
    else if (val === "No") totalPoints += 0;
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
