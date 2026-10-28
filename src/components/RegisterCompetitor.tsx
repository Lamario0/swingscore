import React, { useState } from "react";
import { UserPlus, Search, ListFilter, Users, PlusCircle, Sparkles, Edit, Save } from "lucide-react";
import { Competitor, Division, AppSettings, PartnerRegistrationFields } from "../types";
import { validatePartnerFields } from "../utils/partners";
import PartnerContestFields, { emptyPartnerFields, partnerFieldsFrom } from "./PartnerContestFields";

type CompetitorDetails = { bib: string; name: string; email: string; division: string; role: "Lead" | "Follow" } & PartnerRegistrationFields;

interface RegisterCompetitorProps {
  competitors: Competitor[];
  onRegister: (competitor: CompetitorDetails) => Promise<void>;
  onUpdateCompetitor?: (oldBib: string, updates: CompetitorDetails) => Promise<void>;
  isDarkMode: boolean;
  settings: AppSettings;
}

export default function RegisterCompetitor({ competitors, onRegister, onUpdateCompetitor, isDarkMode, settings }: RegisterCompetitorProps) {
  const [bib, setBib] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [division, setDivision] = useState<Division>("Novice");
  const [role, setRole] = useState<"Lead" | "Follow">("Lead");
  const [partnerFields, setPartnerFields] = useState<PartnerRegistrationFields>(emptyPartnerFields());
  // When set, the sign-up form is editing this already-registered dancer.
  const [editingCompetitor, setEditingCompetitor] = useState<Competitor | null>(null);
  const [search, setSearch] = useState("");
  const [filterDivision, setFilterDivision] = useState<string>("All");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  if (settings.registrationEnabled === false) {
    return (
      <div className="max-w-md w-full mx-auto my-12 animate-fade-in">
        <div className={`p-8 rounded-3xl border text-center transition-all ${
          isDarkMode 
            ? "bg-slate-900 border-slate-800 text-slate-100 shadow-2xl" 
            : "bg-white border-slate-200 text-slate-800 shadow-xl"
        }`}>
          <div className="p-4 rounded-2xl mb-4 border border-rose-500/25 text-rose-500 bg-rose-500/5 inline-block">
            <Users className="w-10 h-10" />
          </div>
          
          <h2 className="text-xl font-bold tracking-tight mt-2 text-slate-900 dark:text-slate-100">Registration Locked</h2>
          <p className="text-xs text-slate-400 mt-2 leading-relaxed">
            Competitor self-registration is currently suspended by the event administrators. Please contact the Contest Coordinator floor desk to register manually.
          </p>
        </div>
      </div>
    );
  }

  const resetForm = () => {
    setBib("");
    setName("");
    setEmail("");
    setPartnerFields(emptyPartnerFields());
    setEditingCompetitor(null);
  };

  const handleStartEdit = (c: Competitor) => {
    setEditingCompetitor(c);
    setBib(c.bib);
    setName(c.name);
    setEmail(c.email || "");
    setDivision(c.division as Division);
    setRole(c.role);
    setPartnerFields(partnerFieldsFrom(c));
    setError("");
    setSuccess("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!bib.trim() || !name.trim() || !email.trim()) {
      setError("Please fill out all fields.");
      return;
    }

    if (isNaN(Number(bib))) {
      setError("Bib must be a numeric value.");
      return;
    }

    const isKeepingDivision = editingCompetitor?.division === division;
    if (!isKeepingDivision && (settings.lockedDivisions || []).includes(division)) {
      setError(`Registration for the ${division} division is closed — check-in has already been created.`);
      return;
    }

    const partnerError = validatePartnerFields(partnerFields);
    if (partnerError) {
      setError(partnerError);
      return;
    }

    const details: CompetitorDetails = {
      bib: bib.trim(),
      name: name.trim(),
      email: email.trim(),
      division,
      role,
      ...partnerFields
    };

    setLoading(true);
    try {
      if (editingCompetitor && onUpdateCompetitor) {
        await onUpdateCompetitor(editingCompetitor.bib, details);
        setSuccess(`Registration for ${details.name} (Bib ${details.bib}) updated.`);
      } else {
        await onRegister(details);
        setSuccess(`Dancer ${name} (Bib ${bib}) registered successfully!`);
      }
      resetForm();
    } catch (err: any) {
      setError(err.message || (editingCompetitor ? "Failed to update registration." : "Failed to register competitor."));
    } finally {
      setLoading(false);
    }
  };

  // Filtered list
  const filtered = competitors.filter((c) => {
    const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase()) || c.bib.includes(search);
    const matchesDiv = filterDivision === "All" || c.division === filterDivision;
    return matchesSearch && matchesDiv;
  });

  // Stats
  const leadsCount = competitors.filter((c) => c.role === "Lead").length;
  const followsCount = competitors.filter((c) => c.role === "Follow").length;
  const noviceCount = competitors.filter((c) => c.division === "Novice").length;
  const intermediateCount = competitors.filter((c) => c.division === "Intermediate").length;
  const advancedCount = competitors.filter((c) => c.division === "Advance").length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Column 1 & 2: Stats + Registrations List */}
      <div className="lg:col-span-2 space-y-6">
        {/* Statistics Widgets */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className={`p-4 rounded-2xl border transition-all ${isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100 shadow-sm"}`}>
            <span className="text-xs font-medium text-slate-400 font-mono block">Total Dancers</span>
            <span className="text-2xl font-bold text-violet-500 font-mono">{competitors.length}</span>
          </div>
          <div className={`p-4 rounded-2xl border transition-all ${isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100 shadow-sm"}`}>
            <span className="text-xs font-medium text-slate-400 font-mono block">Leaders (Leads)</span>
            <span className="text-2xl font-bold text-emerald-500 font-mono">{leadsCount}</span>
          </div>
          <div className={`p-4 rounded-2xl border transition-all ${isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100 shadow-sm"}`}>
            <span className="text-xs font-medium text-slate-400 font-mono block">Followers (Follows)</span>
            <span className="text-2xl font-bold text-rose-500 font-mono">{followsCount}</span>
          </div>
          <div className={`p-4 rounded-2xl border transition-all ${isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100 shadow-sm"}`}>
            <span className="text-xs font-medium text-slate-400 font-mono block">Ratio (L/F)</span>
            <span className="text-lg font-bold text-sky-500 font-mono">
              {followsCount > 0 ? (leadsCount / followsCount).toFixed(2) : leadsCount}
            </span>
          </div>
        </div>

        {/* Competitor Directory Card */}
        <div className={`p-6 rounded-2xl border transition-all ${isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 shadow-sm text-slate-800"}`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-lg font-bold tracking-tight">Competitor Directory</h2>
              <p className="text-xs text-slate-400">View and filter all registered dancers</p>
            </div>

            {/* Quick search & filter */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  id="competitor-search-input"
                  type="text"
                  placeholder="Search name or bib..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className={`pl-9 pr-4 py-2 text-xs rounded-xl border focus:outline-none focus:ring-1 focus:ring-violet-500 ${
                    isDarkMode ? "bg-slate-800 border-slate-700 text-slate-100 placeholder-slate-500" : "bg-slate-50 border-slate-200 text-slate-800"
                  }`}
                />
              </div>

              <div className="flex items-center gap-1">
                <ListFilter className="w-3.5 h-3.5 text-slate-400" />
                <select
                  id="division-filter-select"
                  value={filterDivision}
                  onChange={(e) => setFilterDivision(e.target.value)}
                  className={`text-xs px-3 py-2 rounded-xl border focus:outline-none focus:ring-1 focus:ring-violet-500 ${
                    isDarkMode ? "bg-slate-800 border-slate-700 text-slate-100" : "bg-slate-50 border-slate-200 text-slate-800"
                  }`}
                >
                  <option value="All">All Divisions</option>
                  <option value="Newcomer">Newcomer</option>
                  <option value="Novice">Novice</option>
                  <option value="Intermediate">Intermediate</option>
                  <option value="Advance">Advance</option>
                  <option value="All-Star">All-Star</option>
                  <option value="Pro">Pro</option>
                  <option value="Open">Open</option>
                </select>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className={`${isDarkMode ? "bg-slate-800/50 text-slate-300" : "bg-slate-50 text-slate-500"} text-xs font-semibold font-mono border-b border-slate-200 dark:border-slate-800`}>
                  <th className="p-3">Bib</th>
                  <th className="p-3">Name</th>
                  <th className="p-3">Email</th>
                  <th className="p-3">Division</th>
                  <th className="p-3">Role</th>
                  <th className="p-3">Strictly / Routine</th>
                  <th className="p-3">Check-In Status</th>
                  {onUpdateCompetitor && <th className="p-3 text-right">Edit</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                {filtered.length > 0 ? (
                  filtered.map((c) => (
                    <tr
                      key={c.bib}
                      className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-all`}
                    >
                      <td className="p-3 font-mono font-bold text-violet-500">{c.bib}</td>
                      <td className="p-3 font-medium">{c.name}</td>
                      <td className="p-3 text-slate-400">{c.email || "—"}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                          c.division === "Novice" ? "bg-sky-500/10 text-sky-500 border-sky-500/20" :
                          c.division === "Intermediate" ? "bg-amber-500/10 text-amber-500 border-amber-500/20" :
                          "bg-purple-500/10 text-purple-500 border-purple-500/20"
                        }`}>
                          {c.division}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          c.role === "Lead" ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
                        }`}>
                          {c.role}
                        </span>
                      </td>
                      <td className="p-3 text-[10px] text-slate-400 space-y-0.5">
                        {c.strictlySwing && <div><span className="font-semibold text-violet-500">Strictly</span> {c.strictlyDivision} · w/ {c.strictlyPartner}</div>}
                        {c.routine && <div><span className="font-semibold text-violet-500">Routine</span> {c.routineDivision} · w/ {c.routinePartner}</div>}
                        {!c.strictlySwing && !c.routine && "—"}
                      </td>
                      <td className="p-3">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          c.checkedIn ? "bg-green-500/10 text-green-500" : "bg-yellow-500/10 text-yellow-500"
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${c.checkedIn ? "bg-green-500" : "bg-yellow-500 animate-pulse"}`} />
                          {c.checkedIn ? "Checked In" : "Pending Check-In"}
                        </span>
                      </td>
                      {onUpdateCompetitor && (
                        <td className="p-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleStartEdit(c)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-violet-500 hover:border-violet-500/40 transition-all"
                          >
                            <Edit className="w-3 h-3" />
                            Edit
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={onUpdateCompetitor ? 8 : 7} className="p-6 text-center text-slate-500">
                      No competitors found. Use the form to register new dancers.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Column 3: Registration Form */}
      <div className="space-y-6">
        <div className={`p-6 rounded-2xl border transition-all ${isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 shadow-sm text-slate-800"}`}>
          <div className="flex items-center gap-2 mb-4">
            {editingCompetitor ? <Edit className="w-5 h-5 text-violet-500" /> : <UserPlus className="w-5 h-5 text-violet-500" />}
            <h2 className="text-lg font-bold tracking-tight">{editingCompetitor ? "Edit Registration" : "Competitor Sign-Up"}</h2>
          </div>
          <p className="text-xs text-slate-400 mb-6">
            {editingCompetitor
              ? `Correcting registration details for ${editingCompetitor.name} (Bib ${editingCompetitor.bib}).`
              : "Register a competitor into the WCS database to assign them bib numbers and division heats."}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs font-medium">
                {error}
              </div>
            )}
            {success && (
              <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20 text-green-500 text-xs font-medium">
                {success}
              </div>
            )}

            {/* Bib */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5 font-mono">Bib Number</label>
              <input
                id="competitor-bib-input"
                type="text"
                required
                placeholder="e.g. 101"
                value={bib}
                onChange={(e) => setBib(e.target.value)}
                className={`w-full px-3.5 py-2 text-xs rounded-xl border focus:outline-none focus:ring-1 focus:ring-violet-500 font-mono ${
                  isDarkMode ? "bg-slate-800 border-slate-700 text-slate-100 placeholder-slate-500" : "bg-slate-50 border-slate-200 text-slate-800"
                }`}
              />
            </div>

            {/* Name */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Full Name</label>
              <input
                id="competitor-name-input"
                type="text"
                required
                placeholder="e.g. Charlie Parker"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={`w-full px-3.5 py-2 text-xs rounded-xl border focus:outline-none focus:ring-1 focus:ring-violet-500 ${
                  isDarkMode ? "bg-slate-800 border-slate-700 text-slate-100 placeholder-slate-500" : "bg-slate-50 border-slate-200 text-slate-800"
                }`}
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Email Address</label>
              <input
                id="competitor-email-input"
                type="email"
                required
                placeholder="e.g. charlie@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`w-full px-3.5 py-2 text-xs rounded-xl border focus:outline-none focus:ring-1 focus:ring-violet-500 ${
                  isDarkMode ? "bg-slate-800 border-slate-700 text-slate-100 placeholder-slate-500" : "bg-slate-50 border-slate-200 text-slate-800"
                }`}
              />
            </div>

            {/* Division */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Division</label>
              <div className="grid grid-cols-2 gap-2">
                {(["Newcomer", "Novice", "Intermediate", "Advance", "All-Star", "Pro", "Open"] as Division[]).map((div) => {
                  const isLocked = (settings.lockedDivisions || []).includes(div) && editingCompetitor?.division !== div;
                  return (
                    <button
                      key={div}
                      type="button"
                      disabled={isLocked}
                      title={isLocked ? `${div} registration is closed` : undefined}
                      onClick={() => setDivision(div)}
                      className={`py-2 text-xs font-medium rounded-xl border transition-all ${
                        isLocked
                          ? "bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed opacity-60"
                          : division === div
                            ? "bg-violet-600 border-violet-600 text-white shadow-sm"
                            : isDarkMode
                              ? "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750"
                              : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      {div}{isLocked ? " 🔒" : ""}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Role */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Dance Role</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setRole("Lead")}
                  className={`py-2.5 rounded-xl border text-xs font-medium transition-all flex flex-col items-center justify-center gap-1 ${
                    role === "Lead"
                      ? "bg-emerald-600 border-emerald-600 text-white shadow-sm"
                      : isDarkMode
                        ? "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750"
                        : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <span className="font-bold tracking-wider">LEADER</span>
                  <span className="text-[9px] opacity-75">Traditionally Lead</span>
                </button>

                <button
                  type="button"
                  onClick={() => setRole("Follow")}
                  className={`py-2.5 rounded-xl border text-xs font-medium transition-all flex flex-col items-center justify-center gap-1 ${
                    role === "Follow"
                      ? "bg-rose-600 border-rose-600 text-white shadow-sm"
                      : isDarkMode
                        ? "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750"
                        : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <span className="font-bold tracking-wider">FOLLOWER</span>
                  <span className="text-[9px] opacity-75">Traditionally Follow</span>
                </button>
              </div>
            </div>

            {/* Partnered contests */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Partnered Contests</label>
              <PartnerContestFields
                value={partnerFields}
                onChange={setPartnerFields}
                isDarkMode={isDarkMode}
                lockedDivisions={settings.lockedDivisions}
                initialValue={editingCompetitor ? partnerFieldsFrom(editingCompetitor) : undefined}
              />
            </div>

            <button
              id="competitor-submit-btn"
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-750 text-white text-xs font-bold shadow-md shadow-violet-600/15 flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {editingCompetitor ? <Save className="w-4 h-4" /> : <PlusCircle className="w-4 h-4" />}
              {editingCompetitor
                ? (loading ? "Saving..." : "Save Changes")
                : (loading ? "Registering..." : "Add Competitor to Roster")}
            </button>
            {editingCompetitor && (
              <button
                type="button"
                onClick={() => { resetForm(); setError(""); }}
                className="w-full py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-500 hover:text-slate-300 transition-all"
              >
                Cancel Editing
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
