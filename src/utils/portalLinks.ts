import { ViewRole } from "../types";

// Staff and spectators reach their portal through a link the Admin shares, such
// as /g/westies-k3f9mp/judge, so only the Admin ever needs the gateway code.
export const LINKED_PORTALS = {
  judge: "judge",
  coordinator: "coordinator",
  registration: "competitor",
  scoring: "scoring",
  results: "results"
} as const satisfies Record<string, ViewRole>;

export type LinkedPortal = keyof typeof LINKED_PORTALS;

export function parsePortalLink(pathname: string): { slug: string; role: ViewRole } | null {
  const match = pathname.toLowerCase().match(/^\/g\/([a-z0-9-]+)\/([a-z]+)\/?$/);
  if (!match || !(match[2] in LINKED_PORTALS)) return null;
  return { slug: match[1], role: LINKED_PORTALS[match[2] as LinkedPortal] };
}

export const getPortalLink = (slug: string, portal: LinkedPortal) =>
  `${window.location.origin}/g/${slug}/${portal}`;

// A QR code's pass travels after the #, which browsers never send to a server,
// so it stays out of request logs. The app removes it from the address on arrival.
export const getPassLink = (slug: string, portal: LinkedPortal, pass: string) =>
  `${getPortalLink(slug, portal)}#pass=${pass}`;

export const readPortalPass = (hash: string) => new URLSearchParams(hash.slice(1)).get("pass") || "";
