import React, { useState } from "react";
import { Sparkles } from "lucide-react";

interface SampleDancersButtonProps {
  division: string;
  onAdd: (division: string) => Promise<void>;
}

export default function SampleDancersButton({ division, onAdd }: SampleDancersButtonProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [note, setNote] = useState<{ text: string; isError: boolean } | null>(null);

  const handleAdd = async () => {
    setNote(null);
    setIsAdding(true);
    try {
      await onAdd(division);
      setNote({ text: `Added 5 sample leaders and 5 sample followers to ${division}.`, isError: false });
    } catch (err: any) {
      setNote({ text: err.message || "Failed to add sample dancers.", isError: true });
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="mb-4 font-sans">
      <button
        id="add-sample-dancers-btn"
        type="button"
        onClick={handleAdd}
        disabled={isAdding}
        className="mx-auto px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-500 hover:text-violet-500 hover:border-violet-500/40 flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Sparkles className="w-3.5 h-3.5" />
        Generate 5 Sample Leaders &amp; 5 Followers
      </button>
      {note && (
        <p id="sample-dancers-note" role="status" className={`mt-2 text-xs ${note.isError ? "text-rose-500" : "text-green-500"}`}>
          {note.text}
        </p>
      )}
    </div>
  );
}
