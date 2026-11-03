import React, { useEffect } from "react";
import { ContestEntryFields } from "../types";
import { STRICTLY_DIVISIONS, ROUTINE_DIVISIONS, getDivisionLockKey, oppositeRole as opposite } from "../utils/partners";

interface ContestEntryInputsProps {
  value: ContestEntryFields;
  onChange: (value: ContestEntryFields) => void;
  isDarkMode: boolean;
  // The dancer's main Jack & Jill entry: its division can't be picked again as
  // the second Jack & Jill division, and its role seeds the other entries.
  mainDivision: string;
  mainRole: "Lead" | "Follow";
  // Lock keys from settings.lockedDivisions. A locked division can't be newly
  // chosen, but a dancer's existing choice stays selectable so edits still save.
  lockedDivisions?: string[];
  initialValue?: ContestEntryFields;
}

type Role = "Lead" | "Follow";
type FlagKey = "jjSecond" | "strictlySwing" | "strictlySecond" | "routine";
type TextKey = "jjSecondDivision" | "strictlyPartner" | "strictlyDivision" | "strictlySecondPartner" | "strictlySecondDivision" | "routinePartner" | "routineDivision";
type RoleKey = "jjSecondRole" | "strictlyRole" | "strictlySecondRole";


export function emptyContestEntries(): ContestEntryFields {
  return {
    jjSecond: false, jjSecondDivision: "", jjSecondRole: undefined,
    strictlySwing: false, strictlyPartner: "", strictlyDivision: "", strictlyRole: undefined,
    strictlySecond: false, strictlySecondPartner: "", strictlySecondDivision: "", strictlySecondRole: undefined,
    routine: false, routinePartner: "", routineDivision: ""
  };
}

// Registrations made before Strictly Swing had its own role fall back to the
// dancer's Jack & Jill role.
export function contestEntriesFrom(c: ContestEntryFields & { role?: Role }): ContestEntryFields {
  return {
    jjSecond: !!c.jjSecond,
    jjSecondDivision: c.jjSecondDivision || "",
    jjSecondRole: c.jjSecondRole,
    strictlySwing: !!c.strictlySwing,
    strictlyPartner: c.strictlyPartner || "",
    strictlyDivision: c.strictlyDivision || "",
    strictlyRole: c.strictlyRole || (c.strictlySwing ? c.role : undefined),
    strictlySecond: !!c.strictlySecond,
    strictlySecondPartner: c.strictlySecondPartner || "",
    strictlySecondDivision: c.strictlySecondDivision || "",
    strictlySecondRole: c.strictlySecondRole,
    routine: !!c.routine,
    routinePartner: c.routinePartner || "",
    routineDivision: c.routineDivision || ""
  };
}

// Every entry beyond the main Jack & Jill division: a second Jack & Jill
// division, Strictly Swing (optionally in a second division), and Routine.
// Each Jack & Jill / Strictly entry has its own role, and a contest's second
// division is always danced in the opposite role of its first. Routines have none.
export default function ContestEntryInputs({ value, onChange, isDarkMode, mainDivision, mainRole, lockedDivisions = [], initialValue }: ContestEntryInputsProps) {
  const jjSecondRole = opposite(mainRole);
  const strictlySecondRole = opposite(value.strictlyRole || mainRole);

  // Keep each second division's role opposite its first as the first changes.
  useEffect(() => {
    const fixes: Partial<ContestEntryFields> = {};
    if (value.jjSecond && value.jjSecondRole !== jjSecondRole) fixes.jjSecondRole = jjSecondRole;
    if (value.strictlySecond && value.strictlySecondRole !== strictlySecondRole) fixes.strictlySecondRole = strictlySecondRole;
    if (Object.keys(fixes).length > 0) onChange({ ...value, ...fixes });
  }, [value, jjSecondRole, strictlySecondRole]);

  const inputClass = `w-full px-3.5 py-2 text-xs rounded-xl border focus:outline-none focus:ring-1 focus:ring-violet-500 ${
    isDarkMode ? "bg-slate-800 border-slate-700 text-slate-100 placeholder-slate-500" : "bg-slate-50 border-slate-200 text-slate-800"
  }`;

  const blocks: {
    flag: FlagKey;
    title: string;
    note: string;
    contest: "Jack & Jill" | "Strictly Swing" | "Routine";
    partner: TextKey | null;
    division: TextKey;
    role: RoleKey | null;
    divisions: string[];
    // A division this entry can't repeat (the contest's other entry).
    takenDivision?: string;
    defaultRole: Role;
    // Second divisions can't choose: they take the opposite of the first.
    fixedRole?: Role;
    nested?: boolean;
  }[] = [
    {
      flag: "jjSecond",
      title: "Second Jack & Jill division",
      note: "(different division)",
      contest: "Jack & Jill",
      partner: null,
      division: "jjSecondDivision",
      role: "jjSecondRole",
      divisions: STRICTLY_DIVISIONS,
      takenDivision: mainDivision,
      defaultRole: jjSecondRole,
      fixedRole: jjSecondRole
    },
    {
      flag: "strictlySwing",
      title: "Strictly Swing",
      note: "(with a partner)",
      contest: "Strictly Swing",
      partner: "strictlyPartner",
      division: "strictlyDivision",
      role: "strictlyRole",
      divisions: STRICTLY_DIVISIONS,
      defaultRole: mainRole
    },
    ...(value.strictlySwing
      ? [{
          flag: "strictlySecond" as const,
          title: "Second Strictly Swing division",
          note: "(different division)",
          contest: "Strictly Swing" as const,
          partner: "strictlySecondPartner" as const,
          division: "strictlySecondDivision" as const,
          role: "strictlySecondRole" as const,
          divisions: STRICTLY_DIVISIONS,
          takenDivision: value.strictlyDivision,
          defaultRole: strictlySecondRole,
          fixedRole: strictlySecondRole,
          nested: true
        }]
      : []),
    {
      flag: "routine",
      title: "Routine",
      note: "(with a partner, no role)",
      contest: "Routine",
      partner: "routinePartner",
      division: "routineDivision",
      role: null,
      divisions: ROUTINE_DIVISIONS,
      defaultRole: mainRole
    }
  ];

  return (
    <div className="space-y-3">
      {blocks.map(({ flag, title, note, contest, partner, division, role, divisions, takenDivision, defaultRole, fixedRole, nested }) => {
        const enabled = !!value[flag];
        return (
          <div
            key={flag}
            className={`p-3 rounded-xl border ${nested ? "ml-4" : ""} ${isDarkMode ? "border-slate-700 bg-slate-800/40" : "border-slate-200 bg-slate-50"}`}
          >
            <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer select-none">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => onChange({
                  ...value,
                  [flag]: e.target.checked,
                  ...(role && e.target.checked && !value[role] ? { [role]: defaultRole } : {}),
                  // The second Strictly division only exists alongside the first.
                  ...(flag === "strictlySwing" && !e.target.checked ? { strictlySecond: false } : {})
                })}
                className="w-4 h-4 accent-violet-600 cursor-pointer"
              />
              {title}
              <span className="text-[10px] font-normal text-slate-400">{note}</span>
            </label>

            {enabled && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                {partner && (
                  <div>
                    <label className="block text-[10px] font-medium text-slate-400 mb-1">Partner</label>
                    <input
                      type="text"
                      placeholder="Partner's full name"
                      value={value[partner] || ""}
                      onChange={(e) => onChange({ ...value, [partner]: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                )}
                <div className={partner ? "" : "sm:col-span-2"}>
                  <label className="block text-[10px] font-medium text-slate-400 mb-1">Division</label>
                  <select
                    value={value[division] || ""}
                    onChange={(e) => onChange({ ...value, [division]: e.target.value })}
                    className={inputClass}
                  >
                    <option value="">Select division…</option>
                    {divisions.map((div) => {
                      const isTaken = div === takenDivision;
                      const isLocked = lockedDivisions.includes(getDivisionLockKey(contest, div)) && initialValue?.[division] !== div;
                      return (
                        <option key={div} value={div} disabled={isTaken || isLocked}>
                          {div}{isTaken ? " (already entered)" : isLocked ? " (closed)" : ""}
                        </option>
                      );
                    })}
                  </select>
                </div>
                {role && fixedRole && (
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-medium text-slate-400 mb-1">Role in this division</label>
                    <div className={`py-1.5 rounded-xl border text-[10px] font-bold tracking-wider text-center text-white ${
                      fixedRole === "Lead" ? "bg-emerald-600 border-emerald-600" : "bg-rose-600 border-rose-600"
                    }`}>
                      {fixedRole === "Lead" ? "LEADER" : "FOLLOWER"}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">The second division is danced in the opposite role of the first.</p>
                  </div>
                )}
                {role && !fixedRole && (
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-medium text-slate-400 mb-1">Role in this division</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(["Lead", "Follow"] as const).map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => onChange({ ...value, [role]: r })}
                          className={`py-1.5 rounded-xl border text-[10px] font-bold tracking-wider transition-all ${
                            value[role] === r
                              ? r === "Lead"
                                ? "bg-emerald-600 border-emerald-600 text-white shadow-sm"
                                : "bg-rose-600 border-rose-600 text-white shadow-sm"
                              : isDarkMode
                                ? "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750"
                                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-100"
                          }`}
                        >
                          {r === "Lead" ? "LEADER" : "FOLLOWER"}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
