import React, { useState } from 'react';
import { Search, Plus, Save } from 'lucide-react';
import { EventCard, TrackingEvent } from './EventCard';
import { AddEventDialog } from './AddEventDialog';

interface Props {
  initialEvents: TrackingEvent[];
  onSave: (events: TrackingEvent[]) => void;
  isSaving?: boolean;
}

export function SchemaCanvas({ initialEvents, onSave, isSaving = false }: Props) {
  const [events, setEvents] = useState<TrackingEvent[]>(initialEvents);
  const [search, setSearch] = useState('');
  const [isAddOpen, setIsAddOpen] = useState(false);

  const filteredEvents = events.filter(e => 
    e.event_name.toLowerCase().includes(search.toLowerCase()) || 
    e.description?.toLowerCase().includes(search.toLowerCase())
  );

  const handleAdd = (name: string, desc: string, cat: string) => {
    const newEvent: TrackingEvent = {
      id: crypto.randomUUID(),
      event_name: name,
      description: desc,
      category: cat,
      status: 'active',
      properties: []
    };
    setEvents([newEvent, ...events]);
    setIsAddOpen(false);
  };

  const updateEvent = (updated: TrackingEvent) => {
    setEvents(events.map(e => e.id === updated.id ? updated : e));
  };

  const deleteEvent = (id: string) => {
    setEvents(events.filter(e => e.id !== id));
  };

  return (
    <div className="flex flex-col h-full bg-[var(--surface-2)] p-6 overflow-hidden rounded-xl border border-[var(--border)] shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <div>
            <h1 className="text-2xl font-semibold tracking-[-0.035em] text-[var(--text-primary)]">Schema Editor</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">Define, configure, and manage tracking events for this plan.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => onSave(events)}
            disabled={isSaving}
            className="flex items-center gap-2 btn-primary px-4 py-2 font-medium text-sm transition-colors shadow-sm"
          >
            <Save className="w-4 h-4" /> {isSaving ? 'Saving...' : 'Save Draft'}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
          <input 
            type="text"
            placeholder="Search events..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--surface)] text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-blue-500 shadow-sm transition-shadow"
          />
        </div>
        <button 
          onClick={() => setIsAddOpen(true)}
          className="flex items-center gap-2 btn-secondary px-4 py-2 font-medium text-sm text-blue-600 bg-blue-50/50 border-blue-200 hover:bg-blue-100 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" /> New Event
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
        {filteredEvents.length === 0 ? (
          <div className="text-center py-20 border-2 border-dashed border-[var(--border)] rounded-xl">
            <div className="text-[var(--text-secondary)] mb-2">No events found matching your criteria.</div>
            <button onClick={() => setIsAddOpen(true)} className="text-blue-600 font-medium hover:underline">Create a new event</button>
          </div>
        ) : (
          <div className="max-w-4xl space-y-4">
            {filteredEvents.map(event => (
              <EventCard 
                key={event.id}
                event={event}
                onChange={updateEvent}
                onDelete={() => deleteEvent(event.id)}
              />
            ))}
          </div>
        )}
      </div>

      <AddEventDialog 
        isOpen={isAddOpen} 
        onClose={() => setIsAddOpen(false)} 
        onAdd={handleAdd} 
      />
    </div>
  );
}
