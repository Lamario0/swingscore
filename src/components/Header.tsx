import React from "react";
import { Award, Moon, Sun } from "lucide-react";
import { ViewRole, AppSettings } from "../types";

interface HeaderProps {
  currentRole: ViewRole | "portal";
  selectedJudgeId: string;
  setSelectedJudgeId: (id: string) => void;
  isDarkMode: boolean;
  setIsDarkMode: (val: boolean) => void;
  settings?: AppSettings;
}

export default function Header({
  currentRole,
  selectedJudgeId,
  setSelectedJudgeId,
  isDarkMode,
  setIsDarkMode,
  settings
}: HeaderProps) {
  // Translate currentRole to human-friendly display badge
  const getRoleBadge = () => {
    switch (currentRole) {
      case "admin":
        return {
          label: "Admin Control Panel",
          color: "bg-rose-500/10 text-rose-500 border-rose-500/20"
        };
      case "judge":
        return {
          label: `Judge Portal — ${selectedJudgeId}`,
          color: "bg-amber-500/10 text-amber-500 border-amber-500/20"
        };
      case "coordinator":
        return {
          label: "Floor Coordinator Workspace",
          color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
        };
      case "competitor":
        return {
          label: "Self-Service Registration",
          color: "bg-blue-500/10 text-blue-500 border-blue-500/20"
        };
      case "results":
        return {
          label: "Public Scoreboard",
          color: "bg-violet-500/10 text-violet-500 border-violet-500/20"
        };
      case "scoring":
        return {
          label: "Scoring & Results Ledger",
          color: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20"
        };
      default:
        return {
          label: "Central Gateway",
          color: "bg-slate-500/10 text-slate-400 border-slate-500/20"
        };
    }
  };

  const badge = getRoleBadge();

  return (
    <header className={`border-b transition-colors duration-300 ${isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 text-slate-800"}`}>
      <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Title */}
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-violet-600 text-white shadow-md shadow-violet-500/20">
            <Award className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">WCS Scoring Portal</h1>
            <p className="text-xs text-slate-400 font-mono">West Coast Swing Dance Competition</p>
          </div>
        </div>

        {/* Styled Role Display - No interactive routing here to keep platforms completely segregated */}
        <div className="flex items-center gap-2">
          <span className={`px-3 py-1.5 rounded-xl text-xs font-semibold font-mono border ${badge.color}`}>
            {badge.label}
          </span>
        </div>

        {/* Global Controls (Theme, Judge Selection) */}
        <div className="flex items-center gap-3">
          <button
            id="theme-toggle-btn"
            onClick={() => setIsDarkMode(!isDarkMode)}
            className={`p-2 rounded-xl border transition-colors ${
              isDarkMode
                ? "bg-slate-800 border-slate-700 text-amber-400 hover:bg-slate-700"
                : "bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200"
            }`}
            title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </header>
  );
}
