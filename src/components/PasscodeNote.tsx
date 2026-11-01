import React, { useState } from "react";
import { ChevronDown, ChevronUp, KeyRound } from "lucide-react";
import { StaffRole } from "../types";
import { ROLE_LABELS } from "./GatewaySettings";

interface PasscodeNoteProps {
  isDarkMode: boolean;
  passcodes: Partial<Record<StaffRole, string>>;
}

// The Admin's floating reminder of every portal passcode. It starts closed, since
// this page is often open on a screen other people can see.
export default function PasscodeNote({ isDarkMode, passcodes }: PasscodeNoteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const hasMissing = ROLE_LABELS.some(({ role }) => !passcodes[role]);

  return (
    <div
      id="passcode-note"
      className={`fixed bottom-4 right-4 z-40 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border shadow-2xl transition-all ${
        isDarkMode ? "bg-slate-900 border-violet-500/30 text-slate-100" : "bg-white border-violet-500/30 text-slate-800"
      }`}
    >
      <button
        type="button"
        id="passcode-note-toggle"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className="w-full px-4 py-3 flex items-center justify-between gap-2 cursor-pointer text-left"
      >
        <span className="flex items-center gap-2 text-xs font-bold tracking-tight">
          <KeyRound className="w-4 h-4 text-violet-500" />
          Portal Passcodes
        </span>
        {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronUp className="w-4 h-4 text-slate-400" />}
      </button>

      {isOpen && (
        <div className="px-4 pb-4">
          <dl className="space-y-2 border-t border-slate-200 dark:border-slate-800 pt-3">
            {ROLE_LABELS.map(({ role, label }) => (
              <div key={role} className="flex items-center justify-between gap-3 text-xs">
                <dt className="text-slate-400">{label}</dt>
                <dd id={`passcode-note-${role}`} className={passcodes[role] ? "font-mono font-bold select-all" : "text-[10px] text-amber-500 font-semibold"}>
                  {passcodes[role] || "Not on file"}
                </dd>
              </div>
            ))}
          </dl>
          {hasMissing && (
            <p className="text-[10px] text-slate-400 mt-3 leading-relaxed">
              A passcode appears here after someone signs in with it, or when you set a new one in Gateway Settings.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
