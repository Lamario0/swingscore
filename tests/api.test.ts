// The API against the local emulators: gateway access, roles, and that data stored
// in Firestore behaves the way the portals expect.
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { after, before, test } from "node:test";
import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInWithCustomToken, type Auth } from "firebase/auth";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "../server/firebaseAdmin";
import { createApp } from "../server/app";
import { createCommunity } from "../server/gateway";
import { withCommunityState } from "../server/state";
import type { AppState } from "../src/types";

let server: Server;
let baseUrl = "";
let deviceCount = 0;

const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST!;

class Device {
  auth: Auth;
  constructor() {
    this.auth = getAuth(initializeApp({ apiKey: "test", projectId: "swingscore-ab034" }, `device-${deviceCount++}`));
    connectAuthEmulator(this.auth, `http://${authHost}`, { disableWarnings: true });
  }

  async call(path: string, body: object = {}, method = "POST") {
    const token = await this.auth.currentUser?.getIdToken();
    const res = await fetch(baseUrl + path, {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(method === "POST" ? { body: JSON.stringify(body) } : {})
    });
    return { status: res.status, data: await res.json() as any };
  }

  async ok(path: string, body: object = {}, method = "POST") {
    const result = await this.call(path, body, method);
    assert.equal(result.status, 200, `${path}: ${JSON.stringify(result.data)}`);
    if (result.data.token) await signInWithCustomToken(this.auth, result.data.token);
    return result.data;
  }

  connect = (code: string) => this.ok("/api/gateway/connect", { code });
  login = (role: string, passcode: string) => this.ok("/api/gateway/role-login", { role, passcode });
}

const readState = (communityId: string, scores: "all" = "all") =>
  withCommunityState(communityId, (state) => JSON.parse(JSON.stringify(state)) as AppState, { scores });

const dancer = (bib: string, name: string, role = "Lead") => ({
  bib, name, email: `${name}@example.com`, division: "Novice", role
});

before(async () => {
  await new Promise<void>((resolve) => {
    server = createApp().listen(0, "127.0.0.1", () => {
      baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;
      resolve();
    });
  });
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await adminDb.terminate();
});

test("a portal link connects a device without the gateway code", async () => {
  const community = await createCommunity("Western Michigan Westies");
  assert.match(community.slug, /^western-michigan-westies-[a-z0-9]{6}$/);

  const device = new Device();
  assert.equal((await device.call("/api/gateway/connect-link", { slug: "no-such-link" })).status, 404);
  await device.ok("/api/gateway/connect-link", { slug: community.slug });
  const { claims } = await device.auth.currentUser!.getIdTokenResult();
  assert.equal(claims.communityId, community.communityId);
  assert.equal(claims.linkSlug, community.slug);
  assert.deepEqual(claims.roles, []);

  // The link alone opens no staff portal.
  assert.equal((await device.call("/api/settings", { isPublished: true })).status, 403);
  assert.equal((await device.call("/api/gateway/role-login", { role: "judge", passcode: "wrong" })).status, 403);
  await device.login("judge", community.passcodes.judge);
});

test("an Admin keeps their roles when opening their own link", async () => {
  const community = await createCommunity("Own Link Test");
  const other = await createCommunity("Other Community");
  const admin = new Device();
  await admin.connect(community.gatewayCode);
  await admin.login("admin", community.passcodes.admin);

  await admin.ok("/api/gateway/connect-link", { slug: community.slug });
  let { claims } = await admin.auth.currentUser!.getIdTokenResult(true);
  assert.deepEqual(claims.roles, ["admin"]);

  // Another community's link is a fresh start, with no roles carried across.
  await admin.ok("/api/gateway/connect-link", { slug: other.slug });
  ({ claims } = await admin.auth.currentUser!.getIdTokenResult(true));
  assert.equal(claims.communityId, other.communityId);
  assert.deepEqual(claims.roles, []);
});

test("only the Admin can read portal links and passcodes, and never the gateway code", async () => {
  const community = await createCommunity("Access Test");
  const judge = new Device();
  await judge.connect(community.gatewayCode);
  await judge.login("judge", community.passcodes.judge);
  assert.equal((await judge.call("/api/gateway/portal-access", {}, "GET")).status, 403);

  const admin = new Device();
  await admin.connect(community.gatewayCode);
  await admin.login("admin", community.passcodes.admin);
  const access = await admin.ok("/api/gateway/portal-access", {}, "GET");
  assert.equal(access.slug, community.slug);
  assert.deepEqual(access.passcodes, community.passcodes);
  assert.ok(!JSON.stringify(access).includes(community.gatewayCode.replace("-", "")));

  await admin.ok("/api/gateway/passcode", { role: "judge", passcode: "newjudge1" });
  assert.equal((await admin.ok("/api/gateway/portal-access", {}, "GET")).passcodes.judge, "newjudge1");
});

test("an older gateway gets a link, and passcodes fill in as people sign in", async () => {
  const community = await createCommunity("Older Gateway");
  const authPath = `communities/${community.communityId}/private/auth`;
  await adminDb.doc(authPath).update({ slug: FieldValue.delete(), readablePasscodes: FieldValue.delete() });
  await adminDb.doc(`gatewaySlugs/${community.slug}`).delete();

  const admin = new Device();
  await admin.connect(community.gatewayCode);
  await admin.login("admin", community.passcodes.admin);
  const access = await admin.ok("/api/gateway/portal-access", {}, "GET");
  assert.deepEqual(access.passcodes, { admin: community.passcodes.admin });

  const device = new Device();
  await device.ok("/api/gateway/connect-link", { slug: access.slug });
  await device.login("judge", community.passcodes.judge);
  assert.equal((await admin.ok("/api/gateway/portal-access", {}, "GET")).passcodes.judge, community.passcodes.judge);
});

test("a new gateway code replaces the portal links too", async () => {
  const community = await createCommunity("Rotate Test");
  const admin = new Device();
  await admin.connect(community.gatewayCode);
  await admin.login("admin", community.passcodes.admin);
  await admin.ok("/api/gateway/rotate-code");

  const { slug } = await admin.ok("/api/gateway/portal-access", {}, "GET");
  assert.notEqual(slug, community.slug);
  const device = new Device();
  assert.equal((await device.call("/api/gateway/connect-link", { slug: community.slug })).status, 404);
  await device.ok("/api/gateway/connect-link", { slug });
});

test("failed attempts are counted per device address behind Hosting", async () => {
  const connect = (address: string) => fetch(`${baseUrl}/api/gateway/connect`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Fastly-Client-IP": address },
    body: JSON.stringify({ code: "NOPE-NOPE" })
  });
  for (let i = 0; i < 30; i++) assert.equal((await connect("203.0.113.1")).status, 404);
  assert.equal((await connect("203.0.113.1")).status, 429);
  assert.equal((await connect("203.0.113.2")).status, 404);
});

test("a wrong gateway code is refused and a right one connects", async () => {
  const community = await createCommunity("Connect Test");
  const device = new Device();
  const wrong = await device.call("/api/gateway/connect", { code: "NOPE-NOPE" });
  assert.equal(wrong.status, 404);
  await device.connect(community.gatewayCode.toLowerCase());
  const { claims } = await device.auth.currentUser!.getIdTokenResult();
  assert.equal(claims.communityId, community.communityId);
  assert.deepEqual(claims.roles, []);
});

test("requests need a session, and roles need the right passcode", async () => {
  const community = await createCommunity("Role Test");
  const anonymous = new Device();
  assert.equal((await anonymous.call("/api/register", dancer("1", "Ann"))).status, 401);

  const device = new Device();
  await device.connect(community.gatewayCode);
  assert.equal((await device.call("/api/heats/delete", { heatId: "x" })).status, 403);
  assert.equal((await device.call("/api/gateway/role-login", { role: "admin", passcode: "wrong" })).status, 403);
  assert.equal((await device.call("/api/gateway/role-login", { role: "admin", passcode: community.passcodes.judge })).status, 403);

  await device.login("admin", community.passcodes.admin);
  await device.login("judge", community.passcodes.judge);
  const { claims } = await device.auth.currentUser!.getIdTokenResult(true);
  assert.deepEqual(claims.roles, ["admin", "judge"]);
});

test("each portal can only reach its own routes and settings", async () => {
  const community = await createCommunity("Permissions Test");
  const coordinator = new Device();
  await coordinator.connect(community.gatewayCode);
  await coordinator.login("coordinator", community.passcodes.coordinator);
  const scoring = new Device();
  await scoring.connect(community.gatewayCode);
  await scoring.login("scoring", community.passcodes.scoring);
  const judge = new Device();
  await judge.connect(community.gatewayCode);
  await judge.login("judge", community.passcodes.judge);

  assert.equal((await scoring.call("/api/check-in", { bib: "1" })).status, 403);
  assert.equal((await judge.call("/api/settings", { isPublished: true })).status, 403);
  assert.equal((await coordinator.call("/api/settings", { isPublished: true })).status, 403);
  assert.equal((await scoring.call("/api/settings", { isPublished: true })).status, 403);
  assert.equal((await coordinator.call("/api/reset")).status, 403);

  await coordinator.ok("/api/settings", { queuedCheckInFinalized: true });
  await scoring.ok("/api/settings", { publishedHeatIds: ["heat-1"] });
});

test("two communities stay apart, even with the same bibs", async () => {
  const [a, b] = await Promise.all([createCommunity("Alpha"), createCommunity("Beta")]);
  const alpha = new Device();
  await alpha.connect(a.gatewayCode);
  const beta = new Device();
  await beta.connect(b.gatewayCode);

  await alpha.login("competitor", a.passcodes.competitor);
  await beta.login("competitor", b.passcodes.competitor);
  await alpha.ok("/api/register", dancer("1", "AlphaDancer"));
  await beta.ok("/api/register", dancer("1", "BetaDancer"));

  assert.deepEqual((await readState(a.communityId)).competitors.map((c) => c.name), ["AlphaDancer"]);
  assert.deepEqual((await readState(b.communityId)).competitors.map((c) => c.name), ["BetaDancer"]);

  // A request can't aim at another community: it's taken from the token alone.
  await alpha.login("admin", a.passcodes.admin);
  await alpha.ok("/api/clear-all", { communityId: b.communityId });
  assert.equal((await readState(a.communityId)).competitors.length, 0);
  assert.equal((await readState(b.communityId)).competitors.length, 1);
});

test("emails are stored apart from the roster", async () => {
  const community = await createCommunity("Email Test");
  const device = new Device();
  await device.connect(community.gatewayCode);
  await device.login("competitor", community.passcodes.competitor);
  await device.ok("/api/register", dancer("7", "Ann"));

  const root = adminDb.collection("communities").doc(community.communityId);
  assert.equal((await root.collection("competitors").doc("7").get()).data()!.email, undefined);
  assert.equal((await root.collection("competitorPrivate").doc("7").get()).data()!.email, "Ann@example.com");
  assert.equal((await readState(community.communityId)).competitors[0].email, "Ann@example.com");
});

test("only the Registration passcode can add or edit a registration", async () => {
  const community = await createCommunity("Registration Access Test");
  const device = new Device();
  await device.connect(community.gatewayCode);

  assert.equal((await device.call("/api/register", dancer("1", "Ann"))).status, 403);
  assert.equal((await device.call("/api/register/samples", { division: "Novice" })).status, 403);
  assert.equal((await device.call("/api/competitor/update", { oldBib: "1", newBib: "2", role: "Lead", division: "Novice" })).status, 403);

  await device.login("competitor", community.passcodes.competitor);
  await device.ok("/api/register", dancer("1", "Ann"));
  await device.ok("/api/competitor/update", { oldBib: "1", newBib: "1", name: "Anne", role: "Lead", division: "Novice" });
  assert.equal((await readState(community.communityId)).competitors[0].name, "Anne");

  assert.equal((await device.call("/api/check-in", { bib: "1" })).status, 403);
  assert.equal((await device.call("/api/heats/delete", { heatId: "x" })).status, 403);
  assert.equal((await device.call("/api/settings", { registrationEnabled: false })).status, 403);
});

test("sample dancers are 5 leaders and 5 followers on unused bibs", async () => {
  const community = await createCommunity("Sample Test");
  const device = new Device();
  await device.connect(community.gatewayCode);
  await device.login("competitor", community.passcodes.competitor);
  await device.ok("/api/register", dancer("100", "Ann"));

  await device.ok("/api/register/samples", { division: "Intermediate" });
  await device.ok("/api/register/samples", { division: "Intermediate" });

  const { competitors } = await readState(community.communityId);
  const samples = competitors.filter((c) => c.name.startsWith("Sample "));
  assert.equal(samples.length, 20);
  assert.equal(samples.filter((c) => c.role === "Lead").length, 10);
  assert.equal(samples.filter((c) => c.role === "Follow").length, 10);
  assert.ok(samples.every((c) => c.division === "Intermediate"));
  assert.equal(new Set(competitors.map((c) => c.bib)).size, 21);
  assert.equal(new Set(samples.map((c) => c.name)).size, 20);
  assert.equal(samples[0].bib, "101");
});

test("sample dancers respect closed registration", async () => {
  const community = await createCommunity("Sample Closed Test");
  const admin = new Device();
  await admin.connect(community.gatewayCode);
  await admin.login("admin", community.passcodes.admin);
  await admin.ok("/api/settings", { registrationEnabled: false });
  assert.equal((await admin.call("/api/register/samples", { division: "Novice" })).status, 403);
  assert.equal((await readState(community.communityId)).competitors.length, 0);
});

test("registration still enforces closed registration and duplicate bibs", async () => {
  const community = await createCommunity("Registration Test");
  const admin = new Device();
  await admin.connect(community.gatewayCode);
  await admin.login("admin", community.passcodes.admin);

  await admin.ok("/api/register", dancer("1", "Ann"));
  assert.equal((await admin.call("/api/register", dancer("1", "Bea"))).status, 400);
  await admin.ok("/api/settings", { registrationEnabled: false });
  assert.equal((await admin.call("/api/register", dancer("2", "Cal"))).status, 403);
});

test("changing a bib carries through heats and scores", async () => {
  const community = await createCommunity("Rename Test");
  const admin = new Device();
  await admin.connect(community.gatewayCode);
  await admin.login("admin", community.passcodes.admin);
  await admin.ok("/api/register", dancer("1", "Ann"));

  const { heat } = await admin.ok("/api/heats/create", {
    name: "Novice Prelim", division: "Novice", role: "Lead", competitorBibs: ["1"], heatType: "Prelim", contestType: "Jack & Jill"
  });
  await adminDb.doc(`communities/${community.communityId}/heats/${heat.id}/scores/Judge%20A__1`).set({
    id: "Judge%20A__1", judgeId: "Judge A", heatId: heat.id, competitorBib: "1", score: 90, isCallback: "Yes", timestamp: 1
  });

  await admin.ok("/api/competitor/update", { oldBib: "1", newBib: "101", role: "Lead", division: "Novice" });

  const state = await readState(community.communityId);
  assert.deepEqual(state.competitors.map((c) => c.bib), ["101"]);
  assert.deepEqual(state.heats[0].competitorBibs, ["101"]);
  assert.deepEqual(state.scores.map((s) => [s.id, s.competitorBib]), [["Judge%20A__101", "101"]]);
});

test("deleting a contest removes its scores", async () => {
  const community = await createCommunity("Delete Test");
  const admin = new Device();
  await admin.connect(community.gatewayCode);
  await admin.login("admin", community.passcodes.admin);
  const { heat } = await admin.ok("/api/heats/create", {
    name: "Novice Prelim", division: "Novice", role: "Lead", competitorBibs: [], heatType: "Prelim", contestType: "Jack & Jill"
  });
  const scorePath = `communities/${community.communityId}/heats/${heat.id}/scores/a__1`;
  await adminDb.doc(scorePath).set({ id: "a__1", judgeId: "a", heatId: heat.id, competitorBib: "1", score: 1, isCallback: "No", timestamp: 1 });

  await admin.ok("/api/heats/delete", { heatId: heat.id });
  assert.equal((await adminDb.doc(scorePath).get()).exists, false);
  assert.equal((await readState(community.communityId)).heats.length, 0);
});

test("completed contests keep their order as separate records", async () => {
  const community = await createCommunity("Results Test");
  const admin = new Device();
  await admin.connect(community.gatewayCode);
  await admin.login("admin", community.passcodes.admin);

  const result = (id: string) => ({ id, heatId: id, name: id, division: "Novice", heatType: "Prelim", timestamp: "10:00", judgingStyle: "raw", rankings: [] });
  await admin.ok("/api/settings", { completedResults: [result("z"), result("a")] });
  assert.deepEqual((await readState(community.communityId)).settings.completedResults!.map((r) => r.id), ["z", "a"]);

  await admin.ok("/api/settings", { completedResults: [result("a")] });
  assert.deepEqual((await readState(community.communityId)).settings.completedResults!.map((r) => r.id), ["a"]);
  const stored = await adminDb.collection(`communities/${community.communityId}/results`).get();
  assert.equal(stored.size, 1);
});

test("reset keeps dancers and clears contests; clear-all removes everything", async () => {
  const community = await createCommunity("Reset Test");
  const admin = new Device();
  await admin.connect(community.gatewayCode);
  await admin.login("admin", community.passcodes.admin);
  await admin.ok("/api/register", dancer("1", "Ann"));
  await admin.ok("/api/heats/create", {
    name: "Novice Prelim", division: "Novice", role: "Lead", competitorBibs: ["1"], heatType: "Prelim", contestType: "Jack & Jill"
  });
  await admin.ok("/api/settings", { eventName: "Fall Practice" });

  await admin.ok("/api/reset");
  let state = await readState(community.communityId);
  assert.equal(state.competitors.length, 1);
  assert.equal(state.heats.length, 0);
  assert.equal(state.settings.eventName, "Fall Practice");

  await admin.ok("/api/clear-all");
  state = await readState(community.communityId);
  assert.equal(state.competitors.length, 0);
});

test("a judge name can only be claimed once, and simultaneous finalizes all land", async () => {
  const community = await createCommunity("Judge Test");
  const judges = await Promise.all(["A", "B", "C", "D"].map(async () => {
    const device = new Device();
    await device.connect(community.gatewayCode);
    await device.login("judge", community.passcodes.judge);
    return device;
  }));

  await judges[0].ok("/api/judge/claim", { name: "Judge A" });
  assert.equal((await judges[1].call("/api/judge/claim", { name: "Judge A" })).status, 409);
  await judges[0].ok("/api/judge/claim", { name: "Judge A" });
  const { claims } = await judges[0].auth.currentUser!.getIdTokenResult(true);
  assert.equal(claims.judgeName, "Judge A");

  await withCommunityState(community.communityId, (state) => {
    state.heats = [0, 1, 2, 3].map((i) => ({ id: `heat${i}`, name: "Empty", division: "Novice", role: "Lead", competitorBibs: [] }));
  });
  await Promise.all(judges.map((device, i) => device.ok("/api/judge/finalize", { key: `heat${i}:Judge A`, name: "Judge A" })));
  const { settings } = await readState(community.communityId);
  assert.deepEqual([...settings.finalizedSheets!].sort(), [0, 1, 2, 3].map((i) => `heat${i}:Judge A`));
  assert.deepEqual(settings.claimedJudges, []);
});

test("a sheet can't be finalized until all its scores are saved", async () => {
  const community = await createCommunity("Finalize Test");
  const judge = new Device();
  await judge.connect(community.gatewayCode);
  await judge.login("judge", community.passcodes.judge);
  await withCommunityState(community.communityId, (state) => {
    state.settings.judgeRoles = ["Finals", "None", "None", "None", "None"];
    state.competitors = [
      { ...dancer("1", "Lead One"), checkedIn: true, heatStatus: { finals: { checkedIn: true } } } as any,
      { ...dancer("2", "Follow One", "Follow"), checkedIn: true, heatStatus: { finals: { checkedIn: true } } } as any
    ];
    state.heats = [{
      id: "finals", name: "Novice Finals", division: "Novice", role: "Mixed", heatType: "Finals", isCustom: true,
      competitorBibs: ["1_2"], couples: [{ id: "1_2", leadBib: "1", followBib: "2" }]
    }];
  });

  const key = "finals:Judge A";
  const early = await judge.call("/api/judge/finalize", { key, name: "Judge A" });
  assert.equal(early.status, 409);
  assert.deepEqual((await readState(community.communityId)).settings.finalizedSheets, []);

  await adminDb.doc(`communities/${community.communityId}/heats/finals/scores/Judge%20A__1_2`).set({
    id: "Judge%20A__1_2", judgeId: "Judge A", heatId: "finals", competitorBib: "1_2", score: 1, isCallback: "92", timestamp: 1
  });
  await judge.ok("/api/judge/finalize", { key, name: "Judge A" });
  assert.deepEqual((await readState(community.communityId)).settings.finalizedSheets, [key]);
});

test("deleting the Live Contest promotes the Next Contest", async () => {
  const community = await createCommunity("Delete Live Test");
  const admin = new Device();
  await admin.connect(community.gatewayCode);
  await admin.login("admin", community.passcodes.admin);
  const scorePath = `communities/${community.communityId}/heats/live/scores/a__1`;
  await withCommunityState(community.communityId, (state) => {
    state.heats = [
      { id: "live", name: "Live", division: "Novice", role: "Mixed", heatType: "Finals", competitorBibs: [] },
      { id: "next", name: "Next", division: "Advanced", role: "Mixed", heatType: "Finals", competitorBibs: [] }
    ];
    Object.assign(state.settings, {
      currentHeatId: "live",
      queuedHeatId: "next",
      checkInFinalized: true,
      queuedCheckInFinalized: true,
      contestConfigLocked: true,
      nextContestConfigLocked: true,
      finalizedSheets: ["live:Judge A"],
      nextDivision: "Advanced",
      nextHeatType: "Finals",
      nextJudgingStyle: "placement"
    });
  });
  await adminDb.doc(scorePath).set({ id: "a__1", judgeId: "a", heatId: "live", competitorBib: "1", score: 1, isCallback: "No", timestamp: 1 });

  await admin.ok("/api/heats/delete", { heatId: "live" });
  const { heats, settings } = await readState(community.communityId);
  assert.deepEqual(heats.map((h) => h.id), ["next"]);
  assert.equal((await adminDb.doc(scorePath).get()).exists, false);
  assert.equal(settings.currentHeatId, "next");
  assert.equal(settings.queuedHeatId, null);
  assert.equal(settings.checkInFinalized, true);
  assert.equal(settings.division, "Advanced");
  assert.equal(settings.judgingStyle, "placement");
  assert.equal(settings.contestConfigLocked, true);
  assert.equal(settings.nextContestConfigLocked, false);
  assert.deepEqual(settings.finalizedSheets, []);
});

test("deleting the only contest leaves the slots empty and never revives an old one", async () => {
  const community = await createCommunity("Delete Only Test");
  const admin = new Device();
  await admin.connect(community.gatewayCode);
  await admin.login("admin", community.passcodes.admin);
  await withCommunityState(community.communityId, (state) => {
    state.heats = [
      { id: "done", name: "Done", division: "Novice", role: "Mixed", heatType: "Prelim", competitorBibs: [] },
      { id: "live", name: "Live", division: "Advanced", role: "Mixed", heatType: "Finals", competitorBibs: [] }
    ];
    Object.assign(state.settings, { currentHeatId: "live", division: "Advanced", heatType: "Finals", judgingStyle: "placement", contestConfigLocked: true, checkInFinalized: true });
  });

  await admin.ok("/api/heats/delete", { heatId: "live" });
  const { settings } = await readState(community.communityId);
  assert.equal(settings.currentHeatId, null);
  assert.equal(settings.division, "Novice");
  assert.equal(settings.judgingStyle, "raw");
  assert.equal(settings.contestConfigLocked, false);
  assert.equal(settings.checkInFinalized, false);
});

test("deleting the Next Contest leaves the Live Contest alone", async () => {
  const community = await createCommunity("Delete Next Test");
  const admin = new Device();
  await admin.connect(community.gatewayCode);
  await admin.login("admin", community.passcodes.admin);
  await withCommunityState(community.communityId, (state) => {
    state.heats = [
      { id: "live", name: "Live", division: "Novice", role: "Mixed", competitorBibs: [] },
      { id: "next", name: "Next", division: "Novice", role: "Mixed", competitorBibs: [] }
    ];
    Object.assign(state.settings, { currentHeatId: "live", queuedHeatId: "next", nextDivision: "Advanced", nextContestConfigLocked: true, queuedCheckInFinalized: true });
  });

  await admin.ok("/api/heats/delete", { heatId: "next" });
  const { settings } = await readState(community.communityId);
  assert.equal(settings.currentHeatId, "live");
  assert.equal(settings.queuedHeatId, null);
  assert.equal(settings.queuedCheckInFinalized, false);
  assert.equal(settings.nextDivision, null);
  assert.equal(settings.nextContestConfigLocked, false);
});

test("deleting a completed contest removes its recorded results", async () => {
  const community = await createCommunity("Delete Done Test");
  const admin = new Device();
  await admin.connect(community.gatewayCode);
  await admin.login("admin", community.passcodes.admin);
  await withCommunityState(community.communityId, (state) => {
    state.heats = [{ id: "done", name: "Done", division: "Novice", role: "Mixed", competitorBibs: [] }];
    state.settings.completedResults = [{ id: "done_1", heatId: "done", name: "Done", division: "Novice", heatType: "Prelim", timestamp: "1:00", judgingStyle: "raw", rankings: [] }];
    state.settings.publishedHeatIds = ["done"];
  });

  await admin.ok("/api/heats/delete", { heatId: "done" });
  const { settings } = await readState(community.communityId);
  assert.deepEqual(settings.completedResults, []);
  assert.deepEqual(settings.publishedHeatIds, []);
  assert.equal((await adminDb.collection(`communities/${community.communityId}/results`).get()).size, 0);
});

test("simultaneous registrations and check-ins are all kept", async () => {
  const community = await createCommunity("Concurrency Test");
  const admin = new Device();
  await admin.connect(community.gatewayCode);
  await admin.login("admin", community.passcodes.admin);

  const bibs = Array.from({ length: 8 }, (_, i) => String(i + 1));
  await Promise.all(bibs.map((bib) => admin.ok("/api/register", dancer(bib, `Dancer${bib}`))));
  await Promise.all(bibs.map((bib) => admin.ok("/api/check-in", { bib, heatId: "heat-1", checkedIn: true })));

  const state = await readState(community.communityId);
  assert.equal(state.competitors.length, 8);
  assert.ok(state.competitors.every((c) => c.heatStatus?.["heat-1"]?.checkedIn));
});

test("changing a passcode signs out other devices and keeps the Admin in", async () => {
  const community = await createCommunity("Passcode Test");
  const admin = new Device();
  await admin.connect(community.gatewayCode);
  await admin.login("admin", community.passcodes.admin);
  const other = new Device();
  await other.connect(community.gatewayCode);

  assert.equal((await admin.call("/api/gateway/passcode", { role: "judge", passcode: "abc" })).status, 400);
  await admin.ok("/api/gateway/passcode", { role: "judge", passcode: "new-judge-code" });

  const stale = await other.call("/api/register", dancer("1", "Ann"));
  assert.equal(stale.status, 401);
  assert.equal(stale.data.code, "session_expired");
  await admin.ok("/api/register", dancer("1", "Ann"));

  const judge = new Device();
  await judge.connect(community.gatewayCode);
  assert.equal((await judge.call("/api/gateway/role-login", { role: "judge", passcode: community.passcodes.judge })).status, 403);
  await judge.login("judge", "new-judge-code");
});

test("a new gateway code replaces the old one", async () => {
  const community = await createCommunity("Rotate Test");
  const admin = new Device();
  await admin.connect(community.gatewayCode);
  await admin.login("admin", community.passcodes.admin);

  const { gatewayCode } = await admin.ok("/api/gateway/rotate-code");
  assert.notEqual(gatewayCode, community.gatewayCode);
  assert.equal((await admin.ok("/api/gateway/settings", {}, "GET")).gatewayCode, gatewayCode);

  assert.equal((await new Device().call("/api/gateway/connect", { code: community.gatewayCode })).status, 404);
  await new Device().connect(gatewayCode);
});

test("a locked community refuses connections and requests", async () => {
  const community = await createCommunity("Locked Test");
  const device = new Device();
  await device.connect(community.gatewayCode);
  await adminDb.doc(`communities/${community.communityId}`).update({ status: "locked" });

  assert.equal((await device.call("/api/register", dancer("1", "Ann"))).status, 403);
  assert.equal((await new Device().call("/api/gateway/connect", { code: community.gatewayCode })).status, 403);
});
