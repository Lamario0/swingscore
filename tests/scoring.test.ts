// Only scores rank dancers: never the order they were saved or stored in, or bib.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { AppSettings, Competitor, Heat, ScoreRecord } from "../src/types";
import { formatRelativePlacements, getContestOutcome } from "../src/utils/calculations";

const competitors: Competitor[] = ["1", "2", "3"].map((bib) => ({
  bib, name: `Dancer ${bib}`, division: "Novice", role: "Lead", checkedIn: true, heatStatus: { h: { checkedIn: true } }
}));

const heat: Heat = {
  id: "h", name: "Novice Finals", division: "Novice", role: "Lead", competitorBibs: ["1", "2", "3"],
  heatType: "Finals", contestType: "Jack & Jill", isCustom: true
};

const settings = (judgingStyle: AppSettings["judgingStyle"]): AppSettings => ({
  currentHeatId: "h",
  judgingStyle,
  callbackCount: 1,
  alternateCount: 0,
  judgeNames: ["Judge A", "Judge B"],
  judgeRoles: ["Finals", "Finals"],
  chiefJudgeName: "Chief Judge",
  chiefJudgeRole: "None"
});

const score = (judgeId: string, competitorBib: string, value: number): ScoreRecord => ({
  id: `${judgeId}-${competitorBib}`, judgeId, heatId: "h", competitorBib, score: value, isCallback: "Yes", timestamp: 1
});

const ranks = (scores: ScoreRecord[], style: AppSettings["judgingStyle"]) =>
  Object.fromEntries(
    getContestOutcome(heat, competitors, scores, settings(style)).results.map((r) => [r.competitor.bib, r.rank])
  );

test("equal raw scores tie, whichever order they were saved in", () => {
  const scores = [
    score("Judge A", "1", 80), score("Judge A", "2", 80), score("Judge A", "3", 70),
    score("Judge B", "1", 90), score("Judge B", "2", 90), score("Judge B", "3", 60)
  ];
  const expected = { "1": 1, "2": 1, "3": 3 };
  assert.deepEqual(ranks(scores, "raw"), expected);
  assert.deepEqual(ranks([...scores].reverse(), "raw"), expected);
});

test("the order scores were saved in never changes a raw result", () => {
  const scores = [
    score("Judge A", "1", 85), score("Judge A", "2", 85), score("Judge A", "3", 85),
    score("Judge B", "1", 95), score("Judge B", "2", 75), score("Judge B", "3", 85)
  ];
  assert.deepEqual(ranks(scores, "raw"), ranks([...scores].reverse(), "raw"));
});

test("placement judging still ranks lowest number first", () => {
  const scores = [
    score("Judge A", "1", 3), score("Judge A", "2", 1), score("Judge A", "3", 2),
    score("Judge B", "1", 3), score("Judge B", "2", 1), score("Judge B", "3", 2)
  ];
  assert.deepEqual(ranks(scores, "placement"), { "2": 1, "3": 2, "1": 3 });
});

// Bib 1 has the higher average, but most judges placed bib 2 first.
const splitScores = [
  score("Judge A", "1", 100), score("Judge A", "2", 70),
  score("Judge B", "1", 60), score("Judge B", "2", 70),
  score("Chief Judge", "1", 60), score("Chief Judge", "2", 70)
];
const rawPanel: AppSettings = { ...settings("raw"), chiefJudgeRole: "Finals" };

test("a raw-scored Finals goes to the judges' majority, not the higher average", () => {
  const { results } = getContestOutcome(heat, competitors, splitScores, rawPanel);
  assert.deepEqual(results.map((r) => [r.competitor.bib, r.rank]).slice(0, 2), [["2", 1], ["1", 2]]);
});

test("a raw-scored Prelim still ranks by average", () => {
  const prelim: Heat = { ...heat, name: "Novice Prelim", heatType: "Prelim" };
  const { results } = getContestOutcome(prelim, competitors, splitScores, { ...rawPanel, judgeRoles: ["Leaders", "Leaders"], chiefJudgeRole: "Leaders" });
  assert.deepEqual(results.map((r) => [r.competitor.bib, r.rank]).slice(0, 2), [["1", 1], ["2", 2]]);
});

test("in a Finals the Chief Judge counts like any judge and settles the tie", () => {
  const panel: AppSettings = { ...rawPanel, judgeNames: ["Judge A"], judgeRoles: ["Finals"] };
  const scores = [
    score("Judge A", "1", 81.25), score("Judge A", "2", 78.25),
    score("Chief Judge", "1", 79), score("Chief Judge", "2", 81.25)
  ];
  const results = getContestOutcome(heat, competitors, scores, panel).results.filter((r) => r.competitor.bib !== "3");
  assert.deepEqual(results.map((r) => [r.competitor.bib, r.rank]), [["2", 1], ["1", 2]]);
  assert.ok(results.every((r) => r.isTieSettledByChief && r.isChiefCounted));
});

// A leaders prelim judged on Yes/No/Alt by Judge A and the Chief Judge.
const prelim: Heat = { ...heat, name: "Novice Prelim", heatType: "Prelim" };
const prelimPanel = (chiefJudgeRole: AppSettings["chiefJudgeRole"], callbackCount = 1): AppSettings => ({
  ...settings("callback"), judgeNames: ["Judge A"], judgeRoles: ["Leaders"], chiefJudgeRole, callbackCount
});
const mark = (judgeId: string, competitorBib: string, isCallback: ScoreRecord["isCallback"]): ScoreRecord =>
  ({ ...score(judgeId, competitorBib, 0), isCallback });
const disagreement = [
  mark("Judge A", "1", "Yes"), mark("Judge A", "2", "Alt 1"), mark("Judge A", "3", "No"),
  mark("Chief Judge", "1", "No"), mark("Chief Judge", "2", "Yes"), mark("Chief Judge", "3", "No")
];
const order = (results: { competitor: { bib: string }; rank: number }[]) =>
  [...results].sort((a, b) => a.rank - b.rank).map((r) => r.competitor.bib);

test("a Chief Judge on both sides never overrules a judge whose scores don't tie", () => {
  const { results } = getContestOutcome(prelim, competitors, disagreement, prelimPanel("Both"));
  assert.deepEqual(order(results), ["1", "2", "3"]);
  assert.ok(results.every((r) => !r.isTieSettledByChief && !r.isChiefCounted));
});

test("a Chief Judge given one side counts like any judge on it", () => {
  const { results } = getContestOutcome(prelim, competitors, disagreement, prelimPanel("Leaders"));
  assert.deepEqual(order(results), ["2", "1", "3"]);
  assert.ok(results.every((r) => r.isChiefCounted));
});

test("a Chief Judge on both sides settles a tie and leaves everyone else in place", () => {
  const scores = [
    mark("Judge A", "1", "Yes"), mark("Judge A", "2", "No"), mark("Judge A", "3", "No"),
    mark("Chief Judge", "1", "No"), mark("Chief Judge", "2", "No"), mark("Chief Judge", "3", "Yes")
  ];
  const { results } = getContestOutcome(prelim, competitors, scores, prelimPanel("Both", 2));
  assert.deepEqual(order(results), ["1", "3", "2"]);
  assert.deepEqual(results.filter((r) => r.qualified).map((r) => r.competitor.bib).sort(), ["1", "3"]);
  assert.deepEqual(results.filter((r) => r.isTieSettledByChief).map((r) => r.competitor.bib).sort(), ["2", "3"]);
  // Their marks show on the sheet but stay out of the points.
  assert.equal(results.find((r) => r.competitor.bib === "3")!.prelimPoints, 0);
});

test("the Chief Judge's scores count when nobody else judges that side", () => {
  const dancers: Competitor[] = [
    ...competitors,
    ...["4", "5"].map((bib) => ({ bib, name: `Dancer ${bib}`, division: "Novice", role: "Follow" as const, checkedIn: true, heatStatus: { h: { checkedIn: true } } }))
  ];
  const prelim: Heat = { ...heat, name: "Novice Prelim", heatType: "Prelim", role: "Mixed", competitorBibs: ["1", "2", "4", "5"] };
  const panel: AppSettings = { ...settings("raw"), judgeNames: ["Judge A"], judgeRoles: ["Leaders"], chiefJudgeRole: "Both" };
  const scores = [
    score("Judge A", "1", 90), score("Judge A", "2", 80),
    score("Chief Judge", "1", 70), score("Chief Judge", "2", 95),
    score("Chief Judge", "4", 60), score("Chief Judge", "5", 85)
  ];
  const { results } = getContestOutcome(prelim, dancers, scores, panel);
  const rankOf = (bib: string) => results.find((r) => r.competitor.bib === bib)!.rank;
  // Leaders follow Judge A alone; followers have only the Chief Judge.
  assert.deepEqual([rankOf("1"), rankOf("2")], [1, 2]);
  assert.deepEqual([rankOf("5"), rankOf("4")], [1, 2]);

  const withoutChief = getContestOutcome(prelim, dancers, scores, { ...panel, contestOptions: { h: { includeChiefScores: false } } });
  assert.ok(withoutChief.results.filter((r) => r.competitor.role === "Follow").every((r) => r.rank === 1));
});

test("relative placements list each judge's placement, best first", () => {
  assert.equal(formatRelativePlacements([2, 1, 1]), "1-1-2");
  assert.equal(formatRelativePlacements([]), "—");
});
