import type { AppState, CompletedContestResult, Heat } from "../../src/types";
import { CompetitorResult, formatPlacement, formatRelativePlacements, getContestOutcome, getCutGroup } from "../../src/utils/calculations";
import { getDisplayBib, isCouplesHeat, showsBibs } from "../../src/utils/partners";

export type SheetCell = string | number;
export type SheetRow = SheetCell[];

export const SUMMARY_TAB = "Summary";
export const SUMMARY_HEADER = ["Date/Time", "Event", "Contest", "Division", "Contest Type", "Round", "Status", "Contest ID"];
export const SUMMARY_ID_COLUMN = SUMMARY_HEADER.length - 1;

export interface ContestSheet {
  heatId: string;
  title: string;
  rows: SheetRow[];
  headerRows: number[]; // 0-based rows to show in bold
  summaryRow: SheetRow;
}

const STYLE_LABELS = { raw: "Raw Score", placement: "Placement", callback: "Callback" };

// Both Google Sheets and Excel refuse these characters in a tab name.
export const toTabTitle = (name: string, maxLength: number) =>
  name.replace(/[[\]*?:/\\]/g, "-").trim().slice(0, maxLength).trim() || "Contest";

function getJudgeMark(result: CompetitorResult, judgeId: string, judgingStyle: string): SheetCell {
  const mark = result.scoresByJudge[judgeId];
  if (!mark) return "";
  if (judgingStyle === "callback") return mark.isCallback === "-" ? "" : mark.isCallback;
  if (judgingStyle === "placement") return mark.placement < 999 ? formatPlacement(mark.placement) : "";
  return mark.score > 0 ? mark.score : "";
}

function getOutcomeLabel(result: CompetitorResult): string {
  if (result.qualified) return "Callback";
  if (result.tieGroup !== undefined) return "Tied";
  return result.isAlternate ? `Alt ${result.alternateRank}` : "Cut";
}

function getTieBreakLabel(result: CompetitorResult): string {
  if (result.isTieSettledByChief) return "Chief Judge";
  return result.tieGroup !== undefined ? "Unresolved" : "";
}

// One contest as a spreadsheet tab. This is the organizer's record, so it shows
// every name even where the public Results Terminal hides them. The figures come
// from the same engine as every other screen, so the sheet can't disagree with it.
export function buildContestSheet(contest: CompletedContestResult, heat: Heat, state: AppState): ContestSheet {
  const outcome = getContestOutcome(heat, state.competitors, state.scores, state.settings);
  const { judgeIds, judgingStyle } = outcome;
  const isFinals = contest.heatType === "Finals";
  const hasBibs = showsBibs(heat.contestType);
  const hasSides = heat.role === "Mixed" && !isCouplesHeat(heat);
  const dateTime = contest.completedAt || contest.timestamp;
  const event = contest.eventName || "";
  const contestType = heat.contestType || "Jack & Jill";

  const details: SheetRow[] = [
    ["Contest", contest.name],
    ["Date/Time", dateTime],
    ["Event", event],
    ["Division", contest.division],
    ["Contest Type", contestType],
    ["Round", contest.heatType],
    ["Judging", STYLE_LABELS[judgingStyle]],
    ["Judges", judgeIds.join(", ")]
  ];
  if (!isFinals) {
    const count = (value: number, noun: string) => `${value} ${noun}${value === 1 ? "" : "s"}`;
    const quota = (callbacks: number | undefined, alternates: number | undefined) =>
      `${count(callbacks ?? outcome.callbackCount, "callback")}, ${count(alternates ?? outcome.alternateCount, "alternate")}`;
    if (hasSides) {
      details.push(["Leaders", quota(outcome.callbackCountLeaders, outcome.alternateCountLeaders)]);
      details.push(["Followers", quota(outcome.callbackCountFollowers, outcome.alternateCountFollowers)]);
    } else {
      details.push(["Callbacks", quota(outcome.callbackCount, outcome.alternateCount)]);
    }
  }

  const totals: { label: string; value: (r: CompetitorResult) => SheetCell }[] = isFinals
    ? [
        { label: "Relative Placement", value: (r) => formatRelativePlacements(r.countedPlacements) },
        ...(judgingStyle === "raw" ? [{ label: "Average", value: (r: CompetitorResult) => r.averageScore }] : [])
      ]
    : judgingStyle === "callback"
      ? [{ label: "Callback Points", value: (r) => r.prelimPoints ?? 0 }]
      : [{ label: "Average", value: (r) => r.averageScore }];

  const tableHeader: SheetRow = [
    isFinals ? "Place" : "Result",
    ...(hasBibs ? ["Bib"] : []),
    "Name",
    ...judgeIds,
    ...totals.map((total) => total.label),
    "Tie-Break"
  ];

  const toRow = (r: CompetitorResult): SheetRow => [
    isFinals ? formatPlacement(r.rank) : getOutcomeLabel(r),
    ...(hasBibs ? [getDisplayBib(r.competitor.bib, heat.contestType)] : []),
    r.competitor.name,
    ...judgeIds.map((judgeId) => getJudgeMark(r, judgeId, judgingStyle)),
    ...totals.map((total) => total.value(r)),
    getTieBreakLabel(r)
  ];

  const ordered = [...outcome.results].sort((a, b) =>
    (isFinals ? 0 : getCutGroup(a) - getCutGroup(b)) || a.rank - b.rank
  );
  const sections = hasSides
    ? [
        { title: "Leaders", results: ordered.filter((r) => r.competitor.role === "Lead") },
        { title: "Followers", results: ordered.filter((r) => r.competitor.role === "Follow") }
      ]
    : [{ title: null, results: ordered }];

  const rows: SheetRow[] = [...details];
  const headerRows: number[] = [];
  sections.forEach((section) => {
    rows.push([]);
    if (section.title) {
      headerRows.push(rows.length);
      rows.push([section.title]);
    }
    headerRows.push(rows.length);
    rows.push(tableHeader);
    section.results.forEach((result) => rows.push(toRow(result)));
  });

  return {
    heatId: contest.heatId,
    title: contest.name,
    rows,
    headerRows,
    summaryRow: [dateTime, event, contest.name, contest.division, contestType, contest.heatType, "Published", contest.heatId]
  };
}
