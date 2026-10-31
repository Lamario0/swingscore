import React, { useEffect, useState } from "react";
import { AlertCircle, ChevronDown, ChevronUp, KeyRound, RefreshCw } from "lucide-react";
import { AppSettings, StaffRole } from "../types";
import { apiRequest } from "../utils/api";

interface GatewaySettingsProps {
  isDarkMode: boolean;
  communityName: string;
  settings: AppSettings;
  onUpdateSettings: (newSettings: Partial<AppSettings>) => Promise<void>;
  onApplyToken: (token: string) => Promise<void>;
}

const ROLE_LABELS: { role: StaffRole; label: string }[] = [
  { role: "admin", label: "Admin" },
  { role: "judge", label: "Judge" },
  { role: "coordinator", label: "Floor Coordinator" },
  { role: "scoring", label: "Scoring" },
  { role: "competitor", label: "Registration" }
];

const SIGN_OUT_WARNING = "This signs out every device connected to your gateway, including judges and floor coordinators. Everyone will need the new code to reconnect.";

export default function GatewaySettings({ isDarkMode, communityName, settings, onUpdateSettings, onApplyToken }: GatewaySettingsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [gatewayCode, setGatewayCode] = useState("");
  const [nameInput, setNameInput] = useState(communityName);
  const [eventInput, setEventInput] = useState(settings.eventName || "");
  const [passcodeRole, setPasscodeRole] = useState<StaffRole>("admin");
  const [passcodeInput, setPasscodeInput] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => setNameInput(communityName), [communityName]);
  useEffect(() => setEventInput(settings.eventName || ""), [settings.eventName]);

  useEffect(() => {
    if (!isOpen || gatewayCode) return;
    apiRequest("/api/gateway/settings", undefined, "GET")
      .then((data) => setGatewayCode(data.gatewayCode))
      .catch((err) => setError(err.message));
  }, [isOpen, gatewayCode]);

  const run = async (action: () => Promise<string>) => {
    setIsBusy(true);
    setNotice("");
    setError("");
    try {
      setNotice(await action());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsBusy(false);
    }
  };

  const saveDetails = () => run(async () => {
    await apiRequest("/api/gateway/settings", { name: nameInput });
    await onUpdateSettings({ eventName: eventInput.trim() });
    return "Details saved.";
  });

  const rotateCode = () => {
    if (!window.confirm(`Create a new gateway code? ${SIGN_OUT_WARNING}`)) return;
    run(async () => {
      const data = await apiRequest("/api/gateway/rotate-code");
      await onApplyToken(data.token);
      setGatewayCode(data.gatewayCode);
      return "New gateway code created.";
    });
  };

  const savePasscode = () => {
    if (!window.confirm(`Change this passcode? ${SIGN_OUT_WARNING}`)) return;
    run(async () => {
      const data = await apiRequest("/api/gateway/passcode", { role: passcodeRole, passcode: passcodeInput });
      await onApplyToken(data.token);
      setPasscodeInput("");
      return "Passcode changed.";
    });
  };

  const inputClass = `w-full text-sm px-3 py-2 rounded-xl border focus:outline-none focus:ring-1 focus:ring-violet-500 transition-all ${
    isDarkMode ? "bg-slate-800 border-slate-700 text-slate-100" : "bg-slate-50 border-slate-200 text-slate-800"
  }`;
  const labelClass = "block text-xs font-mono font-bold text-slate-400 uppercase tracking-wider mb-2";
  const buttonClass = "px-3 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-bold transition-all whitespace-nowrap";

  return (
    <div className={`mb-6 p-6 rounded-2xl border transition-all ${isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 shadow-sm text-slate-800"}`}>
      <button
        type="button"
        id="gateway-settings-toggle"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between cursor-pointer text-left"
      >
        <span className="flex items-center gap-2 text-base font-bold tracking-tight">
          <KeyRound className="w-5 h-5 text-violet-500" />
          Gateway Settings
        </span>
        {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>

      {isOpen && (
        <div className="mt-5 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="community-name-input" className={labelClass}>Community Name</label>
              <input id="community-name-input" value={nameInput} onChange={(e) => setNameInput(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="event-name-input" className={labelClass}>Event Name</label>
              <input id="event-name-input" value={eventInput} onChange={(e) => setEventInput(e.target.value)} className={inputClass} />
            </div>
          </div>
          <button type="button" id="save-gateway-details-btn" disabled={isBusy || !nameInput.trim()} onClick={saveDetails} className={buttonClass}>
            Save Details
          </button>

          <div>
            <p className={labelClass}>Gateway Code</p>
            <div className="flex flex-wrap items-center gap-3">
              <span id="gateway-code-display" className="font-mono text-lg font-bold tracking-widest">{gatewayCode || "—"}</span>
              <button type="button" id="rotate-gateway-code-btn" disabled={isBusy} onClick={rotateCode} className={buttonClass}>
                Create New Code
              </button>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">Share this with dancers, spectators and staff. It connects a device to your community.</p>
          </div>

          <div>
            <p className={labelClass}>Portal Passcodes</p>
            <div className="flex flex-col sm:flex-row gap-3">
              <select
                id="passcode-role-select"
                aria-label="Portal"
                value={passcodeRole}
                onChange={(e) => setPasscodeRole(e.target.value as StaffRole)}
                className={`${inputClass} sm:max-w-[200px]`}
              >
                {ROLE_LABELS.map(({ role, label }) => <option key={role} value={role}>{label}</option>)}
              </select>
              <input
                id="new-passcode-input"
                type="password"
                aria-label="New passcode"
                autoComplete="new-password"
                value={passcodeInput}
                onChange={(e) => setPasscodeInput(e.target.value)}
                placeholder="New passcode (6+ characters)"
                className={inputClass}
              />
              <button type="button" id="save-passcode-btn" disabled={isBusy || passcodeInput.trim().length < 6} onClick={savePasscode} className={buttonClass}>
                Change Passcode
              </button>
            </div>
          </div>

          {notice && <p className="text-xs font-semibold text-emerald-500">{notice}</p>}
          {isBusy && <RefreshCw className="w-4 h-4 text-violet-500 animate-spin" />}
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-[11px] text-rose-400 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-500" />
              <span>{error}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
