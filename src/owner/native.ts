import { Capacitor, registerPlugin } from "@capacitor/core";
import { copyText } from "../utils/clipboard";

// Added to the page by the desktop app's preload script.
interface DesktopBridge {
  signInWithGoogle(): Promise<string>;
  openExternal(url: string): Promise<void>;
}

declare global {
  interface Window {
    swingscoreDesktop?: DesktopBridge;
  }
}

// The Android app's native plugins, reached by name so the page doesn't have
// to bundle their JavaScript.
const FirebaseAuthentication = registerPlugin<{
  signInWithGoogle(options: { skipNativeAuth: boolean }): Promise<{ credential?: { idToken?: string } }>;
}>("FirebaseAuthentication");
const Share = registerPlugin<{ share(options: { title: string; text: string; dialogTitle?: string }): Promise<unknown> }>("Share");
const Browser = registerPlugin<{ open(options: { url: string }): Promise<void> }>("Browser");

export type Platform = "desktop" | "android" | "browser";

export const platform: Platform = window.swingscoreDesktop
  ? "desktop"
  : Capacitor.isNativePlatform() ? "android" : "browser";

// Google doesn't allow its sign-in inside an app's own window, so the apps sign
// in natively and pass the ID token to the page. A plain browser gets null and
// uses Firebase's popup.
export async function getNativeGoogleIdToken(): Promise<string | null> {
  if (platform === "desktop") return window.swingscoreDesktop!.signInWithGoogle();
  if (platform === "android") {
    const { credential } = await FirebaseAuthentication.signInWithGoogle({ skipNativeAuth: true });
    if (!credential?.idToken) throw new Error("Google didn't return a sign-in. Please try again.");
    return credential.idToken;
  }
  return null;
}

export type ShareResult = "shared" | "copied" | "cancelled" | "failed";

// Android and most phone browsers have a share sheet (texts, WhatsApp, email).
// Windows doesn't, so the desktop app copies the message instead.
export async function shareText(title: string, text: string): Promise<ShareResult> {
  try {
    if (platform === "android") {
      await Share.share({ title, text, dialogTitle: title });
      return "shared";
    }
    if (platform === "browser" && navigator.share) {
      await navigator.share({ title, text });
      return "shared";
    }
  } catch {
    return "cancelled";
  }
  return (await copyText(text)) ? "copied" : "failed";
}

export async function openExternal(url: string) {
  if (platform === "desktop") return window.swingscoreDesktop!.openExternal(url);
  if (platform === "android") return Browser.open({ url });
  window.open(url, "_blank", "noopener");
}

export const emailDraft = (subject: string, body: string) =>
  openExternal(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
