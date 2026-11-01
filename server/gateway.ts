import { createHash, randomBytes, randomInt, randomUUID, scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";
import type { GatewayStatus, StaffRole } from "../src/types";
import { adminAuth, adminDb } from "./firebaseAdmin";
import { blankSettings, HttpError, saveCommunityState } from "./state";

const scryptAsync = promisify(scrypt) as (password: string, salt: string, keylen: number) => Promise<Buffer>;

export const STAFF_ROLES: StaffRole[] = ["admin", "judge", "coordinator", "scoring", "competitor"];

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
  const community: CommunityRecord = { name, status: "active", sessionEpoch: 1 };
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
