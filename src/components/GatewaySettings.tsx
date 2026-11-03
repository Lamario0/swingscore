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

export const ROLE_LABELS: { role: StaffRole; label: string }[] = [
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
  const [sheetEmail, setSheetEmail] = useState("");
  const [sheetUrl, setSheetUrl] = useState("");
  const [sheetTitle, setSheetTitle] = useState("");
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

  useEffect(() => {
    if (!isOpen || sheetEmail) return;
    apiRequest("/api/sheets", undefined, "GET")
      .then((data) => {
        setSheetEmail(data.serviceAccountEmail);
        setSheetUrl(data.url);
        setSheetTitle(data.title);
      })
      .catch((err) => setError(err.message));
  }, [isOpen, sheetEmail]);

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
    if (!window.confirm(`Create a new gateway code? This also replaces every portal link, so you'll need to share the new ones. ${SIGN_OUT_WARNING}`)) return;
    run(async () => {
      const data = await apiRequest("/api/gateway/rotate-code");
      await onApplyToken(data.token);
      setGatewayCode(data.gatewayCode);
      return "New gateway code and portal links created.";
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

  const connectSheet = (url: string) => run(async () => {
    const data = await apiRequest("/api/sheets/connect", { url });
    setSheetUrl(data.url);
    setSheetTitle(data.title);
    return url ? `Connected to ${data.title}. Published contests will save there.` : "Spreadsheet disconnected.";
  });

  const resaveAll = () => run(async () => {
    const { queued } = await apiRequest("/api/sheets/resave");
    return `Saving ${queued} published contest${queued === 1 ? "" : "s"} to the spreadsheet.`;
  });

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
            <p className="text-[11px] text-slate-400 mt-2">Keep this to yourself. It opens the Central Gateway, where you'll find the portal links to share with staff and spectators.</p>
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

          <div>
            <p className={labelClass}>Results Spreadsheet</p>
            <ol className="text-[11px] text-slate-400 mb-3 space-y-1 list-decimal list-inside">
              <li>Create a Google Sheet.</li>
              <li>
                Share it as an Editor with <span id="sheets-service-email" className="font-mono text-violet-400 break-all select-all">{sheetEmail || "..."}</span>
              </li>
              <li>Paste its link below. Published contests then save there automatically.</li>
            </ol>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                id="sheet-url-input"
                aria-label="Google Sheet link"
                value={sheetUrl}
                onChange={(e) => setSheetUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/..."
                className={inputClass}
              />
              <button type="button" id="connect-sheet-btn" disabled={isBusy || !sheetUrl.trim()} onClick={() => connectSheet(sheetUrl)} className={buttonClass}>
                Test &amp; Connect
              </button>
            </div>
            {sheetTitle && (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <span id="sheet-connected-title" className="text-xs text-slate-400">
                  Saving to <a href={sheetUrl} target="_blank" rel="noreferrer" className="font-semibold text-violet-400 underline">{sheetTitle}</a>
                </span>
                <button type="button" id="resave-all-btn" disabled={isBusy} onClick={resaveAll} className={buttonClass}>
                  Re-save All
                </button>
                <button
                  type="button"
                  id="disconnect-sheet-btn"
                  disabled={isBusy}
                  onClick={() => {
                    if (window.confirm("Stop saving to this spreadsheet? What's already in it stays there.")) connectSheet("");
                  }}
                  className="text-[11px] font-semibold text-slate-400 underline"
                >
                  Disconnect
                </button>
              </div>
            )}
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
