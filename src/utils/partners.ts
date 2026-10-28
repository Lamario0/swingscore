import type { Competitor } from "../types";

// Strictly Swing and Routine are entered with a fixed partner (named at
// registration) instead of being drawn like Jack & Jill. Shared by the server
// (heat auto-population) and the client so both pair couples identically.

type PartnerFields = Pick<
  Competitor,
  "bib" | "name" | "role" | "division" | "strictlySwing" | "strictlyPartner" | "strictlyDivision" | "routine" | "routinePartner" | "routineDivision"
>;

export const STRICTLY_DIVISIONS = ["Newcomer", "Novice", "Intermediate", "Advance", "All-Star", "Pro", "Open"];
export const ROUTINE_DIVISIONS = ["Novice", "Intermediate", "Open"];

export function isPartneredContest(contestType?: string | null): boolean {
  return contestType === "Strictly Swing" || contestType === "Routine";
}

// Couples heats are judged as couple units rather than as separate Leader and
// Follower fields: every Jack & Jill Finals, and every round of a partnered contest.
export function isCouplesHeat(heat: { heatType?: string | null; contestType?: string | null; name?: string }): boolean {
  return heat.heatType === "Finals" || !!heat.name?.includes("Finals") || isPartneredContest(heat.contestType);
}

// The division (and partner, for partnered contests) a dancer entered for the
// given contest, or null if they didn't enter it. Jack & Jill uses the
// dancer's main registration division.
export function getContestRegistration(c: PartnerFields, contestType?: string | null): { division: string; partner: string } | null {
  if (contestType === "Strictly Swing") {
    return c.strictlySwing && c.strictlyDivision ? { division: c.strictlyDivision, partner: c.strictlyPartner || "" } : null;
  }
  if (contestType === "Routine") {
    return c.routine && c.routineDivision ? { division: c.routineDivision, partner: c.routinePartner || "" } : null;
  }
  return { division: c.division, partner: "" };
}

export function isRegisteredFor(c: PartnerFields, contestType: string | null | undefined, division: string): boolean {
  return getContestRegistration(c, contestType || "Jack & Jill")?.division === division;
}

// Registration is closed per contest+division once its check-in sheet exists.
// Jack & Jill keeps the bare division name so existing locks keep working.
export function getDivisionLockKey(contestType: string | null | undefined, division: string): string {
  return isPartneredContest(contestType) ? `${contestType}:${division}` : division;
}

const normalizeName = (name?: string) => (name || "").trim().toLowerCase().replace(/\s+/g, " ");

// A dancer's partner is the opposite-role entrant whose name matches the
// partner name they registered with, or who registered this dancer's name as
// their own partner. Anything else is left unpaired -- never guessed.
function findPartnerAmong<T extends PartnerFields>(dancer: T, candidates: T[], contestType: string): T | undefined {
  const dancerName = normalizeName(dancer.name);
  const namedPartner = normalizeName(getContestRegistration(dancer, contestType)?.partner);
  const pool = candidates.filter((o) => o.bib !== dancer.bib && o.role !== dancer.role);
  return (
    (namedPartner ? pool.find((o) => normalizeName(o.name) === namedPartner) : undefined) ||
    (dancerName ? pool.find((o) => normalizeName(getContestRegistration(o, contestType)?.partner) === dancerName) : undefined)
  );
}

export function findRegisteredPartner<T extends PartnerFields>(dancer: T, competitors: T[], contestType: string, division: string): T | undefined {
  return findPartnerAmong(dancer, competitors.filter((o) => isRegisteredFor(o, contestType, division)), contestType);
}

// Pairs every entrant of a partnered contest+division with their registered
// partner. `include` narrows the pool (e.g. checked-in only); a dancer whose
// partner is outside the pool is returned in `unpaired` rather than re-matched.
export function buildRegisteredCouples<T extends PartnerFields>(
  competitors: T[],
  contestType: string,
  division: string,
  include: (c: T) => boolean = () => true
): { couples: { id: string; leadBib: string; followBib: string }[]; unpaired: T[] } {
  const entrants = competitors.filter((c) => isRegisteredFor(c, contestType, division) && include(c));
  const follows = entrants.filter((c) => c.role === "Follow");
  const usedFollows = new Set<string>();
  const couples: { id: string; leadBib: string; followBib: string }[] = [];

  entrants
    .filter((c) => c.role === "Lead")
    .forEach((lead) => {
      const follow = findPartnerAmong(lead, follows.filter((f) => !usedFollows.has(f.bib)), contestType);
      if (follow) {
        usedFollows.add(follow.bib);
        couples.push({ id: `${lead.bib}_${follow.bib}`, leadBib: lead.bib, followBib: follow.bib });
      }
    });

  const paired = new Set(couples.flatMap((c) => [c.leadBib, c.followBib]));
  return { couples, unpaired: entrants.filter((c) => !paired.has(c.bib)) };
}

// Validation shared by the registration form and every edit form.
export function validatePartnerFields(v: Pick<Competitor, "strictlySwing" | "strictlyPartner" | "strictlyDivision" | "routine" | "routinePartner" | "routineDivision">): string | null {
  if (v.strictlySwing && !v.strictlyPartner?.trim()) return "Enter a partner name for Strictly Swing.";
  if (v.strictlySwing && !v.strictlyDivision) return "Choose a division for Strictly Swing.";
  if (v.routine && !v.routinePartner?.trim()) return "Enter a partner name for Routine.";
  if (v.routine && !v.routineDivision) return "Choose a division for Routine.";
  return null;
}
