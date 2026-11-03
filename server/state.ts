import type { Response } from "express";
import type { Transaction } from "firebase-admin/firestore";
import type { AppSettings, AppState, CompletedContestResult, Competitor, Heat, HeatEntryStatus, ScoreRecord } from "../src/types";
import { getScoreDocId, toDocId } from "../src/utils/ids";
import { buildRegisteredCouples, getEntrantSides, isActiveInHeat, isPartneredContest } from "../src/utils/partners";
import { adminDb } from "./firebaseAdmin";

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export function sendError(res: Response, error: unknown) {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message, code: error.code });
    return;
  }
  console.error("Unexpected API error", error);
  res.status(500).json({ error: "Something went wrong. Please try again." });
}

// A brand new gateway, and what /api/clear-all returns a community to.
export function blankSettings(): AppSettings {
  return {
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
    contestOptions: {},
    judgeNames: ["Judge A", "Judge B", "Judge C", "Judge D", "Judge E"],
    judgeRoles: ["None", "None", "None", "None", "None"],
    chiefJudgeName: "Chief Judge",
    chiefJudgeRole: "Both",
    lockedDivisions: [],
    queuedCheckInFinalized: false,
    completedResults: [],
    claimedJudges: [],
    contestConfigLocked: false,
    nextContestConfigLocked: false
  };
}

export function setHeatStatus(c: Competitor, heatId: string, change: HeatEntryStatus) {
  const status = { ...(c.heatStatus?.[heatId] || {}) };
  if (change.checkedIn !== undefined) status.checkedIn = !!change.checkedIn;
  if (change.scratched !== undefined) status.scratched = !!change.scratched;
  c.heatStatus = { ...(c.heatStatus || {}), [heatId]: status };
}

// Data saved before check-in became per contest kept one status per dancer
// that applied to whichever heat was live; carry it onto every existing heat.
function migrateHeatStatus(state: AppState) {
  state.competitors.forEach((c) => {
    if (c.heatStatus) return;
    c.heatStatus = {};
    if (c.checkedIn || c.scratched) {
      state.heats.forEach((h) => {
        c.heatStatus![h.id] = { checkedIn: !!c.checkedIn, scratched: !!c.scratched };
      });
    }
  });
}

export function autoPopulateHeats(state: AppState) {
  state.heats.forEach((heat) => {
    if (heat.isCustom) return; // Skip custom heats to preserve manual admin modifications
    const isActive = (c: Competitor) => isActiveInHeat(c, heat.id);

    const div = heat.division;

    // Partnered contests are always danced with the registered partner.
    if (isPartneredContest(heat.contestType)) {
      const { couples } = buildRegisteredCouples(state.competitors, heat.contestType!, div, isActive);
      heat.role = "Mixed";
      heat.couples = couples;
      heat.competitorBibs = couples.map((c) => c.id);
      return;
    }

    // Jack & Jill: everyone with an entry (first or second) in this division,
    // on the side they entered it.
    const sides = getEntrantSides(state.competitors.filter(isActive), "Jack & Jill", div);
    const leads = [...sides].filter(([, side]) => side === "Lead").map(([bib]) => bib);
    const follows = [...sides].filter(([, side]) => side === "Follow").map(([bib]) => bib);

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

const communityRef = (communityId: string) => adminDb.collection("communities").doc(communityId);

const compareBibs = (a: Competitor, b: Competitor) => a.bib.localeCompare(b.bib, undefined, { numeric: true });

// Scores live under their contest, so most writes don't need to read them:
// "all" loads every contest's scores, a list loads just those contests.
type ScoreScope = "all" | string[] | undefined;

async function loadState(tx: Transaction, communityId: string, scope: ScoreScope): Promise<AppState> {
  const root = communityRef(communityId);
  const [settingsDoc, competitorDocs, privateDocs, heatDocs, resultDocs] = await Promise.all([
    tx.get(root.collection("settings").doc("main")),
    tx.get(root.collection("competitors")),
    tx.get(root.collection("competitorPrivate")),
    tx.get(root.collection("heats")),
    tx.get(root.collection("results"))
  ]);

  const emails = new Map(privateDocs.docs.map((d) => [d.id, d.data().email as string]));
  const competitors = competitorDocs.docs
    .map((d) => ({ ...d.data(), ...(emails.has(d.id) ? { email: emails.get(d.id) } : {}) }) as Competitor)
    .sort(compareBibs);
  const heats = heatDocs.docs.map((d) => d.data() as Heat);
  const completedResults = resultDocs.docs
    .map((d) => d.data() as CompletedContestResult & { order: number })
    .sort((a, b) => a.order - b.order)
    .map(({ order, ...result }) => result);

  const scoreHeatIds = scope === "all" ? heats.map((h) => h.id) : scope || [];
  const scoreDocs = await Promise.all(
    scoreHeatIds.map((heatId) => tx.get(root.collection("heats").doc(toDocId(heatId)).collection("scores")))
  );
  const scores = scoreDocs.flatMap((snapshot) => snapshot.docs.map((d) => d.data() as ScoreRecord));

  const settings = (settingsDoc.data() as AppSettings | undefined) || blankSettings();
  return { competitors, heats, scores, settings: { ...settings, completedResults } };
}

// Every Firestore document a state is stored as, keyed by path. Firestore can't
// hold `undefined`, so values go through JSON the way data.json always did.
function toDocuments(communityId: string, state: AppState): Map<string, Record<string, unknown>> {
  const root = `communities/${communityId}`;
  const docs = new Map<string, Record<string, unknown>>();
  const add = (path: string, value: object) => docs.set(path, JSON.parse(JSON.stringify(value)));

  const { completedResults = [], ...settings } = state.settings;
  add(`${root}/settings/main`, settings);
  state.competitors.forEach(({ email, ...competitor }) => {
    const id = toDocId(competitor.bib);
    add(`${root}/competitors/${id}`, competitor);
    // Emails sit in their own staff-only collection; dancers can read the roster.
    if (email) add(`${root}/competitorPrivate/${id}`, { email });
  });
  state.heats.forEach((heat) => add(`${root}/heats/${toDocId(heat.id)}`, heat));
  completedResults.forEach((result, order) => add(`${root}/results/${toDocId(result.id)}`, { ...result, order }));
  state.scores.forEach((score) => {
    const id = getScoreDocId(score.judgeId, score.competitorBib);
    add(`${root}/heats/${toDocId(score.heatId)}/scores/${id}`, { ...score, id });
  });
  return docs;
}

// Firestore doesn't keep map keys in the order they were written.
const stableStringify = (value: unknown): string =>
  JSON.stringify(value, (_, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v
  );

// Runs one change to a community's data as a Firestore transaction, writing
// only the documents that changed. Firestore retries the transaction if another
// write gets in first, so `mutate` can run more than once and must only touch
// `state`. Throw HttpError to abandon the change.
export function withCommunityState<T>(
  communityId: string,
  mutate: (state: AppState) => T,
  { scores }: { scores?: ScoreScope } = {}
): Promise<T> {
  return adminDb.runTransaction(async (tx) => {
    const state = await loadState(tx, communityId, scores);
    const before = toDocuments(communityId, state);

    migrateHeatStatus(state);
    autoPopulateHeats(state);
    const result = mutate(state);
    autoPopulateHeats(state);

    const after = toDocuments(communityId, state);
    after.forEach((data, path) => {
      const previous = before.get(path);
      if (!previous || stableStringify(previous) !== stableStringify(data)) {
        tx.set(adminDb.doc(path), data);
      }
    });
    before.forEach((_, path) => {
      if (!after.has(path)) tx.delete(adminDb.doc(path));
    });
    return result;
  });
}

// A consistent look at a community's data that doesn't hold up anyone's writes.
export function readCommunityState(communityId: string, scores: ScoreScope): Promise<AppState> {
  return adminDb.runTransaction((tx) => loadState(tx, communityId, scores), { readOnly: true });
}

// A settings-only change, which doesn't need the rest of the community's data.
// Judges claiming names and finalizing sheets go through here, so a busy roster
// can't hold them up.
export function withCommunitySettings<T>(communityId: string, mutate: (settings: AppSettings) => T): Promise<T> {
  const ref = communityRef(communityId).collection("settings").doc("main");
  return adminDb.runTransaction(async (tx) => {
    const settings = ((await tx.get(ref)).data() as AppSettings | undefined) || blankSettings();
    const result = mutate(settings);
    tx.set(ref, JSON.parse(JSON.stringify(settings)));
    return result;
  });
}

// Writes a whole state at once: a new gateway, or an import from data.json.
export async function saveCommunityState(communityId: string, state: AppState) {
  migrateHeatStatus(state);
  autoPopulateHeats(state);
  const writer = adminDb.bulkWriter();
  toDocuments(communityId, state).forEach((data, path) => {
    writer.set(adminDb.doc(path), data);
  });
  await writer.close();
}
