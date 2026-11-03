import { useCallback, useEffect, useState } from "react";
import { onIdTokenChanged, signInWithCustomToken, signOut, type User } from "firebase/auth";
import { clearIndexedDbPersistence, terminate } from "firebase/firestore";
import { auth, db } from "../firebase";
import { GatewaySession, StaffRole, ViewRole } from "../types";
import { apiRequest, SESSION_EXPIRED_EVENT } from "../utils/api";

async function readSession(user: User): Promise<GatewaySession | null> {
  const { claims } = await user.getIdTokenResult();
  if (typeof claims.communityId !== "string") return null;
  return {
    communityId: claims.communityId,
    roles: (claims.roles as StaffRole[]) || [],
    judgeName: claims.judgeName as string | undefined,
    linkSlug: claims.linkSlug as string | undefined
  };
}

// This device's connection to a community's gateway. Firebase remembers it, so
// a device only enters the gateway code once.
export function useGatewaySession() {
  const [session, setSession] = useState<GatewaySession | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    return onIdTokenChanged(auth, async (user) => {
      setSession(user ? await readSession(user) : null);
      setIsReady(true);
    });
  }, []);

  // The server sends a new token whenever this device's roles or judge name
  // change. Apply it before resolving, so the next request already carries it.
  const applyToken = useCallback(async (token: string) => {
    const { user } = await signInWithCustomToken(auth, token);
    setSession(await readSession(user));
  }, []);

  const connect = useCallback(async (code: string) => {
    const { token } = await apiRequest("/api/gateway/connect", { code });
    await applyToken(token);
  }, [applyToken]);

  const connectWithLink = useCallback(async (slug: string) => {
    const { token } = await apiRequest("/api/gateway/connect-link", { slug });
    await applyToken(token);
  }, [applyToken]);

  const connectWithPass = useCallback(async (slug: string, role: ViewRole, pass: string) => {
    const { token } = await apiRequest("/api/gateway/connect-pass", { slug, role, pass });
    await applyToken(token);
  }, [applyToken]);

  const loginRole = useCallback(async (role: StaffRole, passcode: string) => {
    const { token } = await apiRequest("/api/gateway/role-login", { role, passcode });
    await applyToken(token);
  }, [applyToken]);

  const logoutRole = useCallback(async (role: StaffRole) => {
    const { token } = await apiRequest("/api/gateway/role-logout", { role });
    await applyToken(token);
  }, [applyToken]);

  // Leaving clears the local copy of the community's data, then reloads because
  // a cleared Firestore instance can't be used again.
  const leaveGateway = useCallback(async () => {
    await signOut(auth);
    localStorage.removeItem("swingscore_judge_claim");
    await terminate(db);
    await clearIndexedDbPersistence(db).catch(() => {});
    window.location.reload();
  }, []);

  useEffect(() => {
    window.addEventListener(SESSION_EXPIRED_EVENT, leaveGateway);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, leaveGateway);
  }, [leaveGateway]);

  return { session, isReady, connect, connectWithLink, connectWithPass, loginRole, logoutRole, applyToken, leaveGateway };
}
