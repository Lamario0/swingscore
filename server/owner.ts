import type { Express, Request, Response } from "express";
import type { GatewayStatus, OwnerGateway, StaffRole } from "../src/types";
import { adminAuth, adminDb } from "./firebaseAdmin";
import {
  communityRef, createCommunity, ensureGatewaySlug, formatGatewayCode, generateOwnerAdminPass, generatePasscode, privateAuthRef,
  rotateGatewayCode, setRolePasscode, STAFF_ROLES, type CommunityRecord
} from "./gateway";
import { HttpError, sendError } from "./state";

interface Owner {
  uid: string;
  email: string;
}

// The platform owner signs in with their Google account, which
// scripts/grant-owner.ts marks with the platformOwner claim. Only the server
// can set that claim, and gateway devices never carry it.
async function authenticateOwner(req: Request): Promise<Owner> {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ")
    ? await adminAuth.verifyIdToken(header.slice("Bearer ".length), true).catch(() => null)
    : null;
  if (!token) throw new HttpError(401, "Sign in to continue", "owner_signed_out");
  if (token.platformOwner !== true) throw new HttpError(403, "This account isn't the SwingScore owner", "not_owner");
  return { uid: token.uid, email: token.email || "" };
}

type OwnerHandler = (req: Request, owner: Owner) => Promise<unknown>;

const ownerRoute = (handler: OwnerHandler) => async (req: Request, res: Response) => {
  try {
    res.json(await handler(req, await authenticateOwner(req)));
  } catch (error) {
    sendError(res, error);
  }
};

// Every change the owner makes is kept in a server-only log.
const logOwnerAction = (owner: Owner, action: string, communityId: string) =>
  adminDb.collection("ownerLog").add({ action, communityId, by: owner.email, at: Date.now() });

async function readCommunity(communityId: string): Promise<CommunityRecord> {
  if (!/^[\w-]+$/.test(communityId)) throw new HttpError(404, "That gateway doesn't exist");
  const community = (await communityRef(communityId).get()).data() as CommunityRecord | undefined;
  if (!community) throw new HttpError(404, "That gateway doesn't exist");
  return community;
}

async function toOwnerGateway(communityId: string, community: CommunityRecord, auth: FirebaseFirestore.DocumentData | undefined): Promise<OwnerGateway> {
  return {
    communityId,
    name: community.name,
    status: community.status,
    isMine: !!community.isOwnerCommunity,
    createdAt: community.createdAt,
    gatewayCode: formatGatewayCode(auth?.gatewayCode || ""),
    // Gateways made before portal links get their link the first time it's needed.
    slug: auth?.slug || await ensureGatewaySlug(communityId),
    passcodes: auth?.readablePasscodes || {}
  };
}

async function readGateway(communityId: string): Promise<OwnerGateway> {
  const community = await readCommunity(communityId);
  return toOwnerGateway(communityId, community, (await privateAuthRef(communityId).get()).data());
}

const STATUSES: GatewayStatus[] = ["active", "locked"];

export function registerOwnerRoutes(app: Express) {
  app.get("/api/owner/gateways", ownerRoute(async () => {
    const communities = await adminDb.collection("communities").get();
    if (communities.empty) return { gateways: [] };
    const auths = await adminDb.getAll(...communities.docs.map((doc) => privateAuthRef(doc.id)));
    const gateways = await Promise.all(communities.docs.map((doc, i) =>
      toOwnerGateway(doc.id, doc.data() as CommunityRecord, auths[i].data())
    ));
    gateways.sort((a, b) => Number(b.isMine) - Number(a.isMine) || a.name.localeCompare(b.name));
    return { gateways };
  }));

  app.post("/api/owner/gateways", ownerRoute(async (req, owner) => {
    const name = String(req.body.name || "").trim();
    if (!name) throw new HttpError(400, "Enter a community name");
    if (name.length > 60) throw new HttpError(400, "Use 60 characters or fewer");
    const { communityId } = await createCommunity(name);
    await logOwnerAction(owner, "create", communityId);
    return { gateway: await readGateway(communityId) };
  }));

  app.post("/api/owner/gateways/:id/rotate-code", ownerRoute(async (req, owner) => {
    await readCommunity(req.params.id);
    await rotateGatewayCode(req.params.id);
    await logOwnerAction(owner, "rotate-code", req.params.id);
    return { gateway: await readGateway(req.params.id) };
  }));

  app.post("/api/owner/gateways/:id/passcode", ownerRoute(async (req, owner) => {
    const role = req.body.role as StaffRole;
    if (!STAFF_ROLES.includes(role)) throw new HttpError(400, "Unknown portal");
    await readCommunity(req.params.id);
    await setRolePasscode(req.params.id, role, generatePasscode());
    await logOwnerAction(owner, `passcode:${role}`, req.params.id);
    return { gateway: await readGateway(req.params.id) };
  }));

  app.post("/api/owner/gateways/:id/status", ownerRoute(async (req, owner) => {
    const status = req.body.status as GatewayStatus;
    if (!STATUSES.includes(status)) throw new HttpError(400, "Choose active or locked");
    await readCommunity(req.params.id);
    await communityRef(req.params.id).update({ status });
    await logOwnerAction(owner, `status:${status}`, req.params.id);
    return { gateway: await readGateway(req.params.id) };
  }));

  app.post("/api/owner/gateways/:id/rename", ownerRoute(async (req, owner) => {
    const name = String(req.body.name || "").trim();
    if (!name) throw new HttpError(400, "Enter a community name");
    if (name.length > 60) throw new HttpError(400, "Use 60 characters or fewer");
    await readCommunity(req.params.id);
    await communityRef(req.params.id).update({ name });
    await logOwnerAction(owner, "rename", req.params.id);
    return { gateway: await readGateway(req.params.id) };
  }));

  app.post("/api/owner/gateways/:id/mine", ownerRoute(async (req, owner) => {
    await readCommunity(req.params.id);
    await communityRef(req.params.id).update({ isOwnerCommunity: req.body.isMine === true });
    await logOwnerAction(owner, req.body.isMine === true ? "mark-mine" : "unmark-mine", req.params.id);
    return { gateway: await readGateway(req.params.id) };
  }));

  // Only the owner's own community opens this way; customers' gateways stay theirs.
  app.post("/api/owner/gateways/:id/admin-link", ownerRoute(async (req, owner) => {
    const community = await readCommunity(req.params.id);
    if (!community.isOwnerCommunity) throw new HttpError(403, "Only your own community opens as Admin from here");
    const ownerAdminPass = generateOwnerAdminPass();
    await privateAuthRef(req.params.id).update({ ownerAdminPass });
    await logOwnerAction(owner, "open-admin", req.params.id);
    return { path: `/owner-admin#community=${req.params.id}&pass=${ownerAdminPass.pass}` };
  }));
}
