import { auth } from "../firebase";

export const SESSION_EXPIRED_EVENT = "swingscore:session-expired";

// Sends a request with this device's session, throwing the server's message on failure.
export async function apiRequest<T = any>(path: string, body?: object, method: "GET" | "POST" = "POST"): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
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
    throw new Error("No connection. Check the Wi-Fi and try again.");
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (data.code === "session_expired") window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    throw new Error(data.error || "Something went wrong. Please try again.");
  }
  return data;
}
