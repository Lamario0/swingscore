import { createHash, randomBytes, randomInt, randomUUID, scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { FieldValue } from "firebase-admin/firestore";
import type { GatewayStatus, StaffRole } from "../src/types";
import { adminAuth, adminDb } from "./firebaseAdmin";
import { blankSettings, HttpError, saveCommunityState } from "./state";

const scryptAsync = promisify(scrypt) as (password: string, salt: string, keylen: number) => Promise<Buffer>;

export const STAFF_ROLES: StaffRole[] = ["admin", "judge", "coordinator", "scoring", "competitor"];

// The Admin portal has no QR code: full control stays behind the gateway code.
export const PORTAL_PASS_ROLES: StaffRole[] = ["judge", "coordinator", "scoring", "competitor"];

export interface Session {
  uid: string;
  communityId: string;
  roles: StaffRole[];
  epoch: number;
  judgeName?: string;
  linkSlug?: string;
}

export interface CommunityRecord {
  name: string;
  status: GatewayStatus;
  sessionEpoch: number;
  createdAt?: number;
  // The platform owner's own community, which their app can open as Admin.
  isOwnerCommunity?: boolean;
}

// Read aloud and typed on phones, so no characters that look alike (0/O, 1/I/L).
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const randomCode = (length: number) =>
  Array.from({ length }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");

export const normalizeGatewayCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, "");
export const formatGatewayCode = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`;

export const communityRef = (communityId: string) => adminDb.collection("communities").doc(communityId);
export const gatewayCodeRef = (code: string) => adminDb.collection("gatewayCodes").doc(code);
export const gatewaySlugRef = (slug: string) => adminDb.collection("gatewaySlugs").doc(slug);
export const privateAuthRef = (communityId: string) => communityRef(communityId).collection("private").doc("auth");

export async function hashPasscode(passcode: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = await scryptAsync(passcode, salt, 32);
  return `${salt}:${hash.toString("hex")}`;
}

export async function verifyPasscode(passcode: string, stored: string) {
  const [salt, hash] = stored.split(":");
  const expected = Buffer.from(hash, "hex");
  return timingSafeEqual(await scryptAsync(passcode, salt, 32), expected);
}

// A device's session: the community it joined, its staff roles and, once a judge
// has claimed a name, that name. Security Rules and the API both read these.
export function issueSessionToken({ uid, communityId, roles, epoch, judgeName, linkSlug }: Session) {
  return adminAuth.createCustomToken(uid, {
    communityId,
    roles,
    epoch,
    ...(judgeName ? { judgeName } : {}),
    ...(linkSlug ? { linkSlug } : {})
  });
}

export const newDeviceId = () => `device-${randomUUID()}`;

// A QR code signs staff in with this pass, so the passcode never appears in a
// link. It lasts through a three-day event, and the Admin can replace it at any time.
const PORTAL_PASS_LIFETIME_MS = 3 * 24 * 60 * 60 * 1000;

export const generatePortalPass = () => ({
  pass: randomCode(20),
  expiresAt: Date.now() + PORTAL_PASS_LIFETIME_MS
});

export function isSamePass(pass: string, stored: string) {
  const [a, b] = [pass, stored].map((value) => createHash("sha256").update(value).digest());
  return timingSafeEqual(a, b);
}

// Portal links carry this instead of the gateway code. The community's name
// makes them recognizable, and the random ending keeps them unguessable.
export function generateGatewaySlug(name: string) {
  const readable = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30);
  return `${readable || "gateway"}-${randomCode(6).toLowerCase()}`;
}

// Gateways created before portal links get their slug the first time it's needed.
export function ensureGatewaySlug(communityId: string): Promise<string> {
  return adminDb.runTransaction(async (tx) => {
    const auth = (await tx.get(privateAuthRef(communityId))).data();
    if (auth?.slug) return auth.slug as string;
    const community = (await tx.get(communityRef(communityId))).data() as CommunityRecord;
    const slug = generateGatewaySlug(community.name);
    tx.set(gatewaySlugRef(slug), { communityId });
    tx.update(privateAuthRef(communityId), { slug });
    return slug;
  });
}

// Creates a community with empty data. Passcodes stay readable in private/auth,
// which only the server can reach, so the Admin can look them up and pass them on.
export async function createCommunity(name: string) {
  const communityId = randomUUID();
  const gatewayCode = randomCode(8);
  const slug = generateGatewaySlug(name);
  const passcodes =Object.fromEntries(STAFF_ROLES.map((role) => [role, randomCode(6)])) as Record<StaffRole, string>;
  const hashes = Object.fromEntries(
    await Promise.all(STAFF_ROLES.map(async (role) => [role, await hashPasscode(passcodes[role])]))
  );

  const batch = adminDb.batch();
  const community: CommunityRecord = { name, status: "active", sessionEpoch: 1, createdAt: Date.now() };
  batch.set(communityRef(communityId), community);
  batch.set(privateAuthRef(communityId), { gatewayCode, slug, passcodes: hashes, readablePasscodes: passcodes });
  batch.set(gatewayCodeRef(gatewayCode), { communityId });
  batch.set(gatewaySlugRef(slug), { communityId });
  await batch.commit();
  await saveCommunityState(communityId, { competitors: [], heats: [], scores: [], settings: blankSettings() });

  return { communityId, gatewayCode: formatGatewayCode(gatewayCode), slug, passcodes };
}

// Guessing is limited by counting failed attempts in Firestore, since server
// instances share nothing else. A venue's Wi-Fi puts every dancer on one
// address, so the limit leaves room for plenty of honest typos.
const MAX_FAILURES = 30;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;

const rateLimitRef = (key: string) =>
  adminDb.collection("rateLimits").doc(createHash("sha256").update(key).digest("hex"));

export async function assertNotRateLimited(key: string) {
  const data = (await rateLimitRef(key).get()).data();
  if (data && data.count >= MAX_FAILURES && Date.now() - data.startedAt < FAILURE_WINDOW_MS) {
    throw new HttpError(429, "Too many incorrect attempts. Please wait a few minutes and try again.");
  }
}

export function recordFailedAttempt(key: string) {
  const ref = rateLimitRef(key);
  return adminDb.runTransaction(async (tx) => {
    const data = (await tx.get(ref)).data();
    const isCurrent = data && Date.now() - data.startedAt < FAILURE_WINDOW_MS;
    tx.set(ref, isCurrent ? { ...data, count: data.count + 1 } : { count: 1, startedAt: Date.now() });
  });
}

export const clearFailedAttempts = (key: string) => rateLimitRef(key).delete();

export const generateGatewayCode = () => randomCode(8);

export const generatePasscode = () => randomCode(6);

// The owner app's "Open Admin portal" link carries this, and it works once.
export const generateOwnerAdminPass = () => ({ pass: randomCode(24), expiresAt: Date.now() + 2 * 60 * 1000 });

// Changing a passcode signs out every device in the community, so a leaked one
// stops working at once. That portal's QR code goes with it.
export async function setRolePasscode(communityId: string, role: StaffRole, passcode: string): Promise<number> {
  const hash = await hashPasscode(passcode);
  return adminDb.runTransaction(async (tx) => {
    const community = (await tx.get(communityRef(communityId))).data() as CommunityRecord;
    const epoch = community.sessionEpoch + 1;
    tx.update(privateAuthRef(communityId), {
      [`passcodes.${role}`]: hash,
      [`readablePasscodes.${role}`]: passcode,
      [`portalPasses.${role}`]: FieldValue.delete()
    });
    tx.update(communityRef(communityId), { sessionEpoch: epoch });
    return epoch;
  });
}

// A new gateway code signs out every device too. Portal links and QR codes go
// with the code, so a leaked one stops working as well.
export async function rotateGatewayCode(communityId: string): Promise<{ gatewayCode: string; epoch: number }> {
  const gatewayCode = generateGatewayCode();
  const epoch = await adminDb.runTransaction(async (tx) => {
    const community = (await tx.get(communityRef(communityId))).data() as CommunityRecord;
    const auth = (await tx.get(privateAuthRef(communityId))).data();
    const slug = generateGatewaySlug(community.name);
    if (auth?.gatewayCode) tx.delete(gatewayCodeRef(auth.gatewayCode));
    if (auth?.slug) tx.delete(gatewaySlugRef(auth.slug));
    tx.set(gatewayCodeRef(gatewayCode), { communityId });
    tx.set(gatewaySlugRef(slug), { communityId });
    tx.update(privateAuthRef(communityId), { gatewayCode, slug, portalPasses: FieldValue.delete() });
    tx.update(communityRef(communityId), { sessionEpoch: community.sessionEpoch + 1 });
    return community.sessionEpoch + 1;
  });
  return { gatewayCode: formatGatewayCode(gatewayCode), epoch };
}
