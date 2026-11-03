// Security Rules: what a browser can and can't do directly against Firestore.
import { readFileSync } from "fs";
import { after, before, beforeEach, test } from "node:test";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";

const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080").split(":");
const A = "community-a";
const B = "community-b";
const LIVE_HEAT = "heat-live";
const PUBLISHED_HEAT = "heat-published";
const HIDDEN_HEAT = "heat-hidden";

let env: RulesTestEnvironment;

const device = (communityId: string | null, roles: string[] = [], extra: object = {}) => {
  const context = communityId
    ? env.authenticatedContext(`device-${communityId}-${roles.join("-")}`, { communityId, roles, epoch: 1, ...extra })
    : env.unauthenticatedContext();
  return context.firestore();
};

const score = (heatId: string, judgeId: string, bib = "1") => ({
  id: `${encodeURIComponent(judgeId)}__${bib}`,
  judgeId,
  heatId,
  competitorBib: bib,
  score: 90,
  isCallback: "Yes",
  timestamp: 1
});
const scorePath = (communityId: string, s: ReturnType<typeof score>) =>
  `communities/${communityId}/heats/${s.heatId}/scores/${s.id}`;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "swingscore-rules-test",
    firestore: { host, port: Number(port), rules: readFileSync("firestore.rules", "utf-8") }
  });
});

after(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    for (const id of [A, B]) {
      await setDoc(doc(db, `communities/${id}`), { name: id, status: "active", sessionEpoch: 1 });
      await setDoc(doc(db, `communities/${id}/settings/main`), {
        currentHeatId: LIVE_HEAT,
        isPublished: false,
        publishedHeatIds: [PUBLISHED_HEAT]
      });
      await setDoc(doc(db, `communities/${id}/competitors/1`), { bib: "1", name: "Jules" });
      await setDoc(doc(db, `communities/${id}/competitorPrivate/1`), { email: "jules@example.com" });
      await setDoc(doc(db, `communities/${id}/results/r1`), { id: "r1" });
      await setDoc(doc(db, `communities/${id}/private/auth`), { gatewayCode: "ABCD2345" });
      for (const heatId of [LIVE_HEAT, PUBLISHED_HEAT, HIDDEN_HEAT]) {
        await setDoc(doc(db, `communities/${id}/heats/${heatId}`), { id: heatId });
        const s = score(heatId, "Judge A");
        await setDoc(doc(db, scorePath(id, s)), s);
      }
    }
    await setDoc(doc(db, "gatewayCodes/ABCD2345"), { communityId: A });
  });
});

const scoresOf = (db: any, communityId: string, heatId: string) =>
  getDocs(collection(db, `communities/${communityId}/heats/${heatId}/scores`));

test("a device with no gateway reads nothing", async () => {
  const db = device(null);
  await assertFails(getDoc(doc(db, `communities/${A}`)));
  await assertFails(getDoc(doc(db, `communities/${A}/settings/main`)));
  await assertFails(getDocs(collection(db, `communities/${A}/competitors`)));
  await assertFails(scoresOf(db, A, PUBLISHED_HEAT));
});

test("a device can't read another community, even as Admin", async () => {
  const db = device(A, ["admin"]);
  await assertSucceeds(getDoc(doc(db, `communities/${A}/settings/main`)));
  await assertFails(getDoc(doc(db, `communities/${B}`)));
  await assertFails(getDoc(doc(db, `communities/${B}/settings/main`)));
  await assertFails(getDocs(collection(db, `communities/${B}/competitors`)));
  await assertFails(getDocs(collection(db, `communities/${B}/heats`)));
  await assertFails(scoresOf(db, B, PUBLISHED_HEAT));
});

test("a device can't write scores into another community", async () => {
  const s = score(LIVE_HEAT, "Judge A");
  await assertFails(setDoc(doc(device(A, ["admin"]), scorePath(B, s)), s));
  await assertFails(setDoc(doc(device(A, ["judge"], { judgeName: "Judge A" }), scorePath(B, s)), s));
});

test("server-only documents can't be read by anyone", async () => {
  const db = device(A, ["admin"]);
  await assertFails(getDoc(doc(db, `communities/${A}/private/auth`)));
  await assertFails(getDoc(doc(db, "gatewayCodes/ABCD2345")));
  await assertFails(getDoc(doc(db, "gatewaySlugs/westies-k3f9mp")));
  await assertFails(getDoc(doc(db, "rateLimits/anything")));
});

test("public devices read the roster but not emails or unpublished scores", async () => {
  const db = device(A);
  await assertSucceeds(getDocs(collection(db, `communities/${A}/competitors`)));
  await assertSucceeds(getDocs(collection(db, `communities/${A}/results`)));
  await assertFails(getDocs(collection(db, `communities/${A}/competitorPrivate`)));
  await assertSucceeds(scoresOf(db, A, PUBLISHED_HEAT));
  await assertFails(scoresOf(db, A, HIDDEN_HEAT));
  await assertFails(scoresOf(db, A, LIVE_HEAT));
});

test("the live contest's scores open to the public only while shown", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), `communities/${A}/settings/main`), {
      currentHeatId: LIVE_HEAT,
      isPublished: true,
      publishedHeatIds: []
    });
  });
  const db = device(A);
  await assertSucceeds(scoresOf(db, A, LIVE_HEAT));
  await assertFails(scoresOf(db, A, PUBLISHED_HEAT));
});

test("staff read unpublished scores, and only some staff read emails", async () => {
  await assertSucceeds(scoresOf(device(A, ["scoring"]), A, HIDDEN_HEAT));
  await assertSucceeds(scoresOf(device(A, ["judge"]), A, HIDDEN_HEAT));
  await assertSucceeds(getDocs(collection(device(A, ["coordinator"]), `communities/${A}/competitorPrivate`)));
  await assertFails(getDocs(collection(device(A, ["judge"]), `communities/${A}/competitorPrivate`)));
});

test("Registration staff read emails but not unpublished scores", async () => {
  const db = device(A, ["competitor"]);
  await assertSucceeds(getDocs(collection(db, `communities/${A}/competitorPrivate`)));
  await assertSucceeds(scoresOf(db, A, PUBLISHED_HEAT));
  await assertFails(scoresOf(db, A, HIDDEN_HEAT));
});

test("only Admin and Scoring read spreadsheet saves, and nobody writes them", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), `communities/${A}/sheetJobs/h1`), { heatId: "h1", status: "saved" });
  });
  const path = `communities/${A}/sheetJobs/h1`;
  await assertSucceeds(getDoc(doc(device(A, ["scoring"]), path)));
  await assertSucceeds(getDoc(doc(device(A, ["admin"]), path)));
  await assertFails(getDoc(doc(device(A, ["judge"]), path)));
  await assertFails(getDoc(doc(device(A), path)));
  await assertFails(setDoc(doc(device(A, ["admin"]), path), { status: "saved" }));
  await assertFails(getDoc(doc(device(A, ["admin"]), `communities/${A}/private/integrations`)));
});

test("a judge writes only their own scores", async () => {
  const db = device(A, ["judge"], { judgeName: "Judge A" });
  const mine = score(LIVE_HEAT, "Judge A", "2");
  const theirs = score(LIVE_HEAT, "Judge B", "2");
  await assertSucceeds(setDoc(doc(db, scorePath(A, mine)), mine));
  await assertFails(setDoc(doc(db, scorePath(A, theirs)), theirs));
});

test("a judge who hasn't claimed a name can't score", async () => {
  const s = score(LIVE_HEAT, "Judge A", "2");
  await assertFails(setDoc(doc(device(A, ["judge"]), scorePath(A, s)), s));
});

test("Admin can score for any judge, for the simulator", async () => {
  const s = score(LIVE_HEAT, "Judge B", "2");
  await assertSucceeds(setDoc(doc(device(A, ["admin"]), scorePath(A, s)), s));
});

test("non-judges can't score", async () => {
  const s = score(LIVE_HEAT, "Judge A", "2");
  await assertFails(setDoc(doc(device(A), scorePath(A, s)), s));
  await assertFails(setDoc(doc(device(A, ["coordinator"]), scorePath(A, s)), s));
  await assertFails(setDoc(doc(device(A, ["scoring"]), scorePath(A, s)), s));
});

test("a placement sheet saves each couple's raw score, or a blank", async () => {
  const db = device(A, ["judge"], { judgeName: "Judge A" });
  const ranked = { ...score(LIVE_HEAT, "Judge A", "2_7"), score: 1, isCallback: "92.5" };
  const unranked = { ...score(LIVE_HEAT, "Judge A", "1_9"), score: 2, isCallback: "" };
  await assertSucceeds(setDoc(doc(db, scorePath(A, ranked)), ranked));
  await assertSucceeds(setDoc(doc(db, scorePath(A, unranked)), unranked));
});

test("a malformed score is rejected", async () => {
  const db = device(A, ["judge"], { judgeName: "Judge A" });
  const s = score(LIVE_HEAT, "Judge A", "2");
  await assertFails(setDoc(doc(db, scorePath(A, s)), { ...s, score: "90" }));
  await assertFails(setDoc(doc(db, scorePath(A, s)), { ...s, isCallback: "Maybe" }));
  await assertFails(setDoc(doc(db, scorePath(A, s)), { ...s, isCallback: 90 }));
  await assertFails(setDoc(doc(db, scorePath(A, s)), { ...s, heatId: HIDDEN_HEAT }));
  await assertFails(setDoc(doc(db, scorePath(A, s)), { ...s, extra: true }));
});

test("browsers can't write anything except scores", async () => {
  const db = device(A, ["admin"]);
  await assertFails(setDoc(doc(db, `communities/${A}`), { name: "x", status: "active", sessionEpoch: 9 }));
  await assertFails(setDoc(doc(db, `communities/${A}/settings/main`), { isPublished: true }));
  await assertFails(setDoc(doc(db, `communities/${A}/competitors/9`), { bib: "9" }));
  await assertFails(setDoc(doc(db, `communities/${A}/heats/heat-x`), { id: "heat-x" }));
  await assertFails(setDoc(doc(db, `communities/${A}/results/r2`), { id: "r2" }));
  await assertFails(setDoc(doc(db, `communities/${A}/private/auth`), { gatewayCode: "X" }));
});

test("raising the session epoch shuts out older devices", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), `communities/${A}`), { name: A, status: "active", sessionEpoch: 2 });
  });
  await assertFails(getDoc(doc(device(A, ["admin"]), `communities/${A}/settings/main`)));
  const db = device(A, ["admin"], { epoch: 2 });
  await assertSucceeds(getDoc(doc(db, `communities/${A}/settings/main`)));
});

test("a locked community can't be used", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), `communities/${A}`), { name: A, status: "locked", sessionEpoch: 1 });
  });
  const s = score(LIVE_HEAT, "Judge A", "2");
  const db = device(A, ["admin"]);
  await assertFails(getDoc(doc(db, `communities/${A}/settings/main`)));
  await assertFails(setDoc(doc(db, scorePath(A, s)), s));
});
