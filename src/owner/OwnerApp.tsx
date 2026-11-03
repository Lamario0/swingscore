import React, { useEffect, useState } from "react";
import { GoogleAuthProvider, onIdTokenChanged, signInWithCredential, signInWithPopup, signOut } from "firebase/auth";
import {
  AlertCircle, Check, ChevronDown, ChevronUp, Copy, ExternalLink, Eye, EyeOff, KeyRound, Lock, LogOut, Mail, Pencil,
  Plus, RefreshCw, Search, Share2, ShieldCheck, Unlock, X
} from "lucide-react";
import type { OwnerGateway, StaffRole } from "../types";
import { copyText } from "../utils/clipboard";
import { getPortalLink, LINKED_PORTALS, type LinkedPortal } from "../utils/portalLinks";
import { emailDraft, getNativeGoogleIdToken, openExternal, platform, shareText } from "./native";
import { ownerAuth, ownerRequest } from "./ownerApi";

const ROLES: { role: StaffRole; label: string }[] = [
  { role: "admin", label: "Admin" },
  { role: "judge", label: "Judge" },
  { role: "coordinator", label: "Floor Coordinator" },
  { role: "scoring", label: "Scoring" },
  { role: "competitor", label: "Registration" }
];

const PORTAL_LABELS: Record<LinkedPortal, string> = {
  judge: "Judge",
  coordinator: "Floor Coordinator",
  registration: "Registration",
  scoring: "Scoring",
  results: "Results"
};

type AuthState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "notOwner"; email: string }
  | { status: "owner"; email: string };

const buttonClass = "inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200";
const primaryButtonClass = "inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-600/20";
const inputClass = "w-full px-3.5 py-2.5 text-sm rounded-xl border bg-slate-800 border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-violet-500";

// Sign-in failures worth explaining. Closing the popup isn't one of them.
function describeSignInError(error: any): string {
  const code = String(error?.code || "");
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return "";
  if (code === "auth/operation-not-allowed") return "Google sign-in isn't turned on for SwingScore yet.";
  if (code === "auth/popup-blocked") return "The browser blocked the sign-in window. Allow pop-ups for this site and try again.";
  return error?.message || "Sign-in didn't work. Please try again.";
}

const shareMessage = (gateway: OwnerGateway, withAdminPasscode: boolean) => [
  `Your SwingScore gateway for ${gateway.name}:`,
  `Go to ${window.location.origin} and enter gateway code ${gateway.gatewayCode}.`,
  withAdminPasscode && gateway.passcodes.admin ? `Admin passcode: ${gateway.passcodes.admin}` : ""
].filter(Boolean).join("\n");

// The desktop app can't show Google's sign-in, so it opens this page in your
// normal browser. Once you've signed in here, the page hands Google's sign-in
// back to the app through a listener on this computer only.
function DesktopSignIn({ port, state }: { port: string; state: string }) {
  const [error, setError] = useState("");
  const [isSending, setIsSending] = useState(false);
  const isValid = /^\d{4,5}$/.test(port) && /^[\w-]{16,}$/.test(state);

  const signIn = async () => {
    setError("");
    try {
      const wasSignedIn = !!ownerAuth.currentUser;
      const result = await signInWithPopup(ownerAuth, new GoogleAuthProvider());
      const idToken = GoogleAuthProvider.credentialFromResult(result)?.idToken;
      // This browser only lent its sign-in to the app.
      if (!wasSignedIn) await signOut(ownerAuth);
      if (!idToken) throw new Error("Google didn't return a sign-in. Please try again.");
      setIsSending(true);
      window.location.href = `http://127.0.0.1:${port}/done?state=${encodeURIComponent(state)}&idToken=${encodeURIComponent(idToken)}`;
    } catch (err) {
      setError(describeSignInError(err));
    }
  };

  return (
    <div className="max-w-sm mx-auto py-16 px-4 text-center">
      <ShieldCheck className="w-10 h-10 mx-auto text-violet-500" />
      <h1 className="mt-4 text-xl font-bold text-slate-100">Sign in to SwingScore Owner for Windows</h1>
      {isValid ? (
        <>
          <p className="mt-2 text-sm text-slate-400">Sign in with Google here, and the app on this computer signs in too.</p>
          <button type="button" id="desktop-sign-in-btn" onClick={signIn} disabled={isSending} className={`${primaryButtonClass} mt-6 w-full`}>
            {isSending ? "Returning to the app..." : "Sign in with Google"}
          </button>
        </>
      ) : (
        <p className="mt-2 text-sm text-rose-400">This sign-in link isn't complete. Start again from the desktop app.</p>
      )}
      {error && <p className="mt-4 text-sm text-rose-400">{error}</p>}
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [result, setResult] = useState<boolean | null>(null);
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={async () => {
        setResult(await copyText(text));
        setTimeout(() => setResult(null), 1500);
      }}
      className="p-1.5 rounded-lg text-slate-400 hover:text-violet-400 hover:bg-violet-500/10 transition-colors cursor-pointer flex-shrink-0"
    >
      {result === null ? <Copy className="w-4 h-4" /> : result ? <Check className="w-4 h-4 text-green-500" /> : <X className="w-4 h-4 text-rose-500" />}
    </button>
  );
}

interface GatewayCardProps {
  gateway: OwnerGateway;
  isNew: boolean;
  onChange: (gateway: OwnerGateway) => void;
}

function GatewayCard({ gateway, isNew, onChange }: GatewayCardProps) {
  const [isOpen, setIsOpen] = useState(isNew);
  const [isCodeShown, setIsCodeShown] = useState(isNew);
  const [arePasscodesShown, setArePasscodesShown] = useState(isNew);
  const [includeAdminPasscode, setIncludeAdminPasscode] = useState(false);
  const [resetRole, setResetRole] = useState<StaffRole>("admin");
  const [newName, setNewName] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState<{ text: string; isError: boolean } | null>(null);
  const isLocked = gateway.status === "locked";
  const base = `/api/owner/gateways/${gateway.communityId}`;

  const run = async (label: string, path: string, body: object = {}, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(label);
    setNote(null);
    try {
      const { gateway: updated } = await ownerRequest<{ gateway: OwnerGateway }>(path, body);
      onChange(updated);
      setNote({ text: label, isError: false });
    } catch (err: any) {
      setNote({ text: err.message, isError: true });
    } finally {
      setBusy("");
    }
  };

  const share = async () => {
    const result = await shareText(`SwingScore gateway for ${gateway.name}`, shareMessage(gateway, includeAdminPasscode));
    if (result === "copied") setNote({ text: "Copied. Paste it into a text or email.", isError: false });
    if (result === "failed") setNote({ text: "Couldn't share or copy the message.", isError: true });
  };

  const openAdminPortal = async () => {
    // A browser only opens a new tab straight from the click.
    const tab = platform === "browser" ? window.open("about:blank", "_blank") : null;
    setBusy("Opening the Admin portal");
    setNote(null);
    try {
      const { path } = await ownerRequest<{ path: string }>(`${base}/admin-link`);
      const url = `${window.location.origin}${path}`;
      if (tab) {
        tab.opener = null;
        tab.location.href = url;
      } else {
        await openExternal(url);
      }
    } catch (err: any) {
      tab?.close();
      setNote({ text: err.message, isError: true });
    } finally {
      setBusy("");
    }
  };

  const saveName = async () => {
    if (newName === null || newName.trim() === gateway.name) {
      setNewName(null);
      return;
    }
    await run("Renamed", `${base}/rename`, { name: newName });
    setNewName(null);
  };

  return (
    <div id={`gateway-${gateway.communityId}`} className={`rounded-2xl border transition-all ${isNew ? "border-violet-500/60" : "border-slate-800"} bg-slate-900`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className="w-full px-4 py-3.5 flex items-center gap-3 text-left cursor-pointer"
      >
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-bold text-slate-100 truncate">{gateway.name}</span>
          <span className="mt-1 flex items-center gap-1.5 flex-wrap">
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${isLocked ? "bg-rose-500/15 text-rose-400" : "bg-green-500/15 text-green-400"}`}>
              {isLocked ? "Locked" : "Active"}
            </span>
            {gateway.isMine && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-500/15 text-violet-300">Mine</span>}
          </span>
        </span>
        {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>

      {isOpen && (
        <div className="px-4 pb-4 space-y-4 border-t border-slate-800 pt-4">
          {note && (
            <p role="status" className={`text-xs font-semibold ${note.isError ? "text-rose-400" : "text-green-400"}`}>{note.text}</p>
          )}

          <section>
            <p className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-1.5">Gateway code</p>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xl font-bold tracking-widest text-slate-100">
                {isCodeShown ? gateway.gatewayCode : "••••-••••"}
              </span>
              <button
                type="button"
                aria-label={isCodeShown ? "Hide gateway code" : "Show gateway code"}
                onClick={() => setIsCodeShown(!isCodeShown)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                {isCodeShown ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              <CopyButton text={gateway.gatewayCode} label="Copy gateway code" />
            </div>
          </section>

          <section className="space-y-2">
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
              <input type="checkbox" checked={includeAdminPasscode} onChange={(e) => setIncludeAdminPasscode(e.target.checked)} className="cursor-pointer" />
              Include the Admin passcode
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={share} className={buttonClass}>
                <Share2 className="w-3.5 h-3.5" />
                {platform === "desktop" ? "Copy message" : "Share"}
              </button>
              {platform !== "android" && (
                <button
                  type="button"
                  onClick={() => emailDraft(`SwingScore gateway for ${gateway.name}`, shareMessage(gateway, includeAdminPasscode))}
                  className={buttonClass}
                >
                  <Mail className="w-3.5 h-3.5" />
                  Email
                </button>
              )}
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] font-mono uppercase tracking-wider text-slate-500">Passcodes</p>
              <button
                type="button"
                onClick={() => setArePasscodesShown(!arePasscodesShown)}
                className="text-[11px] font-semibold text-violet-400 hover:text-violet-300 cursor-pointer"
              >
                {arePasscodesShown ? "Hide" : "Show"}
              </button>
            </div>
            <dl className="space-y-1">
              {ROLES.map(({ role, label }) => (
                <div key={role} className="flex items-center justify-between gap-3 text-xs">
                  <dt className="text-slate-400">{label}</dt>
                  <dd className="flex items-center gap-1">
                    <span className="font-mono font-bold text-slate-200">
                      {!gateway.passcodes[role] ? <span className="text-amber-400 font-sans font-semibold text-[11px]">Not on file</span> : arePasscodesShown ? gateway.passcodes[role] : "••••••"}
                    </span>
                    {gateway.passcodes[role] && <CopyButton text={gateway.passcodes[role]!} label={`Copy ${label} passcode`} />}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section>
            <p className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-1.5">Portal links</p>
            <ul className="space-y-1">
              {(Object.keys(LINKED_PORTALS) as LinkedPortal[]).map((portal) => (
                <li key={portal} className="flex items-center gap-2 text-xs">
                  <span className="w-28 flex-shrink-0 text-slate-400">{PORTAL_LABELS[portal]}</span>
                  <span className="flex-1 min-w-0 truncate font-mono text-[11px] text-slate-500">{getPortalLink(gateway.slug, portal)}</span>
                  <CopyButton text={getPortalLink(gateway.slug, portal)} label={`Copy ${PORTAL_LABELS[portal]} link`} />
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-3 pt-1 border-t border-slate-800">
            {gateway.isMine && (
              <button type="button" id={`open-admin-${gateway.communityId}`} onClick={openAdminPortal} disabled={!!busy} className={`${primaryButtonClass} w-full mt-3`}>
                <ExternalLink className="w-4 h-4" />
                Open Admin portal
              </button>
            )}

            {newName !== null ? (
              <div className="flex gap-2 mt-3">
                <input
                  autoFocus
                  value={newName}
                  maxLength={60}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveName()}
                  aria-label="Community name"
                  className={inputClass}
                />
                <button type="button" onClick={saveName} disabled={!!busy} className={buttonClass}>Save</button>
                <button type="button" onClick={() => setNewName(null)} className={buttonClass}>Cancel</button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2 mt-3">
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => run("New gateway code made", `${base}/rotate-code`, {}, `Make a new gateway code for ${gateway.name}? The old code, portal links and QR codes stop working, and every device in this community is signed out.`)}
                  className={buttonClass}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${busy === "New gateway code made" ? "animate-spin" : ""}`} />
                  New gateway code
                </button>
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => run(isLocked ? "Unlocked" : "Locked", `${base}/status`, { status: isLocked ? "active" : "locked" }, isLocked ? undefined : `Lock ${gateway.name}? Nobody can use its portals until you unlock it. Its data is kept.`)}
                  className={buttonClass}
                >
                  {isLocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                  {isLocked ? "Unlock" : "Lock"}
                </button>
                <button type="button" disabled={!!busy} onClick={() => setNewName(gateway.name)} className={buttonClass}>
                  <Pencil className="w-3.5 h-3.5" />
                  Rename
                </button>
              </div>
            )}

            <div className="flex gap-2">
              <select
                value={resetRole}
                onChange={(e) => setResetRole(e.target.value as StaffRole)}
                aria-label="Passcode to reset"
                className="flex-1 min-w-0 px-3 py-2 text-xs rounded-xl border bg-slate-800 border-slate-700 text-slate-100"
              >
                {ROLES.map(({ role, label }) => <option key={role} value={role}>{label}</option>)}
              </select>
              <button
                type="button"
                disabled={!!busy}
                onClick={() => {
                  const label = ROLES.find((r) => r.role === resetRole)!.label;
                  run(`New ${label} passcode made`, `${base}/passcode`, { role: resetRole }, `Make a new ${label} passcode for ${gateway.name}? Every device in this community is signed out.`);
                  setArePasscodesShown(true);
                }}
                className={buttonClass}
              >
                <KeyRound className="w-3.5 h-3.5" />
                New passcode
              </button>
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={gateway.isMine}
                disabled={!!busy}
                onChange={(e) => run(e.target.checked ? "Marked as your community" : "No longer marked as yours", `${base}/mine`, { isMine: e.target.checked })}
                className="cursor-pointer"
              />
              This is my community
            </label>

            {gateway.createdAt && (
              <p className="text-[10px] text-slate-500">Created {new Date(gateway.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

export default function OwnerApp() {
  const [authState, setAuthState] = useState<AuthState>({ status: "loading" });
  const [signInError, setSignInError] = useState("");
  const [gateways, setGateways] = useState<OwnerGateway[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [newGatewayName, setNewGatewayName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [newGatewayId, setNewGatewayId] = useState("");

  const [route, query = ""] = window.location.hash.slice(1).split("?");
  const isDesktopSignIn = route === "desktop-sign-in";

  useEffect(() => onIdTokenChanged(ownerAuth, async (user) => {
    if (!user) {
      setAuthState({ status: "signedOut" });
      return;
    }
    const { claims } = await user.getIdTokenResult();
    setAuthState(claims.platformOwner === true
      ? { status: "owner", email: user.email || "" }
      : { status: "notOwner", email: user.email || "" });
  }), []);

  const loadGateways = () => {
    setLoadError("");
    ownerRequest<{ gateways: OwnerGateway[] }>("/api/owner/gateways", undefined, "GET")
      .then(({ gateways }) => setGateways(gateways))
      .catch((err) => setLoadError(err.message));
  };

  useEffect(() => {
    if (authState.status === "owner" && !isDesktopSignIn) loadGateways();
  }, [authState.status]);

  if (isDesktopSignIn) {
    const params = new URLSearchParams(query);
    return <DesktopSignIn port={params.get("port") || ""} state={params.get("state") || ""} />;
  }

  const signIn = async () => {
    setSignInError("");
    try {
      const idToken = await getNativeGoogleIdToken();
      if (idToken) await signInWithCredential(ownerAuth, GoogleAuthProvider.credential(idToken));
      else await signInWithPopup(ownerAuth, new GoogleAuthProvider());
    } catch (err) {
      setSignInError(describeSignInError(err));
    }
  };

  const createGateway = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    setCreateError("");
    try {
      const { gateway } = await ownerRequest<{ gateway: OwnerGateway }>("/api/owner/gateways", { name: newGatewayName });
      setGateways((prev) => [gateway, ...(prev || [])]);
      setNewGatewayId(gateway.communityId);
      setNewGatewayName("");
    } catch (err: any) {
      setCreateError(err.message);
    } finally {
      setIsCreating(false);
    }
  };

  const replaceGateway = (updated: OwnerGateway) =>
    setGateways((prev) => (prev || []).map((g) => (g.communityId === updated.communityId ? updated : g)));

  const term = search.trim().toLowerCase();
  const shownGateways = (gateways || []).filter((g) =>
    !term || g.name.toLowerCase().includes(term) || g.gatewayCode.toLowerCase().includes(term)
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/95 backdrop-blur">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <ShieldCheck className="w-6 h-6 text-violet-500 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-extrabold tracking-tight">SwingScore Owner</h1>
            {"email" in authState && <p className="text-[11px] text-slate-500 truncate">{authState.email}</p>}
          </div>
          {"email" in authState && (
            <button type="button" id="owner-sign-out-btn" onClick={() => signOut(ownerAuth)} className={buttonClass}>
              <LogOut className="w-3.5 h-3.5" />
              Sign out
            </button>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {authState.status === "loading" && (
          <div className="py-20 flex justify-center"><RefreshCw className="w-6 h-6 text-violet-500 animate-spin" /></div>
        )}

        {authState.status === "signedOut" && (
          <div className="max-w-sm mx-auto py-12 text-center">
            <p className="text-sm text-slate-400">Manage every SwingScore gateway: create them, send their codes, and lock or reset them.</p>
            <button type="button" id="owner-sign-in-btn" onClick={signIn} className={`${primaryButtonClass} mt-6 w-full`}>
              Sign in with Google
            </button>
            {platform === "desktop" && <p className="mt-3 text-xs text-slate-500">Google opens in your web browser. Come back here once you've signed in.</p>}
            {signInError && <p className="mt-4 text-sm text-rose-400">{signInError}</p>}
          </div>
        )}

        {authState.status === "notOwner" && (
          <div id="owner-not-granted" className="max-w-sm mx-auto py-12 text-center">
            <AlertCircle className="w-8 h-8 mx-auto text-amber-500" />
            <p className="mt-3 text-sm text-slate-300">This account isn't the SwingScore owner yet.</p>
            <p className="mt-1 text-xs text-slate-500">Once it's been granted, check again.</p>
            <button type="button" onClick={() => ownerAuth.currentUser?.getIdToken(true)} className={`${buttonClass} mt-5`}>
              <RefreshCw className="w-3.5 h-3.5" />
              Check again
            </button>
          </div>
        )}

        {authState.status === "owner" && (
          <div className="space-y-5">
            <form onSubmit={createGateway} className="p-4 rounded-2xl border border-slate-800 bg-slate-900 space-y-3">
              <h2 className="text-sm font-bold">New gateway</h2>
              <div className="flex gap-2">
                <input
                  id="new-gateway-name"
                  value={newGatewayName}
                  onChange={(e) => setNewGatewayName(e.target.value)}
                  placeholder="Community name"
                  maxLength={60}
                  required
                  className={inputClass}
                />
                <button type="submit" id="create-gateway-btn" disabled={isCreating} className={primaryButtonClass}>
                  <Plus className="w-4 h-4" />
                  {isCreating ? "Creating..." : "Create"}
                </button>
              </div>
              {createError && <p className="text-xs text-rose-400">{createError}</p>}
            </form>

            <div className="relative">
              <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
              <input
                id="gateway-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or gateway code"
                className={`${inputClass} pl-10`}
              />
            </div>

            {loadError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400 flex items-center justify-between gap-3">
                <span>{loadError}</span>
                <button type="button" onClick={loadGateways} className={buttonClass}>Try again</button>
              </div>
            )}

            {gateways === null && !loadError ? (
              <div className="py-12 flex justify-center"><RefreshCw className="w-6 h-6 text-violet-500 animate-spin" /></div>
            ) : (
              <div id="gateway-list" className="space-y-3">
                {shownGateways.map((gateway) => (
                  <React.Fragment key={gateway.communityId}>
                    <GatewayCard gateway={gateway} isNew={gateway.communityId === newGatewayId} onChange={replaceGateway} />
                  </React.Fragment>
                ))}
                {gateways && shownGateways.length === 0 && (
                  <p className="py-8 text-center text-sm text-slate-500">{term ? "No gateway matches that search." : "No gateways yet. Create the first one above."}</p>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
