import React, { useState } from 'react';
import { X, Plus } from 'lucide-react';

interface Props {
  values: string[];
  onChange: (values: string[]) => void;
}

export function EnumEditor({ values, onChange }: Props) {
  const [newVal, setNewVal] = useState("");

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (newVal.trim() && !values.includes(newVal.trim())) {
      onChange([...values, newVal.trim()]);
      setNewVal("");
    }
  };

  const remove = (val: string) => {
    onChange(values.filter(v => v !== val));
  };

  return (
    <div className="flex flex-col gap-2 p-3 border border-[var(--border)] rounded-md bg-[var(--surface-2)]">
      <div className="text-xs font-semibold text-[var(--text-primary)] tracking-tight">Allowed Enum Values</div>
      <div className="flex flex-wrap gap-1">
        {values.length === 0 && <span className="text-xs text-[var(--text-muted)]">Any valid string</span>}
        {values.map(v => (
          <span key={v} className="bg-blue-50/50 text-blue-700 border border-blue-200 text-xs px-2 py-1 rounded-full flex items-center gap-1">
            {v}
            <button type="button" onClick={() => remove(v)} className="hover:text-blue-900 transition-colors"><X className="w-3 h-3"/></button>
          </span>
        ))}
      </div>
      <form onSubmit={add} className="flex gap-1 mt-1">
        <input 
          type="text" 
          value={newVal} 
          onChange={e => setNewVal(e.target.value)}
          placeholder="New value..."
          className="flex-1 text-sm border border-[var(--border)] rounded px-2 py-1 outline-none focus:border-blue-500 bg-[var(--surface)] text-[var(--text-primary)]"
        />
        <button type="submit" className="btn-secondary px-2"><Plus className="w-4 h-4"/></button>
      </form>
    </div>
  );
}
