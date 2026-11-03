import express, { type Request, type Response } from "express";
import { FieldValue } from "firebase-admin/firestore";
import { CONTEST_ENTRY_KEYS, type AppSettings, type AppState, type Competitor, type Heat, type StaffRole } from "../src/types";
import { getJudgeHeatCompetitors, getJudgeRole, getQueuedPromotion } from "../src/utils/calculations";
import { getAllContestEntries, getContestEntry, getContestRole, getDivisionLockKey, isPartneredContest, oppositeRole, validateContestEntries, withAddedEntry, withEntryPartner } from "../src/utils/partners";
import { adminAuth, adminDb } from "./firebaseAdmin";
import { getSheetsClient, parseSpreadsheetId, prepareSpreadsheet, SHEETS_SERVICE_ACCOUNT } from "./results/googleSheets";
import { describeSheetsError, enqueueSheetJobs, integrationsRef } from "./results/sheetJobs";
import { buildWorkbook } from "./results/workbook";
import {
  assertNotRateLimited, clearFailedAttempts, communityRef, ensureGatewaySlug, formatGatewayCode, gatewayCodeRef, gatewaySlugRef,
  generateGatewayCode, generateGatewaySlug, generatePortalPass, hashPasscode, isSamePass, issueSessionToken, newDeviceId, normalizeGatewayCode,
  PORTAL_PASS_ROLES, privateAuthRef, recordFailedAttempt, STAFF_ROLES, verifyPasscode, type CommunityRecord, type Session
} from "./gateway";
import { autoPopulateHeats, blankSettings, HttpError, readCommunityState, setHeatStatus, withCommunitySettings, withCommunityState } from "./state";

// Copies only the contest-entry fields present on `source`, clearing an
// entry's details whenever it's unchecked.
function applyContestEntryFields(target: Competitor, source: any) {
  CONTEST_ENTRY_KEYS.forEach((key) => {
    if (source[key] !== undefined) {
      (target as any)[key] = typeof source[key] === "string" ? source[key].trim() : source[key];
    }
  });
  if (!target.jjSecond) {
    delete target.jjSecondDivision;
    delete target.jjSecondRole;
  }
  if (!target.strictlySwing) {
    delete target.strictlyPartner;
    delete target.strictlyDivision;
    delete target.strictlyRole;
    delete target.strictlySecond;
  }
  if (!target.strictlySecond) {
    delete target.strictlySecondPartner;
    delete target.strictlySecondDivision;
    delete target.strictlySecondRole;
  }
  if (!target.routine) {
    delete target.routinePartner;
    delete target.routineDivision;
  }
}

// Settings fields each role may change through /api/settings. Admin may change
// everything; Judges use their own endpoints below.
const SETTINGS_FIELDS_BY_ROLE: Partial<Record<StaffRole, (keyof AppSettings)[]>> = {
  coordinator: ["checkInFinalized", "queuedCheckInFinalized"],
  scoring: ["publishedHeatIds", "contestOptions"]
};

function assertSettingsAllowed(session: Session, fields: string[]) {
  if (session.roles.includes("admin")) return;
  const allowed = session.roles.flatMap((role) => SETTINGS_FIELDS_BY_ROLE[role] || []) as string[];
  if (!fields.every((field) => allowed.includes(field))) {
    throw new HttpError(403, "Your portal can't change these settings");
  }
}

// Firebase Hosting sits in front of the live API, so without its header every
// device would share one address and one set of failed attempts.
const getClientIp = (req: Request) => String(req.headers["fastly-client-ip"] || req.ip);

// Every signed-in request proves its community and roles with a Firebase ID
// token. The community always comes from the token, never from the request.
async function authenticate(req: Request): Promise<Session> {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) {
    throw new HttpError(401, "Connect to a gateway first", "session_expired");
  }
  const token = await adminAuth.verifyIdToken(header.slice("Bearer ".length)).catch(() => null);
  if (!token || typeof token.communityId !== "string") {
    throw new HttpError(401, "Connect to a gateway first", "session_expired");
  }
  const community = (await communityRef(token.communityId).get()).data() as CommunityRecord | undefined;
  if (!community || community.sessionEpoch !== token.epoch) {
    throw new HttpError(401, "This gateway's codes have changed. Please reconnect.", "session_expired");
  }
  if (community.status === "locked") {
    throw new HttpError(403, "This gateway's subscription has lapsed", "gateway_locked");
  }
  return {
    uid: token.uid,
    communityId: token.communityId,
    roles: token.roles || [],
    epoch: token.epoch,
    judgeName: token.judgeName,
    linkSlug: token.linkSlug
  };
}

// A device already in this community keeps its roles, so an Admin can open
// their own links.
async function getLinkSession(req: Request, communityId: string): Promise<Session> {
  const community = (await communityRef(communityId).get()).data() as CommunityRecord;
  if (community.status === "locked") {
    throw new HttpError(403, "This gateway's subscription has lapsed", "gateway_locked");
  }
  const current = await authenticate(req).catch(() => null);
  return current?.communityId === communityId
    ? current
    : { uid: newDeviceId(), communityId, roles: [], epoch: community.sessionEpoch };
}

const addRole = (roles: StaffRole[], role: StaffRole) => (roles.includes(role) ? roles : [...roles, role]);

type Handler = (req: Request, session: Session) => Promise<unknown>;

// Admin can do everything; an empty role list means any connected device.
function assertAllowed(session: Session, allowedRoles: StaffRole[]) {
  const isAllowed = allowedRoles.length === 0 || session.roles.includes("admin") ||
    allowedRoles.some((role) => session.roles.includes(role));
  if (!isAllowed) throw new HttpError(403, "Your portal doesn't have access to this");
}

const secured = (allowedRoles: StaffRole[], handler: Handler) => async (req: Request, res: Response) => {
  try {
    const session = await authenticate(req);
    assertAllowed(session, allowedRoles);
    res.json(await handler(req, session));
  } catch (error) {
    sendError(res, error);
  }
};

function sendError(res: Response, error: unknown) {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message, code: error.code });
    return;
  }
  console.error("Unexpected API error", error);
  res.status(500).json({ error: "Something went wrong. Please try again." });
}

function renameBibInState(state: AppState, oldBib: string, newBib: string) {
  state.heats.forEach((heat) => {
    heat.competitorBibs = heat.competitorBibs.map((b) => {
      if (b === oldBib) return newBib;
      if (b.includes("_")) {
        return b.split("_").map((part) => (part === oldBib ? newBib : part)).join("_");
      }
      return b;
    });

    if (heat.couples) {
      heat.couples.forEach((couple) => {
        if (couple.leadBib === oldBib) couple.leadBib = newBib;
        if (couple.followBib === oldBib) couple.followBib = newBib;
        couple.id = `${couple.leadBib}_${couple.followBib}`;
      });
    }
  });

  state.scores.forEach((score) => {
    if (score.competitorBib === oldBib) {
      score.competitorBib = newBib;
    } else if (score.competitorBib.includes("_")) {
      score.competitorBib = score.competitorBib.split("_").map((part) => (part === oldBib ? newBib : part)).join("_");
    }
  });
}

// Every new dancer passes the same checks, however they're added.
function addCompetitor(state: AppState, competitor: Competitor) {
  if (state.settings.registrationEnabled === false) {
    throw new HttpError(403, "Registration is currently closed by the event administrators");
  }

  const entryError = validateContestEntries(competitor);
  if (entryError) throw new HttpError(400, entryError);

  const lockedEntry = getAllContestEntries(competitor)
    .find((entry) => (state.settings.lockedDivisions || []).includes(getDivisionLockKey(entry.contestType, entry.division)));
  if (lockedEntry) {
    throw new HttpError(403, `Registration for ${lockedEntry.division} ${lockedEntry.contestType} is closed — check-in has already been created for it`);
  }

  // Check if bib already exists
  if (state.competitors.some((c) => c.bib === competitor.bib)) {
    throw new HttpError(400, `Competitor with bib ${competitor.bib} already exists`);
  }

  state.competitors.push(competitor);
}

// A dancer who has competed is part of that contest's record, and taking them
// out would change everyone else's results. Couples are stored as "lead_follow".
function assertCanDelete(state: AppState, competitor: Competitor) {
  const { bib, name } = competitor;
  const isDancerIn = (id: string) => id.split("_").includes(bib);

  const score = state.scores.find((s) => isDancerIn(s.competitorBib));
  const result = (state.settings.completedResults || []).find((r) => r.rankings.some((ranking) => isDancerIn(ranking.bib)));
  const contestName = result?.name || state.heats.find((h) => h.id === score?.heatId)?.name;
  if (contestName) {
    throw new HttpError(400, `${name} competed in ${contestName}, so deleting them would change its results. Delete that contest first.`);
  }

  const { currentHeatId, queuedHeatId } = state.settings;
  const runningHeat = state.heats.find((h) =>
    (h.id === currentHeatId || h.id === queuedHeatId) &&
    [...h.competitorBibs, ...(h.unpairedBibs || []), ...(h.finalistBibs || [])].some(isDancerIn));
  if (runningHeat) {
    throw new HttpError(400, `${name} is on the check-in sheet for ${runningHeat.name}. Scratch them there instead.`);
  }
}

function deleteCompetitor(state: AppState, competitor: Competitor) {
  const isNotDancer = (id: string) => !id.split("_").includes(competitor.bib);
  state.competitors = state.competitors.filter((c) => c.bib !== competitor.bib);
  state.heats.forEach((heat) => {
    heat.competitorBibs = heat.competitorBibs.filter(isNotDancer);
    if (heat.couples) heat.couples = heat.couples.filter((couple) => isNotDancer(couple.id));
    if (heat.unpairedBibs) heat.unpairedBibs = heat.unpairedBibs.filter(isNotDancer);
    if (heat.finalistBibs) heat.finalistBibs = heat.finalistBibs.filter(isNotDancer);
  });
}

const SAMPLE_DANCERS_PER_ROLE = 5;

// Sample dancers are named as such, so they can't be mistaken for real entries.
function addSampleDancers(state: AppState, division: string) {
  let nextBib = Math.max(0, ...state.competitors.map((c) => Number(c.bib)).filter(Number.isFinite)) + 1;
  (["Lead", "Follow"] as const).forEach((role) => {
    const label = role === "Lead" ? "Leader" : "Follower";
    const existing = state.competitors.filter((c) => c.name.startsWith(`Sample ${label} `)).length;
    for (let i = 1; i <= SAMPLE_DANCERS_PER_ROLE; i++) {
      const number = existing + i;
      addCompetitor(state, {
        bib: String(nextBib++),
        name: `Sample ${label} ${number}`,
        email: `sample.${label.toLowerCase()}.${number}@example.com`,
        division,
        role,
        checkedIn: false
      });
    }
  });
}

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  // A running list sends every completed contest with each Complete Contest.
  app.use(express.json({ limit: "2mb" }));

  // Gateway access
  app.post("/api/gateway/connect", async (req, res) => {
    try {
      const attemptKey = `connect:${getClientIp(req)}`;
      await assertNotRateLimited(attemptKey);

      const code = normalizeGatewayCode(String(req.body.code || ""));
      const gateway = code ? (await gatewayCodeRef(code).get()).data() : undefined;
      if (!gateway) {
        await recordFailedAttempt(attemptKey);
        throw new HttpError(404, "That gateway code isn't recognized. Check it and try again.");
      }

      const community = (await communityRef(gateway.communityId).get()).data() as CommunityRecord;
      if (community.status === "locked") {
        throw new HttpError(403, "This gateway's subscription has lapsed", "gateway_locked");
      }
      res.json({
        token: await issueSessionToken({
          uid: newDeviceId(),
          communityId: gateway.communityId,
          roles: [],
          epoch: community.sessionEpoch
        })
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  // A portal link connects a device without the gateway code.
  app.post("/api/gateway/connect-link", async (req, res) => {
    try {
      const attemptKey = `connect:${getClientIp(req)}`;
      await assertNotRateLimited(attemptKey);

      const slug = String(req.body.slug || "").toLowerCase();
      const link = slug ? (await gatewaySlugRef(slug).get()).data() : undefined;
      if (!link) {
        await recordFailedAttempt(attemptKey);
        throw new HttpError(404, "This link is no longer active. Ask your organizer for a new one.");
      }

      const session = await getLinkSession(req, link.communityId);
      res.json({ token: await issueSessionToken({ ...session, linkSlug: slug }) });
    } catch (error) {
      sendError(res, error);
    }
  });

  // A QR code does the work of both the portal link and the passcode.
  app.post("/api/gateway/connect-pass", async (req, res) => {
    try {
      const attemptKey = `connect:${getClientIp(req)}`;
      await assertNotRateLimited(attemptKey);

      const slug = String(req.body.slug || "").toLowerCase();
      const role = req.body.role as StaffRole;
      const link = slug ? (await gatewaySlugRef(slug).get()).data() : undefined;
      const auth = link ? (await privateAuthRef(link.communityId).get()).data() : undefined;
      const stored = PORTAL_PASS_ROLES.includes(role) ? auth?.portalPasses?.[role] : undefined;
      const isMatch = !!stored && isSamePass(String(req.body.pass || ""), stored.pass);
      if (!isMatch) await recordFailedAttempt(attemptKey);
      if (!isMatch || stored.expiresAt <= Date.now()) {
        throw new HttpError(403, "This QR code is no longer active. Enter the passcode, or ask your organizer for a new code.");
      }

      const session = await getLinkSession(req, link!.communityId);
      res.json({ token: await issueSessionToken({ ...session, roles: addRole(session.roles, role), linkSlug: slug }) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/gateway/role-login", secured([], async (req, session) => {
    const role = req.body.role as StaffRole;
    if (!STAFF_ROLES.includes(role)) throw new HttpError(400, "Unknown portal");

    const attemptKey = `role:${session.communityId}:${getClientIp(req)}`;
    await assertNotRateLimited(attemptKey);
    const auth = (await privateAuthRef(session.communityId).get()).data();
    const stored = auth?.passcodes?.[role];
    const passcode = String(req.body.passcode || "");
    if (!stored || !(await verifyPasscode(passcode, stored))) {
      await recordFailedAttempt(attemptKey);
      throw new HttpError(403, "That passcode isn't correct");
    }
    await clearFailedAttempts(attemptKey);

    // Older gateways only kept hashes: the first sign-in fills in the Admin's note.
    if (!auth?.readablePasscodes?.[role]) {
      await privateAuthRef(session.communityId).update({ [`readablePasscodes.${role}`]: passcode });
    }

    return { token: await issueSessionToken({ ...session, roles: addRole(session.roles, role) }) };
  }));

  app.post("/api/gateway/role-logout", secured([], async (req, session) => {
    const roles = session.roles.filter((role) => role !== req.body.role);
    return { token: await issueSessionToken({ ...session, roles }) };
  }));

  app.get("/api/gateway/settings", secured(["admin"], async (_req, session) => {
    const auth = (await privateAuthRef(session.communityId).get()).data();
    return { gatewayCode: formatGatewayCode(auth?.gatewayCode || "") };
  }));

  // What the Admin hands out from the Central Gateway. Never includes the gateway code.
  app.get("/api/gateway/portal-access", secured(["admin"], async (_req, session) => {
    const slug = await ensureGatewaySlug(session.communityId);
    const auth = (await privateAuthRef(session.communityId).get()).data();
    return { slug, passcodes: auth?.readablePasscodes || {} };
  }));

  // Reopening a portal's QR code shows the same code, so one already handed out
  // keeps working unless the Admin chooses to replace it.
  app.post("/api/gateway/portal-pass", secured(["admin"], async (req, session) => {
    const role = req.body.role as StaffRole;
    if (!PORTAL_PASS_ROLES.includes(role)) throw new HttpError(400, "This portal has no QR code");
    return adminDb.runTransaction(async (tx) => {
      const ref = privateAuthRef(session.communityId);
      const stored = (await tx.get(ref)).data()?.portalPasses?.[role];
      if (stored && stored.expiresAt > Date.now() && !req.body.replace) return stored;
      const portalPass = generatePortalPass();
      tx.update(ref, { [`portalPasses.${role}`]: portalPass });
      return portalPass;
    });
  }));

  app.post("/api/gateway/settings", secured(["admin"], async (req, session) => {
    const name = String(req.body.name || "").trim();
    if (!name) throw new HttpError(400, "Enter a community name");
    await communityRef(session.communityId).update({ name });
    return { success: true };
  }));

  // Changing a code signs out every device in the community, so a leaked code
  // stops working at once. The Admin stays signed in with the token sent back.
  app.post("/api/gateway/passcode", secured(["admin"], async (req, session) => {
    const role = req.body.role as StaffRole;
    const passcode = String(req.body.passcode || "").trim();
    if (!STAFF_ROLES.includes(role)) throw new HttpError(400, "Unknown portal");
    if (passcode.length < 6) throw new HttpError(400, "Use at least 6 characters");

    const hash = await hashPasscode(passcode);
    const epoch = await adminDb.runTransaction(async (tx) => {
      const community = (await tx.get(communityRef(session.communityId))).data() as CommunityRecord;
      const nextEpoch = community.sessionEpoch + 1;
      tx.update(privateAuthRef(session.communityId), {
        [`passcodes.${role}`]: hash,
        [`readablePasscodes.${role}`]: passcode,
        [`portalPasses.${role}`]: FieldValue.delete()
      });
      tx.update(communityRef(session.communityId), { sessionEpoch: nextEpoch });
      return nextEpoch;
    });
    return { token: await issueSessionToken({ ...session, epoch }) };
  }));

  app.post("/api/gateway/rotate-code", secured(["admin"], async (_req, session) => {
    const gatewayCode = generateGatewayCode();
    const epoch = await adminDb.runTransaction(async (tx) => {
      const community = (await tx.get(communityRef(session.communityId))).data() as CommunityRecord;
      const auth = (await tx.get(privateAuthRef(session.communityId))).data();
      const nextEpoch = community.sessionEpoch + 1;
      // Portal links and QR codes go with the code, so a leaked one stops working too.
      const slug = generateGatewaySlug(community.name);
      if (auth?.gatewayCode) tx.delete(gatewayCodeRef(auth.gatewayCode));
      if (auth?.slug) tx.delete(gatewaySlugRef(auth.slug));
      tx.set(gatewayCodeRef(gatewayCode), { communityId: session.communityId });
      tx.set(gatewaySlugRef(slug), { communityId: session.communityId });
      tx.update(privateAuthRef(session.communityId), { gatewayCode, slug, portalPasses: FieldValue.delete() });
      tx.update(communityRef(session.communityId), { sessionEpoch: nextEpoch });
      return nextEpoch;
    });
    return {
      gatewayCode: formatGatewayCode(gatewayCode),
      token: await issueSessionToken({ ...session, epoch })
    };
  }));

  // Results spreadsheet
  app.get("/api/sheets", secured(["admin"], async (_req, session) => {
    const integration = (await integrationsRef(session.communityId).get()).data();
    return { serviceAccountEmail: SHEETS_SERVICE_ACCOUNT, url: integration?.url || "", title: integration?.title || "" };
  }));

  // Connecting also tests the sheet, by setting up its Summary tab. A blank link disconnects it.
  app.post("/api/sheets/connect", secured(["admin"], async (req, session) => {
    const url = String(req.body.url || "").trim();
    const setConnected = (isConnected: boolean) => withCommunitySettings(session.communityId, (settings) => {
      settings.spreadsheetConnected = isConnected;
    });
    if (!url) {
      await integrationsRef(session.communityId).delete();
      await setConnected(false);
      return { url: "", title: "" };
    }

    const spreadsheetId = parseSpreadsheetId(url);
    if (!spreadsheetId) throw new HttpError(400, "Paste the full link from your Google Sheet's address bar");
    const { title } = await prepareSpreadsheet(getSheetsClient(), spreadsheetId).catch((error) => {
      console.error("Sheet connection failed", error);
      throw new HttpError(400, describeSheetsError(error));
    });
    const connection = { spreadsheetId, title, url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit` };
    await integrationsRef(session.communityId).set(connection);
    await setConnected(true);
    return { url: connection.url, title };
  }));

  // One contest, or with no heatId, every published contest.
  app.post("/api/sheets/resave", secured(["scoring"], async (req, session) => {
    const { heatId } = req.body;
    const { settings } = await readCommunityState(session.communityId, []);
    const published = settings.publishedHeatIds || [];
    if (heatId && !published.includes(heatId)) throw new HttpError(400, "Publish this contest first");
    if (!settings.spreadsheetConnected) throw new HttpError(400, "Connect a spreadsheet in Gateway Settings first");
    return { queued: await enqueueSheetJobs(session.communityId, heatId ? [heatId] : published) };
  }));

  app.get("/api/sheets/workbook", async (req, res) => {
    try {
      const session = await authenticate(req);
      assertAllowed(session, ["scoring"]);
      const workbook = await buildWorkbook(await readCommunityState(session.communityId, "all"));
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", 'attachment; filename="swingscore-results.xlsx"');
      res.send(workbook);
    } catch (error) {
      sendError(res, error);
    }
  });

  // Judges
  app.post("/api/judge/claim", secured(["judge"], async (req, session) => {
    const name = String(req.body.name || "");
    if (!name) throw new HttpError(400, "Choose your judge profile");
    await withCommunitySettings(session.communityId, (settings) => {
      const claimed = settings.claimedJudges || [];
      if (claimed.includes(name) && session.judgeName !== name) {
        throw new HttpError(409, `${name} has already been claimed on another device`);
      }
      settings.claimedJudges = [...new Set([...claimed, name])];
    });
    return { token: await issueSessionToken({ ...session, judgeName: name }) };
  }));

  app.post("/api/judge/release", secured(["judge"], async (req, session) => {
    const name = String(req.body.name || "");
    await withCommunitySettings(session.communityId, (settings) => {
      settings.claimedJudges = (settings.claimedJudges || []).filter((claimed) => claimed !== name);
    });
    return { token: await issueSessionToken({ ...session, judgeName: undefined }) };
  }));

  // Releases the judge's name as soon as they finalize, so it's immediately
  // available again (e.g. for the next round, or someone else at a shared
  // station). The token keeps the name for this device's locked confirmation.
  app.post("/api/judge/finalize", secured(["judge"], async (req, session) => {
    const key = String(req.body.key || "");
    const name = String(req.body.name || "");
    if (!key) throw new HttpError(400, "Missing sheet");

    // A sheet only counts as submitted once every score on it is in the database.
    const heatId = key.slice(0, key.indexOf(":"));
    const state = await readCommunityState(session.communityId, [heatId]);
    const heat = state.heats.find((h) => h.id === heatId);
    if (!heat) throw new HttpError(404, "Heat not found");
    const saved = new Set(state.scores.filter((s) => s.judgeId === name).map((s) => s.competitorBib));
    const unsaved = getJudgeHeatCompetitors(heat, state.competitors, getJudgeRole(state.settings, name))
      .filter((c) => !saved.has(c.bib));
    if (unsaved.length > 0) {
      throw new HttpError(409, `${unsaved.length} score${unsaved.length === 1 ? "" : "s"} on this sheet didn't save. Re-enter ${unsaved.length === 1 ? "it" : "them"}, then finalize again.`);
    }

    await withCommunitySettings(session.communityId, (settings) => {
      settings.finalizedSheets =[...new Set([...(settings.finalizedSheets || []), key])];
      settings.claimedJudges = (settings.claimedJudges || []).filter((claimed) => claimed !== name);
    });
    return { success: true };
  }));

  // Contest data
  app.post("/api/register", secured(["competitor"], async (req, session) => {
    const { bib, name, email, division, role } = req.body;
    if (!bib || !name || !email || !division || !role) {
      throw new HttpError(400, "Missing required competitor fields");
    }

    const competitor = await withCommunityState(session.communityId, (state) => {
      const newCompetitor: Competitor = {
        bib,
        name,
        email,
        division,
        role,
        checkedIn: false
      };
      applyContestEntryFields(newCompetitor, req.body);
      addCompetitor(state, newCompetitor);
      return newCompetitor;
    });
    return { success: true, competitor };
  }));

  app.post("/api/register/samples", secured(["competitor"], async (req, session) => {
    const division = String(req.body.division || "");
    if (!division) throw new HttpError(400, "Choose a division");
    await withCommunityState(session.communityId, (state) => addSampleDancers(state, division));
    return { success: true };
  }));

  app.post("/api/check-in", secured(["coordinator"], async (req, session) => {
    const { bib, heatId, checkedIn, scratched, registryPoints } = req.body;
    if (bib === undefined) throw new HttpError(400, "Missing bib parameter");
    // Check-in and scratch belong to one contest (heat); registry points don't.
    if ((checkedIn !== undefined || scratched !== undefined) && !heatId) {
      throw new HttpError(400, "Missing heatId for the check-in status");
    }

    const competitor = await withCommunityState(session.communityId, (state) => {
      const found = state.competitors.find((c) => c.bib === bib);
      if (!found) throw new HttpError(404, "Competitor not found");

      if (heatId) setHeatStatus(found, heatId, { checkedIn, scratched });
      if (registryPoints !== undefined) found.registryPoints = Number(registryPoints);
      return found;
    });
    return { success: true, competitor };
  }));

  app.post("/api/competitor/update", secured(["coordinator", "competitor"], async (req, session) => {
    const { oldBib, newBib, name, email, role, division, checkedIn, scratched, heatId } = req.body;
    if (!oldBib || !newBib || !role || !division) {
      throw new HttpError(400, "Missing required competitor update fields");
    }

    // Scores are stored per dancer, so a new bib has to reach them as well.
    const competitor = await withCommunityState(session.communityId, (state) => {
      if (oldBib !== newBib && state.competitors.some((c) => c.bib === newBib)) {
        throw new HttpError(400, `Competitor with bib ${newBib} already exists`);
      }

      const found = state.competitors.find((c) => c.bib === oldBib);
      if (!found) throw new HttpError(404, "Competitor not found");

      // Validate the registration as it will be saved (edits may send only
      // some fields, e.g. a single entry's role) before touching the stored one.
      const updated: Competitor = { ...found, role, division };
      applyContestEntryFields(updated, req.body);
      const entryError = validateContestEntries(updated);
      if (entryError) throw new HttpError(400, entryError);

      Object.keys(found).forEach((key) => delete (found as any)[key]);
      Object.assign(found, updated);
      found.bib = newBib;
      if (name !== undefined) found.name = name;
      if (email !== undefined) found.email = email;
      // Status edits come from a contest's check-in sheet and apply to that contest only.
      if (heatId) setHeatStatus(found, heatId, { checkedIn, scratched });

      if (oldBib !== newBib) renameBibInState(state, oldBib, newBib);
      return found;
    }, { scores: oldBib !== newBib ? "all" : undefined });
    return { success: true, competitor };
  }));

  app.post("/api/competitor/delete", secured(["competitor"], async (req, session) => {
    const { bib } = req.body;
    if (!bib) throw new HttpError(400, "Missing bib parameter");

    await withCommunityState(session.communityId, (state) => {
      const found = state.competitors.find((c) => c.bib === bib);
      if (!found) throw new HttpError(404, "Competitor not found");
      assertCanDelete(state, found);
      deleteCompetitor(state, found);
    }, { scores: "all" });
    return { success: true };
  }));

  app.post("/api/heats/create", secured(["admin"], async (req, session) => {
    const { name, division, role, competitorBibs, couples, unpairedBibs, finalistBibs, target, heatType, contestType } = req.body;
    if (!name || !division || !role || !competitorBibs) {
      throw new HttpError(400, "Missing required heat fields");
    }

    const id = "heat-" + Date.now();
    const heat = await withCommunityState(session.communityId, (state) => {
      const newHeat: Heat = {
        id,
        name,
        division,
        role,
        competitorBibs,
        couples: couples || [],
        ...(Array.isArray(unpairedBibs) && unpairedBibs.length > 0 ? { unpairedBibs } : {}),
        ...(Array.isArray(finalistBibs) ? { finalistBibs } : {}),
        isCustom: true,
        heatType: heatType || (name.includes("Finals") ? "Finals" : name.includes("Semi-Final") ? "Semi-Final" : name.includes("Quarter Final") ? "Quarter Final" : "Prelim"),
        contestType: contestType || (name.includes("Routine") ? "Routine" : name.includes("Strictly") ? "Strictly Swing" : "Jack & Jill")
      };

      state.heats.push(newHeat);
      if (target !== "next") {
        state.settings.checkInFinalized = false;
      }
      return newHeat;
    });
    return { success: true, heat };
  }));

  // Floor Coordinator pairs a dancer left unpaired on a partnered check-in
  // sheet: both registrations are updated to name each other (entering the
  // partner into this contest+division if needed) and the couple joins the sheet.
  app.post("/api/heats/assign-partner", secured(["coordinator"], async (req, session) => {
    const { heatId, bib, partnerBib } = req.body;
    const couple = await withCommunityState(session.communityId, (state) => {
      const heat = state.heats.find((h) => h.id === heatId);
      if (!heat || !isPartneredContest(heat.contestType)) {
        throw new HttpError(400, "Partners can only be assigned on a Strictly Swing or Routine check-in sheet");
      }
      const contestType = heat.contestType!;
      const division = heat.division;
      const isPaired = (b: string) => (heat.couples || []).some((c) => c.leadBib === b || c.followBib === b);
      if (!(heat.unpairedBibs || []).includes(bib)) {
        throw new HttpError(400, "That dancer is not waiting for a partner on this sheet");
      }
      if (!partnerBib || partnerBib === bib || isPaired(partnerBib)) {
        throw new HttpError(400, "Choose a partner who is not already partnered on this sheet");
      }
      const dancer = state.competitors.find((c) => c.bib === bib);
      const partner = state.competitors.find((c) => c.bib === partnerBib);
      const dancerEntry = dancer && getContestEntry(dancer, contestType, division);
      if (!dancer || !partner || !dancerEntry) {
        throw new HttpError(404, "Dancer or partner not found");
      }

      const partnerRole = dancerEntry.role ? oppositeRole(dancerEntry.role) : null;
      const updatedPartner = getContestEntry(partner, contestType, division)
        ? withEntryPartner(partner, contestType, division, dancer.name)
        : withAddedEntry(partner, contestType, division, partnerRole, dancer.name);
      if (!updatedPartner) {
        throw new HttpError(400, `${partner.name} is already entered in ${contestType} in as many divisions as allowed`);
      }
      if (dancerEntry.role && getContestRole(updatedPartner, contestType, division) === dancerEntry.role) {
        throw new HttpError(400, `${dancer.name} and ${partner.name} are both registered as ${dancerEntry.role === "Lead" ? "Leaders" : "Followers"} for ${division} ${contestType}`);
      }
      const entryError = validateContestEntries(updatedPartner);
      if (entryError) throw new HttpError(400, `${partner.name}: ${entryError}`);

      Object.assign(dancer, withEntryPartner(dancer, contestType, division, partner.name));
      Object.assign(partner, updatedPartner);

      // Routines have no roles: the waiting dancer simply takes the couple's first slot.
      const dancerLeads = dancerEntry.role ? dancerEntry.role === "Lead" : true;
      const [lead, follow] = dancerLeads ? [dancer, partner] : [partner, dancer];
      const newCouple = { id: `${lead.bib}_${follow.bib}`, leadBib: lead.bib, followBib: follow.bib };
      heat.unpairedBibs = (heat.unpairedBibs || []).filter((b) => b !== bib && b !== partnerBib);
      heat.couples = [...(heat.couples || []), newCouple];
      heat.competitorBibs = [...heat.competitorBibs, newCouple.id];
      return newCouple;
    });
    return { success: true, couple };
  }));

  app.post("/api/heats/update", secured(["admin"], async (req, session) => {
    const { heatId, name, division, role, competitorBibs, couples, isCustom, splits, heatType, contestType } = req.body;
    if (!heatId) throw new HttpError(400, "Missing heatId");

    const heat = await withCommunityState(session.communityId, (state) => {
      const found = state.heats.find((h) => h.id === heatId);
      if (!found) throw new HttpError(404, "Heat not found");

      if (name !== undefined) {
        found.name = name;
        // Re-infer if name changes and heatType/contestType are not explicitly passed
        if (heatType === undefined) {
          found.heatType = name.includes("Finals") ? "Finals" : name.includes("Semi-Final") ? "Semi-Final" : name.includes("Quarter Final") ? "Quarter Final" : "Prelim";
        }
        if (contestType === undefined) {
          found.contestType = name.includes("Routine") ? "Routine" : name.includes("Strictly") ? "Strictly Swing" : "Jack & Jill";
        }
      }
      if (division !== undefined) {
        found.division = division;
      }
      if (role !== undefined) {
        found.role = role;
      }
      if (competitorBibs !== undefined) {
        found.competitorBibs = competitorBibs;
      }
      if (couples !== undefined) {
        found.couples = couples;
      }
      if (isCustom !== undefined) {
        found.isCustom = isCustom;
      }
      if (splits !== undefined) {
        found.splits = splits;
      }
      if (heatType !== undefined) {
        found.heatType = heatType;
      }
      if (contestType !== undefined) {
        found.contestType = contestType;
      }
      return found;
    });
    return { success: true, heat };
  }));

  app.post("/api/heats/delete", secured(["admin"], async (req, session) => {
    const { heatId } = req.body;
    if (!heatId) throw new HttpError(400, "Missing heatId");

    await withCommunityState(session.communityId, (state) => {
      const settings = state.settings;
      state.heats = state.heats.filter((h) => h.id !== heatId);
      // Remove scores associated with this heat
      state.scores = state.scores.filter((s) => s.heatId !== heatId);

      if (settings.contestOptions) delete settings.contestOptions[heatId];
      settings.completedResults = (settings.completedResults || []).filter((r) => r.heatId !== heatId);
      settings.publishedHeatIds = (settings.publishedHeatIds || []).filter((id) => id !== heatId);
      settings.finalizedSheets = (settings.finalizedSheets || []).filter((entry) => !entry.startsWith(`${heatId}:`));

      if (settings.queuedHeatId === heatId) {
        Object.assign(settings, {
          queuedHeatId: null,
          queuedCheckInFinalized: false,
          nextContestType: null,
          nextDivision: null,
          nextHeatType: null,
          nextJudgingStyle: null,
          nextContestConfigLocked: false
        });
      }

      // The Next Contest moves up, as it does when a contest is completed.
      if (settings.currentHeatId === heatId) {
        Object.assign(settings, settings.queuedHeatId ? getQueuedPromotion(settings) : {
          currentHeatId: null,
          checkInFinalized: false,
          contestType: "Jack & Jill",
          division: "Novice",
          heatType: "Prelim",
          judgingStyle: "raw",
          contestConfigLocked: false
        });
      }
    }, { scores: [heatId] });
    return { success: true };
  }));

  app.post("/api/settings", secured(["coordinator", "scoring"], async (req, session) => {
    assertSettingsAllowed(session, Object.keys(req.body));

    let newlyPublished: string[] = [];
    const settings = await withCommunityState(session.communityId, (state) => {
      const alreadyPublished = state.settings.publishedHeatIds || [];
      newlyPublished = (req.body.publishedHeatIds || []).filter((id: string) => !alreadyPublished.includes(id));

      const oldHeatId = state.settings.currentHeatId;
      const newHeatId = req.body.currentHeatId;
      const isNewHeatActivated = newHeatId !== undefined && newHeatId !== oldHeatId && newHeatId !== null;

      // Check if finalizing check-in (not when a promoted contest arrives with
      // its own check-in already finalized: its sheet must stay as it is)
      const finalized = !isNewHeatActivated && req.body.checkInFinalized === true && state.settings.checkInFinalized !== true;

      state.settings = {
        ...state.settings,
        ...req.body
      };

      if (isNewHeatActivated) {
        // Check-in status is kept per contest, so the new contest starts from its
        // own statuses without touching any other contest's. A contest promoted
        // from Next keeps the check-in finalization it was promoted with.
        state.settings.checkInFinalized = req.body.checkInFinalized === true;
        state.settings.finalizedSheets = [];

        // Keep activeHeat custom so its admin-created competitor list (check-in sheet) is preserved
        // and not overwritten by autoPopulateHeats before check-in.
        const activeHeat = state.heats.find((h) => h.id === newHeatId);
        if (activeHeat) {
          activeHeat.isCustom = true;
        }
      }

      if (finalized) {
        // Find the active heat and set it to not custom so autoPopulateHeats can update its competitors
        const activeHeat = state.heats.find(h => h.id === state.settings.currentHeatId);
        if (activeHeat) {
          activeHeat.isCustom = false;
        }

        // Synchronize all heats with the finalized check-in status
        autoPopulateHeats(state);

        // Send the sheets to the Active Heat Editor by marking all heats as custom (isCustom = true)
        // so that the admin can adjust/customize them as needed while the event is happening.
        state.heats.forEach((h) => {
          h.isCustom = true;
        });

        // Auto populate current heat if empty
        if (!state.settings.currentHeatId && state.heats.length > 0) {
          state.settings.currentHeatId = state.heats[0].id;
        }
      }

      return state.settings;
    });
    // Publishing has worked by now, whatever happens with the spreadsheet.
    await enqueueSheetJobs(session.communityId, newlyPublished).catch((error) => console.error("Couldn't queue a sheet save", error));
    return { success: true, settings };
  }));

  // Reset clears contests and results but keeps the community's dancers, ready
  // for the next event.
  app.post("/api/reset", secured(["admin"], async (_req, session) => {
    await withCommunityState(session.communityId, (state) => {
      state.heats = [];
      state.scores = [];
      state.settings = { ...blankSettings(), eventName: state.settings.eventName, spreadsheetConnected: !!state.settings.spreadsheetConnected };
      state.competitors.forEach((c) => {
        c.heatStatus = {};
        c.checkedIn = false;
        c.scratched = false;
      });
    }, { scores: "all" });
    return { success: true };
  }));

  app.post("/api/clear-all", secured(["admin"], async (_req, session) => {
    await withCommunityState(session.communityId, (state) => {
      state.competitors = [];
      state.heats = [];
      state.scores = [];
      state.settings = { ...blankSettings(), spreadsheetConnected: !!state.settings.spreadsheetConnected };
    }, { scores: "all" });
    return { success: true };
  }));

  return app;
}
