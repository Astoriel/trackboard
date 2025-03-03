import React from 'react';
import { X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (name: string, description: string, category: string) => void;
}

const eventSchema = z.object({
  name: z.string().min(1, "Event Name is required").regex(/^[a-z0-9_]+$/, "Should be lowercase, numbers, and underscores only"),
  category: z.string().optional(),
  description: z.string().optional(),
});

type EventFormValues = z.infer<typeof eventSchema>;

export function AddEventDialog({ isOpen, onClose, onAdd }: Props) {
  const { register, handleSubmit, formState: { errors, isValid }, reset } = useForm<EventFormValues>({
    resolver: zodResolver(eventSchema),
    mode: "onChange",
    defaultValues: { name: "", category: "", description: "" }
  });

  if (!isOpen) return null;

  const onSubmit = (data: EventFormValues) => {
    onAdd(data.name, data.description || "", data.category || "");
    reset();
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-[var(--surface)] w-full max-w-md rounded-xl shadow-lg border border-[var(--border)] p-6 relative">
        <button onClick={handleClose} className="absolute top-4 right-4 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
          <X size={20} />
        </button>
        <h2 className="text-xl font-semibold mb-4 text-[var(--text-primary)]">Add New Event</h2>
        
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Event Name <span className="text-red-500">*</span></label>
            <input 
              autoFocus
              {...register("name")}
              placeholder="e.g. user_signed_up"
              className={`input ${errors.name ? "border-red-500 focus:border-red-500 focus:ring-red-500/20" : ""}`}
            />
            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Category</label>
            <input 
              {...register("category")}
              placeholder="e.g. Authentication"
              className="input"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Description</label>
            <textarea 
              {...register("description")}
              placeholder="What triggers this event?"
              rows={3}
              className="input resize-none"
            />
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button type="button" onClick={handleClose} className="btn-ghost py-2">Cancel</button>
            <button type="submit" disabled={!isValid} className="btn-primary">Add Event</button>
          </div>
        </form>
      </div>
    </div>
  );
}
