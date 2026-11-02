import React, { useEffect, useMemo, useState } from "react";
import { Check, Copy, RefreshCw, X } from "lucide-react";
import qrcode from "qrcode-generator";
import { apiRequest, copyText } from "../utils/api";
import { getPassLink, getPortalLink, LINKED_PORTALS, LinkedPortal } from "../utils/portalLinks";

interface PortalQrDialogProps {
  isDarkMode: boolean;
  slug: string;
  portal: LinkedPortal;
  title: string;
  onClose: () => void;
}

interface PortalPass {
  pass: string;
  expiresAt: number;
}

const QUIET_ZONE = 4; // Scanners need this blank border, in QR modules.

function QrImage({ text, label }: { text: string; label: string }) {
  const { size, path } = useMemo(() => {
    const code = qrcode(0, "M");
    code.addData(text);
    code.make();
    const size = code.getModuleCount();
    let path = "";
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        if (code.isDark(row, col)) path += `M${col} ${row}h1v1h-1z`;
      }
    }
    return { size, path };
  }, [text]);
  const span = size + QUIET_ZONE * 2;

  // Always black on white, since scanners can struggle with a dark-mode code.
  return (
    <svg
      id="portal-qr-image"
      viewBox={`${-QUIET_ZONE} ${-QUIET_ZONE} ${span} ${span}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={label}
      className="w-full rounded-xl"
    >
      <rect x={-QUIET_ZONE} y={-QUIET_ZONE} width={span} height={span} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  );
}

export default function PortalQrDialog({ isDarkMode, slug, portal, title, onClose }: PortalQrDialogProps) {
  const isPublic = portal === "results";
  const [portalPass, setPortalPass] = useState<PortalPass | null>(null);
  const [error, setError] = useState("");
  const [isReplacing, setIsReplacing] = useState(false);
  const [copied, setCopied] = useState<boolean | null>(null);

  const loadPass = (replace: boolean) =>
    apiRequest<PortalPass>("/api/gateway/portal-pass", { role: LINKED_PORTALS[portal], replace })
      .then((result) => {
        setPortalPass(result);
        setError("");
      })
      .catch((err) => setError(err.message));

  useEffect(() => {
    if (!isPublic) loadPass(false);
  }, []);

  useEffect(() => {
    const closeOnEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const link = isPublic ? getPortalLink(slug, portal) : portalPass ? getPassLink(slug, portal, portalPass.pass) : "";

  const replaceCode = async () => {
    if (!window.confirm("Replace this QR code? The current code and its link will stop working. Devices already signed in stay signed in.")) return;
    setIsReplacing(true);
    await loadPass(true);
    setIsReplacing(false);
  };

  const copyLink = async () => {
    setCopied(await copyText(link));
    setTimeout(() => setCopied(null), 1500);
  };

  const buttonStyle = isDarkMode
    ? "bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
    : "bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 shadow-sm";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 overflow-y-auto"
      onClick={onClose}
    >
      <div
        id="portal-qr-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`${title} QR code`}
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-sm my-auto p-6 rounded-3xl border shadow-2xl ${
          isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 text-slate-800"
        }`}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-bold tracking-tight">{title}</h2>
            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
              {isPublic ? "Anyone who scans this sees the results." : "Scanning this signs a device straight in. No passcode needed."}
            </p>
          </div>
          <button
            type="button"
            id="close-qr-btn"
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {link ? (
          <QrImage text={link} label={`QR code for ${title}`} />
        ) : error ? (
          <p id="portal-qr-error" className="py-10 text-xs text-rose-500 text-center">{error}</p>
        ) : (
          <div className="py-20 flex justify-center"><RefreshCw className="w-6 h-6 text-violet-500 animate-spin" /></div>
        )}

        {portalPass && (
          <p id="portal-qr-expiry" className="text-[11px] text-slate-400 mt-3 text-center leading-relaxed">
            Works until {new Date(portalPass.expiresAt).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}. Treat it like a passcode: anyone with a photo of it can sign in.
          </p>
        )}

        {link && (
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              id="copy-qr-link-btn"
              onClick={copyLink}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${buttonStyle}`}
            >
              {copied === null
                ? <Copy className="w-3.5 h-3.5 text-slate-400" />
                : copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <X className="w-3.5 h-3.5 text-rose-500" />}
              {copied === null ? (isPublic ? "Copy Link" : "Copy Sign-In Link") : copied ? "Copied" : "Couldn't copy"}
            </button>
            {!isPublic && (
              <button
                type="button"
                id="replace-qr-btn"
                onClick={replaceCode}
                disabled={isReplacing}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-60 ${buttonStyle}`}
              >
                <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${isReplacing ? "animate-spin" : ""}`} />
                Replace Code
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
