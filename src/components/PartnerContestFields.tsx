import React from "react";
import { PartnerRegistrationFields } from "../types";
import { STRICTLY_DIVISIONS, ROUTINE_DIVISIONS, getDivisionLockKey } from "../utils/partners";

interface PartnerContestFieldsProps {
  value: PartnerRegistrationFields;
  onChange: (value: PartnerRegistrationFields) => void;
  isDarkMode: boolean;
  // Lock keys from settings.lockedDivisions. A locked division can't be newly
  // chosen, but a dancer's existing choice stays selectable so edits still save.
  lockedDivisions?: string[];
  initialValue?: PartnerRegistrationFields;
}

const CONTESTS = [
  { contest: "Strictly Swing", flag: "strictlySwing", partner: "strictlyPartner", division: "strictlyDivision", divisions: STRICTLY_DIVISIONS },
  { contest: "Routine", flag: "routine", partner: "routinePartner", division: "routineDivision", divisions: ROUTINE_DIVISIONS }
] as const;

export function emptyPartnerFields(): PartnerRegistrationFields {
  return { strictlySwing: false, strictlyPartner: "", strictlyDivision: "", routine: false, routinePartner: "", routineDivision: "" };
}

export function partnerFieldsFrom(c: PartnerRegistrationFields): PartnerRegistrationFields {
  return {
    strictlySwing: !!c.strictlySwing,
    strictlyPartner: c.strictlyPartner || "",
    strictlyDivision: c.strictlyDivision || "",
    routine: !!c.routine,
    routinePartner: c.routinePartner || "",
    routineDivision: c.routineDivision || ""
  };
}

export default function PartnerContestFields({ value, onChange, isDarkMode, lockedDivisions = [], initialValue }: PartnerContestFieldsProps) {
  const inputClass = `w-full px-3.5 py-2 text-xs rounded-xl border focus:outline-none focus:ring-1 focus:ring-violet-500 ${
    isDarkMode ? "bg-slate-800 border-slate-700 text-slate-100 placeholder-slate-500" : "bg-slate-50 border-slate-200 text-slate-800"
  }`;

  return (
    <div className="space-y-3">
      {CONTESTS.map(({ contest, flag, partner, division, divisions }) => {
        const enabled = !!value[flag];
        return (
          <div
            key={contest}
            className={`p-3 rounded-xl border ${isDarkMode ? "border-slate-700 bg-slate-800/40" : "border-slate-200 bg-slate-50"}`}
          >
            <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer select-none">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => onChange({ ...value, [flag]: e.target.checked })}
                className="w-4 h-4 accent-violet-600 cursor-pointer"
              />
              {contest}
              <span className="text-[10px] font-normal text-slate-400">(with a partner)</span>
            </label>

            {enabled && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
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
                <div>
                  <label className="block text-[10px] font-medium text-slate-400 mb-1">Division</label>
                  <select
                    value={value[division] || ""}
                    onChange={(e) => onChange({ ...value, [division]: e.target.value })}
                    className={inputClass}
                  >
                    <option value="">Select division…</option>
                    {divisions.map((div) => {
                      const isLocked = lockedDivisions.includes(getDivisionLockKey(contest, div)) && initialValue?.[division] !== div;
                      return (
                        <option key={div} value={div} disabled={isLocked}>
                          {div}{isLocked ? " (closed)" : ""}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
