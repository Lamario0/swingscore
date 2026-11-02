import { auth } from "../firebase";

export const SESSION_EXPIRED_EVENT = "swingscore:session-expired";

// Browsers can refuse the modern clipboard, as they do on a plain http address,
// so this falls back to the older way of copying a selection.
export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const field = document.createElement("textarea");
    field.value = text;
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.append(field);
    field.select();
    const didCopy = document.execCommand("copy");
    field.remove();
    return didCopy;
  }
}

// Saves a file from the API to this device.
export async function apiDownload(path: string, fileName: string) {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Something went wrong. Please try again.");
  }
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

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
