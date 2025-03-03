import React from 'react';
import { Type } from 'lucide-react';

interface Props {
  value: string;
  onChange: (val: string) => void;
}

export function PropertyTypeSelect({ value, onChange }: Props) {
  return (
    <div className="flex items-center gap-2">
      <Type className="w-4 h-4 text-gray-500" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-[var(--surface-2)] text-[var(--text-primary)] border border-[var(--border)] rounded font-medium text-xs py-1 px-2 focus:ring-1 focus:ring-blue-500 outline-none cursor-pointer"
      >
        <option value="string">String</option>
        <option value="integer">Integer</option>
        <option value="float">Float</option>
        <option value="boolean">Boolean</option>
        <option value="array">Array</option>
        <option value="object">Object</option>
      </select>
    </div>
  );
}
