import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { firebaseConfig } from "../firebaseConfig";

// The owner signs in on a Firebase app of their own, so it never replaces a
// gateway session this browser already has.
const ownerApp = initializeApp(firebaseConfig, "owner");
export const ownerAuth = getAuth(ownerApp);

// Local development runs against the emulators, never the live accounts.
if (import.meta.env.DEV) {
  connectAuthEmulator(ownerAuth, `http://${window.location.hostname}:9099`, { disableWarnings: true });
}

// Sends a request as the signed-in owner, throwing the server's message on failure.
export async function ownerRequest<T = any>(path: string, body?: object, method: "GET" | "POST" = "POST"): Promise<T> {
  const token = await ownerAuth.currentUser?.getIdToken();
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      ...(method === "POST" ? { body: JSON.stringify(body || {}) } : {})
    });
  } catch {
    throw new Error("SwingScore can't be reached. Check the connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
  return data as T;
}
