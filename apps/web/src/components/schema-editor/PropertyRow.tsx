import React, { useState } from 'react';
import { Settings, Trash2 } from 'lucide-react';
import { PropertyTypeSelect } from './PropertyTypeSelect';
import { EnumEditor } from './EnumEditor';

export interface Property {
  id: string;
  name: string;
  description: string;
  type: string;
  required: boolean;
  constraints: { enum_values?: string[] };
}

interface Props {
  property: Property;
  onChange: (prop: Property) => void;
  onDelete: () => void;
}

export function PropertyRow({ property, onChange, onDelete }: Props) {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="flex flex-col border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-2)] transition-colors p-2 group">
      <div className="flex items-center gap-3">
        <input 
          type="text" 
          value={property.name}
          onChange={e => onChange({...property, name: e.target.value})}
          placeholder="property_name"
          className="font-mono text-sm font-semibold border-none bg-transparent outline-none focus:ring-1 focus:ring-blue-500 rounded px-1 flex-1 text-[var(--text-primary)] tracking-tight"
        />
        
        <PropertyTypeSelect 
          value={property.type} 
          onChange={t => onChange({...property, type: t})} 
        />
        
        <label className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)] cursor-pointer select-none">
          <input 
            type="checkbox" 
            checked={property.required} 
            onChange={e => onChange({...property, required: e.target.checked})}
            className="w-3.5 h-3.5 accent-[var(--brand)] rounded"
          />
          Required
        </label>

        <button 
          onClick={() => setShowSettings(!showSettings)}
          className={`p-1 rounded hover:bg-gray-200 transition-colors ${showSettings ? 'text-[var(--brand)]' : 'text-[var(--text-muted)]'}`}
        >
          <Settings className="w-4 h-4" />
        </button>

        <button onClick={onDelete} className="p-1 rounded text-[var(--text-muted)] hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {showSettings && (
        <div className="mt-2 pl-4 border-l-[3px] border-[var(--border)] ml-2 space-y-3 pb-2 text-sm bg-gray-50/50 rounded-r-md">
          <div className="pt-2">
            <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-1">Description</label>
            <input 
              type="text" 
              value={property.description || ""}
              onChange={e => onChange({...property, description: e.target.value})}
              placeholder="What does this property mean?"
              className="w-full text-sm border border-[var(--border)] rounded px-2 py-1.5 outline-none focus:border-blue-500 bg-[var(--surface)] text-[var(--text-primary)] shadow-sm"
            />
          </div>
          
          {property.type === 'string' && (
            <EnumEditor 
              values={property.constraints?.enum_values || []}
              onChange={vals => onChange({
                ...property, 
                constraints: { ...property.constraints, enum_values: vals }
              })}
            />
          )}
        </div>
      )}
    </div>
  );
}
