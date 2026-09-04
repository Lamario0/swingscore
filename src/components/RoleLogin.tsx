import React, { useState } from "react";
import { Lock, Eye, EyeOff, ShieldAlert, Award, UserCheck, Users, Landmark, AlertCircle, Trophy } from "lucide-react";

interface RoleLoginProps {
  role: "admin" | "judge" | "coordinator" | "competitor" | "results" | "scoring";
  isDarkMode: boolean;
  onSuccess: () => void;
}

export default function RoleLogin({ role, isDarkMode, onSuccess }: RoleLoginProps) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  // Simple hardcoded secure defaults for the sub-systems
  const getRoleDetails = () => {
    switch (role) {
      case "admin":
        return {
          title: "Admin Control Console",
          description: "Access master event timing, relative placement configurations, and judges reporting simulator.",
          domain: "admin.swingscore.com",
          passcode: "admin",
          color: "border-rose-500/20 text-rose-500 bg-rose-500/5",
          icon: <ShieldAlert className="w-10 h-10 text-rose-500" />
        };
      case "judge":
        return {
          title: "Certified Adjudicator Station",
          description: "Secure terminal for recording raw decimals or assigning 1-to-N relative placement ranks.",
          domain: "judge.swingscore.com",
          passcode: "judge",
          color: "border-amber-500/20 text-amber-500 bg-amber-500/5",
          icon: <Award className="w-10 h-10 text-amber-500" />
        };
      case "coordinator":
        return {
          title: "Floor Coordinator Panel",
          description: "Real-time tablet interface for verifying registered check-ins and staging dancer queues.",
          domain: "floorcord.swingscore.com",
          passcode: "floor",
          color: "border-emerald-500/20 text-emerald-500 bg-emerald-500/5",
          icon: <UserCheck className="w-10 h-10 text-emerald-500" />
        };
      case "competitor":
        return {
          title: "Dancer Self-Registration",
          description: "Submit name, division, and bib number requests to join active West Coast Swing heats.",
          domain: "registration.swingscore.com",
          passcode: "register",
          color: "border-blue-500/20 text-blue-500 bg-blue-500/5",
          icon: <Users className="w-10 h-10 text-blue-500" />
        };
      case "scoring":
        return {
          title: "Scoring & Results Ledger",
          description: "Internal system of record for finalized judge decisions, compiled contest by contest as heats are completed.",
          domain: "scoring.swingscore.com",
          passcode: "scoring",
          color: "border-indigo-500/20 text-indigo-500 bg-indigo-500/5",
          icon: <Trophy className="w-10 h-10 text-indigo-500" />
        };
      default:
        return {
          title: "Public Results Terminal",
          description: "Real-time relative placement results, judge score matrices, and qualifying cuts.",
          domain: "results.swingscore.com",
          passcode: "",
          color: "border-violet-500/20 text-violet-500 bg-violet-500/5",
          icon: <Landmark className="w-10 h-10 text-violet-500" />
        };
    }
  };

  const details = getRoleDetails();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (details.passcode === "" || password === details.passcode) {
      setError("");
      onSuccess();
    } else {
      setError(`Invalid passcode for ${details.title}. Try "${details.passcode}" to simulate authorized login.`);
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
          {/* Platform Icon */}
          <div className={`p-4 rounded-2xl mb-4 border ${details.color}`}>
            {details.icon}
          </div>

          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded">
            Virtual Domain: {details.domain}
          </span>

          <h2 className="text-2xl font-bold tracking-tight mt-4 text-slate-900 dark:text-slate-100 font-sans">
            {details.title}
          </h2>
          <p className="text-xs text-slate-400 mt-2 line-clamp-3">
            {details.description}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {details.passcode !== "" && (
            <div>
              <label className="block text-xs font-mono font-bold text-slate-400 uppercase tracking-wider mb-2">
                System Passcode
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={`Enter ${role} passcode`}
                  className={`w-full text-sm pl-10 pr-10 py-3 rounded-xl border focus:outline-none focus:ring-1 focus:ring-violet-500 font-mono transition-all ${
                    isDarkMode
                      ? "bg-slate-800 border-slate-700 text-slate-100 placeholder-slate-500"
                      : "bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400"
                  }`}
                  required
                />
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-3.5 text-slate-500 hover:text-slate-400 focus:outline-none"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-[11px] text-rose-400 flex items-start gap-2 leading-relaxed">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-500" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-xs tracking-wide uppercase shadow-lg shadow-violet-500/20 transition-all"
          >
            Authenticate Session
          </button>
        </form>

        <div className="mt-6 border-t border-slate-100 dark:border-slate-800 pt-4 text-center">
          <p className="text-[10px] font-mono text-slate-500">
            For secure local simulation, use the passcode: <strong className="text-violet-400">"{details.passcode}"</strong>
          </p>
        </div>
      </div>
    </div>
  );
}
