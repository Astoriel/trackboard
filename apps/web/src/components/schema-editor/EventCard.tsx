import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Trash2, Tag } from 'lucide-react';
import { PropertyRow, Property } from './PropertyRow';

export interface TrackingEvent {
  id: string;
  event_name: string;
  description: string;
  category: string;
  status: string;
  properties: Property[];
}

interface Props {
  event: TrackingEvent;
  onChange: (event: TrackingEvent) => void;
  onDelete: () => void;
}

export function EventCard({ event, onChange, onDelete }: Props) {
  const [expanded, setExpanded] = useState(false);

  const addProperty = () => {
    const newProp: Property = {
      id: crypto.randomUUID(),
      name: 'new_property',
      description: '',
      type: 'string',
      required: false,
      constraints: {}
    };
    onChange({ ...event, properties: [...event.properties, newProp] });
    setExpanded(true);
  };

  const updateProperty = (updated: Property) => {
    onChange({
      ...event,
      properties: event.properties.map(p => p.id === updated.id ? updated : p)
    });
  };

  const deleteProperty = (id: string) => {
    onChange({
      ...event,
      properties: event.properties.filter(p => p.id !== id)
    });
  };

  return (
    <div className="border border-[var(--border)] rounded-lg bg-[var(--surface)] shadow-sm overflow-hidden mb-4">
      <div 
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-[var(--surface-2)] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          {expanded ? <ChevronDown className="w-5 h-5 text-[var(--text-muted)]" /> : <ChevronRight className="w-5 h-5 text-[var(--text-muted)]" />}
          <div>
            <div className="font-semibold tracking-tight text-[var(--text-primary)]">{event.event_name}</div>
            <div className="text-xs text-[var(--text-secondary)]">{event.description || "No description"}</div>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          {event.category && (
              <span className="flex items-center gap-1 text-[10px] uppercase font-medium tracking-wider bg-gray-100 border border-gray-200 px-2 py-0.5 rounded text-[var(--text-secondary)]">
              <Tag className="w-3 h-3" /> {event.category}
            </span>
          )}
          
          <button 
            title="Delete event"
            onClick={(e) => { e.stopPropagation(); onDelete(); }} 
            className="text-[var(--text-muted)] hover:text-red-500 p-1 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-[var(--border)] bg-[var(--surface-2)] p-0 pb-2">
          <div className="p-2 bg-[var(--surface-2)] text-xs font-semibold tracking-wider text-[var(--text-muted)] border-b border-[var(--border)] pl-8 select-none">
            PROPERTIES
          </div>
          <div className="flex flex-col pl-4 pr-2 pb-2">
            {event.properties.length === 0 ? (
              <div className="p-4 text-center text-sm text-[var(--text-muted)]">No properties defined.</div>
            ) : (
              event.properties.map(p => (
                <PropertyRow 
                  key={p.id} 
                  property={p} 
                  onChange={updateProperty} 
                  onDelete={() => deleteProperty(p.id)} 
                />
              ))
            )}
            
            <div className="p-2">
              <button 
                onClick={addProperty}
                className="flex items-center gap-1 text-sm font-medium text-[var(--brand)] hover:text-[var(--brand-light)] px-2 py-1 rounded transition-colors"
              >
                <Plus className="w-4 h-4" /> Add Property
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
