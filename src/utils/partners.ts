import type { Competitor, ContestEntryFields } from "../types";

// Contest entries per dancer, and the fixed partnerships of Strictly Swing and
// Routine (named at registration instead of being drawn like Jack & Jill).
// Shared by the server (heat auto-population) and the client so both read
// entries and pair couples identically.

type EntrantFields = Pick<Competitor, "bib" | "name" | "role" | "division" | "heatStatus"> & ContestEntryFields;

type ContestType = "Jack & Jill" | "Strictly Swing" | "Routine";

// One division a dancer entered a contest in. Routines have no role (null).
export interface ContestEntry {
  contestType: ContestType;
  division: string;
  role: "Lead" | "Follow" | null;
  partner: string;
}

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

// Every contest entry a dancer registered: up to two Jack & Jill and two
// Strictly Swing divisions (each with its own role), and one Routine.
// Strictly roles fall back to the Jack & Jill role for registrations made
// before Strictly Swing had its own role.
export function getAllContestEntries(c: EntrantFields): ContestEntry[] {
  const entries: ContestEntry[] = [{ contestType: "Jack & Jill", division: c.division, role: c.role, partner: "" }];
  if (c.jjSecond && c.jjSecondDivision) {
    entries.push({ contestType: "Jack & Jill", division: c.jjSecondDivision, role: c.jjSecondRole || c.role, partner: "" });
  }
  if (c.strictlySwing && c.strictlyDivision) {
    entries.push({ contestType: "Strictly Swing", division: c.strictlyDivision, role: c.strictlyRole || c.role, partner: c.strictlyPartner || "" });
    if (c.strictlySecond && c.strictlySecondDivision) {
      entries.push({
        contestType: "Strictly Swing",
        division: c.strictlySecondDivision,
        role: c.strictlySecondRole || c.strictlyRole || c.role,
        partner: c.strictlySecondPartner || ""
      });
    }
  }
  if (c.routine && c.routineDivision) {
    entries.push({ contestType: "Routine", division: c.routineDivision, role: null, partner: c.routinePartner || "" });
  }
  return entries;
}

// The dancer's entry for one contest+division, or null if they didn't enter it.
export function getContestEntry(c: EntrantFields, contestType: string | null | undefined, division: string): ContestEntry | null {
  const type = contestType || "Jack & Jill";
  return getAllContestEntries(c).find((e) => e.contestType === type && e.division === division) || null;
}

export function isRegisteredFor(c: EntrantFields, contestType: string | null | undefined, division: string): boolean {
  return !!getContestEntry(c, contestType, division);
}

// The role a dancer entered the given contest+division in (null for Routines,
// or when they didn't enter it).
export function getContestRole(c: EntrantFields, contestType: string | null | undefined, division: string): "Lead" | "Follow" | null {
  return getContestEntry(c, contestType, division)?.role ?? null;
}

export const oppositeRole = (role: "Lead" | "Follow"): "Lead" | "Follow" => (role === "Lead" ? "Follow" : "Lead");

// The fields to change so a dancer dances `role` in this contest+division --
// on whichever of their entries that heat came from. A contest's two entries
// always have opposite roles, so the other entry flips with it.
export function roleUpdateForEntry(c: EntrantFields, contestType: string | null | undefined, division: string, role: "Lead" | "Follow"): Partial<Competitor> {
  if (contestType === "Strictly Swing") {
    const isSecond = !!c.strictlySecond && c.strictlySecondDivision === division;
    const update: Partial<Competitor> = isSecond ? { strictlySecondRole: role } : { strictlyRole: role };
    if (c.strictlySecond) Object.assign(update, isSecond ? { strictlyRole: oppositeRole(role) } : { strictlySecondRole: oppositeRole(role) });
    return update;
  }
  if (contestType === "Routine") return {};
  const isSecond = !!c.jjSecond && c.jjSecondDivision === division && c.division !== division;
  const update: Partial<Competitor> = isSecond ? { jjSecondRole: role } : { role };
  if (c.jjSecond) Object.assign(update, isSecond ? { role: oppositeRole(role) } : { jjSecondRole: oppositeRole(role) });
  return update;
}

// A copy of the dancer with their entry for this partnered contest+division
// pointed at `partnerName`.
export function withEntryPartner<T extends EntrantFields>(c: T, contestType: string, division: string, partnerName: string): T {
  if (contestType === "Strictly Swing") {
    if (c.strictlySwing && c.strictlyDivision === division) return { ...c, strictlyPartner: partnerName };
    if (c.strictlySecond && c.strictlySecondDivision === division) return { ...c, strictlySecondPartner: partnerName };
  }
  if (contestType === "Routine" && c.routine && c.routineDivision === division) return { ...c, routinePartner: partnerName };
  return c;
}

// A copy of the dancer entered into a partnered contest+division they weren't
// registered for (the Floor Coordinator assigned them as someone's partner),
// or null when they have no free entry left for that contest.
export function withAddedEntry<T extends EntrantFields>(c: T, contestType: string, division: string, role: "Lead" | "Follow" | null, partnerName: string): T | null {
  if (contestType === "Strictly Swing" && role) {
    if (!c.strictlySwing) return { ...c, strictlySwing: true, strictlyDivision: division, strictlyRole: role, strictlyPartner: partnerName };
    if (!c.strictlySecond) return { ...c, strictlySecond: true, strictlySecondDivision: division, strictlySecondRole: role, strictlySecondPartner: partnerName };
    return null;
  }
  if (contestType === "Routine" && !c.routine) return { ...c, routine: true, routineDivision: division, routinePartner: partnerName };
  return null;
}

// Registration is closed per contest+division once its check-in sheet exists.
// Jack & Jill keeps the bare division name so existing locks keep working.
export function getDivisionLockKey(contestType: string | null | undefined, division: string): string {
  return isPartneredContest(contestType) ? `${contestType}:${division}` : division;
}

// The lock key of every contest+division a registration enters.
export function getEntryLockKeys(c: EntrantFields): string[] {
  return getAllContestEntries(c).map((e) => getDivisionLockKey(e.contestType, e.division));
}

const normalizeName = (name?: string) => (name || "").trim().toLowerCase().replace(/\s+/g, " ");

// A dancer's partner is the opposite-role entrant whose name matches the
// partner name they registered with for this contest+division, or who
// registered this dancer's name as their own partner there. Anything else is
// left unpaired -- never guessed. Routines have no roles, so any other
// entrant can be the partner there.
function findPartnerAmong<T extends EntrantFields>(dancer: T, candidates: T[], contestType: string, division: string): T | undefined {
  const dancerName = normalizeName(dancer.name);
  const namedPartner = normalizeName(getContestEntry(dancer, contestType, division)?.partner);
  const dancerRole = getContestRole(dancer, contestType, division);
  const pool = candidates.filter((o) => o.bib !== dancer.bib && (!dancerRole || getContestRole(o, contestType, division) !== dancerRole));
  return (
    (namedPartner ? pool.find((o) => normalizeName(o.name) === namedPartner) : undefined) ||
    (dancerName ? pool.find((o) => normalizeName(getContestEntry(o, contestType, division)?.partner) === dancerName) : undefined)
  );
}

export function findRegisteredPartner<T extends EntrantFields>(dancer: T, competitors: T[], contestType: string, division: string): T | undefined {
  return findPartnerAmong(dancer, competitors.filter((o) => isRegisteredFor(o, contestType, division)), contestType, division);
}

// Pairs every entrant of a partnered contest+division with their registered
// partner. `include` narrows the pool (e.g. checked-in only); a dancer whose
// partner is outside the pool is returned in `unpaired` rather than re-matched.
// Strictly couples keep the roles each dancer registered. Routines have no
// roles: a Routine couple's two slots just follow registration order.
export function buildRegisteredCouples<T extends EntrantFields>(
  competitors: T[],
  contestType: string,
  division: string,
  include: (c: T) => boolean = () => true
): { couples: { id: string; leadBib: string; followBib: string }[]; unpaired: T[] } {
  const entrants = competitors.filter((c) => isRegisteredFor(c, contestType, division) && include(c));
  const isLeadFirst = (c: T) => (getContestRole(c, contestType, division) || "Lead") === "Lead";
  const ordered = [...entrants.filter(isLeadFirst), ...entrants.filter((c) => !isLeadFirst(c))];
  const used = new Set<string>();
  const couples: { id: string; leadBib: string; followBib: string }[] = [];

  ordered.forEach((dancer) => {
    if (used.has(dancer.bib)) return;
    const partner = findPartnerAmong(dancer, ordered.filter((o) => !used.has(o.bib)), contestType, division);
    if (!partner) return;
    used.add(dancer.bib);
    used.add(partner.bib);
    const dancerRole = getContestRole(dancer, contestType, division);
    const dancerLeads = dancerRole ? dancerRole === "Lead" : true;
    const [lead, follow] = dancerLeads ? [dancer, partner] : [partner, dancer];
    couples.push({ id: `${lead.bib}_${follow.bib}`, leadBib: lead.bib, followBib: follow.bib });
  });

  return { couples, unpaired: entrants.filter((c) => !used.has(c.bib)) };
}

// Which side of the floor each entrant of a contest+division dances on, keyed
// by bib. Routines have no roles; their "sides" are only the couple's two
// storage slots (an unpaired Routine dancer takes the first) and are never
// shown as Leader/Follower.
export function getEntrantSides<T extends EntrantFields>(competitors: T[], contestType: string, division: string): Map<string, "Lead" | "Follow"> {
  const sides = new Map<string, "Lead" | "Follow">();
  if (contestType === "Routine") {
    buildRegisteredCouples(competitors, contestType, division).couples.forEach((couple) => {
      sides.set(couple.leadBib, "Lead");
      sides.set(couple.followBib, "Follow");
    });
  }
  competitors.forEach((c) => {
    if (sides.has(c.bib)) return;
    const entry = getContestEntry(c, contestType, division);
    if (entry) sides.set(c.bib, entry.role || "Lead");
  });
  return sides;
}

// A dancer's check-in/scratch status for one contest (heat).
export function getHeatStatus(c: Pick<Competitor, "heatStatus">, heatId: string): { checkedIn: boolean; scratched: boolean } {
  const status = c.heatStatus?.[heatId];
  return { checkedIn: !!status?.checkedIn, scratched: !!status?.scratched };
}

export function isActiveInHeat(c: Pick<Competitor, "heatStatus">, heatId: string): boolean {
  const status = getHeatStatus(c, heatId);
  return status.checkedIn && !status.scratched;
}

// The roster as one heat sees it: every dancer carries their check-in/scratch
// status for this heat, and everyone who entered its contest+division carries
// that entry's division and role -- so heat code can keep reading
// `checkedIn`/`scratched`/`division`/`role` even for a second-division entry.
export function projectCompetitorsForHeat<T extends EntrantFields & Pick<Competitor, "checkedIn" | "scratched">>(
  competitors: T[],
  heat: { id: string; contestType?: string | null; division: string }
): T[] {
  const sides = getEntrantSides(competitors, heat.contestType || "Jack & Jill", heat.division);
  return competitors.map((c) => {
    const side = sides.get(c.bib);
    return {
      ...c,
      ...getHeatStatus(c, heat.id),
      ...(side ? { division: heat.division, role: side } : {})
    };
  });
}

// Validation shared by the registration form, every edit form and the server.
// A contest's second division must be danced in the opposite role.
export function validateContestEntries(v: Pick<Competitor, "division" | "role"> & ContestEntryFields): string | null {
  if (v.jjSecond && !v.jjSecondDivision) return "Choose a second division for Jack & Jill.";
  if (v.jjSecond && v.jjSecondDivision === v.division) return "The second Jack & Jill division must differ from the first.";
  if (v.jjSecond && v.jjSecondRole !== "Lead" && v.jjSecondRole !== "Follow") return "Choose Leader or Follower for the second Jack & Jill division.";
  if (v.jjSecond && v.jjSecondRole === v.role) return "The second Jack & Jill division must be danced in the opposite role.";
  if (v.strictlySwing && !v.strictlyPartner?.trim()) return "Enter a partner name for Strictly Swing.";
  if (v.strictlySwing && !v.strictlyDivision) return "Choose a division for Strictly Swing.";
  if (v.strictlySwing && v.strictlyRole !== "Lead" && v.strictlyRole !== "Follow") return "Choose Leader or Follower for Strictly Swing.";
  if (v.strictlySwing && v.strictlySecond) {
    if (!v.strictlySecondPartner?.trim()) return "Enter a partner name for the second Strictly Swing division.";
    if (!v.strictlySecondDivision) return "Choose a second division for Strictly Swing.";
    if (v.strictlySecondDivision === v.strictlyDivision) return "The second Strictly Swing division must differ from the first.";
    if (v.strictlySecondRole !== "Lead" && v.strictlySecondRole !== "Follow") return "Choose Leader or Follower for the second Strictly Swing division.";
    if (v.strictlySecondRole === v.strictlyRole) return "The second Strictly Swing division must be danced in the opposite role.";
  }
  if (v.routine && !v.routinePartner?.trim()) return "Enter a partner name for Routine.";
  if (v.routine && !v.routineDivision) return "Choose a division for Routine.";
  return null;
}
