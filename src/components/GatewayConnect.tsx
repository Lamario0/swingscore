import React, { useState } from "react";
import { AlertCircle, KeyRound, RefreshCw } from "lucide-react";

interface GatewayConnectProps {
  isDarkMode: boolean;
  onConnect: (code: string) => Promise<void>;
}

// The first screen on any device that hasn't joined a community yet.
export default function GatewayConnect({ isDarkMode, onConnect }: GatewayConnectProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");
    try {
      await onConnect(code);
    } catch (err: any) {
      setError(err.message);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-md w-full mx-auto my-12">
      <div className={`p-8 rounded-3xl border transition-all ${
        isDarkMode
          ? "bg-slate-900 border-slate-800 text-slate-100 shadow-2xl"
          : "bg-white border-slate-200 text-slate-800 shadow-xl"
      }`}>
        <div className="flex flex-col items-center text-center">
          <div className="p-4 rounded-2xl mb-4 border border-violet-500/20 text-violet-500 bg-violet-500/5">
            <KeyRound className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 font-sans">
            Connect to Your Gateway
          </h2>
          <p className="text-xs text-slate-400 mt-2 leading-relaxed">
            Organizers: enter your gateway code. Staff and spectators: use the portal link from your organizer.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="gateway-code-input" className="block text-xs font-mono font-bold text-slate-400 uppercase tracking-wider mb-2">
              Gateway Code
            </label>
            <input
              id="gateway-code-input"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABCD-2345"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              required
              className={`w-full text-lg text-center tracking-widest px-4 py-3 rounded-xl border focus:outline-none focus:ring-1 focus:ring-violet-500 font-mono transition-all ${
                isDarkMode
                  ? "bg-slate-800 border-slate-700 text-slate-100 placeholder-slate-600"
                  : "bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400"
              }`}
            />
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-[11px] text-rose-400 flex items-start gap-2 leading-relaxed">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-500" />
              <span>{error}</span>
            </div>
          )}

          <button
            id="gateway-connect-btn"
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-60 text-white font-semibold text-xs tracking-wide uppercase shadow-lg shadow-violet-500/20 transition-all flex items-center justify-center gap-2"
          >
            {isSubmitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
            Connect
          </button>
        </form>
      </div>
    </div>
  );
}
