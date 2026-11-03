import React, { useState } from "react";
import { Check, ChevronDown, ChevronUp, Copy, KeyRound, X } from "lucide-react";
import { StaffRole } from "../types";
import { copyText } from "../utils/clipboard";
import { ROLE_LABELS } from "./GatewaySettings";

interface PasscodeNoteProps {
  isDarkMode: boolean;
  passcodes: Partial<Record<StaffRole, string>>;
}

// The Admin's floating reminder of every portal passcode. It starts closed, since
// this page is often open on a screen other people can see.
export default function PasscodeNote({ isDarkMode, passcodes }: PasscodeNoteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copyResult, setCopyResult] = useState<{ role: StaffRole; ok: boolean } | null>(null);
  const hasMissing = ROLE_LABELS.some(({ role }) => !passcodes[role]);

  const copyPasscode = async (role: StaffRole) => {
    const ok = await copyText(passcodes[role]!);
    setCopyResult({ role, ok });
    setTimeout(() => setCopyResult((current) => (current?.role === role ? null : current)), 1500);
  };

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
                <dd className="flex items-center gap-1.5">
                  <span id={`passcode-note-${role}`} className={passcodes[role] ? "font-mono font-bold select-all" : "text-[10px] text-amber-500 font-semibold"}>
                    {passcodes[role] || "Not on file"}
                  </span>
                  {passcodes[role] && (
                    <button
                      type="button"
                      id={`copy-passcode-${role}`}
                      onClick={() => copyPasscode(role)}
                      aria-label={`Copy ${label} passcode`}
                      title={copyResult?.role === role && !copyResult.ok ? "Couldn't copy. Select the passcode instead." : "Copy passcode"}
                      className="p-1 -m-0.5 rounded-md text-slate-400 hover:text-violet-500 hover:bg-violet-500/10 transition-colors cursor-pointer"
                    >
                      {copyResult?.role === role
                        ? (copyResult.ok ? <Check className="w-3.5 h-3.5 text-green-500" /> : <X className="w-3.5 h-3.5 text-rose-500" />)
                        : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  )}
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
