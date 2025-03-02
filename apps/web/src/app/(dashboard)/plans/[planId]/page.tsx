"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  ClipboardCheck,
  GitBranch,
  Loader2,
  MessageSquare,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Wand2,
} from "lucide-react";
import {
  aiApi,
  commentsApi,
  eventsApi,
  globalPropertiesApi,
  plansApi,
  propertiesApi,
} from "@/lib/api";
import { formatRelative, PROPERTY_TYPES } from "@/lib/utils";
import { toast } from "@/store/toast";

const EVENT_STATUSES = ["active", "planned", "deprecated"];

interface PlanProperty {
  id: string;
  name: string;
  type: string;
  required: boolean;
  description: string | null;
}

interface GlobalProperty {
  id: string;
  name: string;
  type: string;
  required: boolean;
  description: string | null;
}

interface PlanEvent {
  id: string;
  event_name: string;
  description: string | null;
  category: string | null;
  status: string;
  properties: PlanProperty[];
  global_properties: GlobalProperty[];
}

interface TrackingPlan {
  id: string;
  name: string;
  description: string | null;
  status: string;
  current_version: number;
  draft_revision: number;
  is_main: boolean;
  parent_plan_id: string | null;
  branch_name: string | null;
  events: PlanEvent[];
  global_properties: GlobalProperty[];
}

interface BranchPlan {
  id: string;
  branch_name: string | null;
}

interface PlanComment {
  id: string;
  event_id: string;
  user_id: string;
  user_name: string | null;
  body: string;
  created_at: string;
}

interface AISuggestedProperty {
  name: string;
  type?: string;
  required?: boolean;
  description?: string | null;
}

interface AISuggestedEvent {
  event_name?: string;
  description?: string | null;
  category?: string | null;
  properties?: AISuggestedProperty[];
}

interface DuplicatePair {
  event_a: string;
  event_b: string;
  confidence: string;
  reason: string;
}

export default function PlanEditorPage() {
  const { planId } = useParams<{ planId: string }>() || { planId: "" };
  const router = useRouter();

  const [plan, setPlan] = useState<TrackingPlan | null>(null);
  const [branches, setBranches] = useState<BranchPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [showBranchForm, setShowBranchForm] = useState(false);
  const [branchName, setBranchName] = useState("");
  const [eventQuery, setEventQuery] = useState("");
  const [eventSearchResults, setEventSearchResults] = useState<PlanEvent[] | null>(null);
  const [eventSearchLoading, setEventSearchLoading] = useState(false);
  const [newEventName, setNewEventName] = useState("");
  const [newGlobalPropertyName, setNewGlobalPropertyName] = useState("");
  const [newGlobalPropertyType, setNewGlobalPropertyType] = useState("string");
  const [propertyDrafts, setPropertyDrafts] = useState<Record<string, string>>({});
  const [openComments, setOpenComments] = useState<Record<string, boolean>>({});
  const [commentsByEvent, setCommentsByEvent] = useState<Record<string, PlanComment[]>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [loadingComments, setLoadingComments] = useState<Record<string, boolean>>({});
  const [aiPayload, setAiPayload] = useState("");
  const [aiSuggestion, setAiSuggestion] = useState<AISuggestedEvent | null>(null);
  const [aiError, setAiError] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiDuplicates, setAiDuplicates] = useState<DuplicatePair[]>([]);
  const [aiDuplicateError, setAiDuplicateError] = useState("");
  const [aiDuplicateLoading, setAiDuplicateLoading] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  const mainPlanId = useMemo(() => {
    if (!plan) return planId;
    return plan.is_main ? plan.id : (plan.parent_plan_id ?? plan.id);
  }, [plan, planId]);

  const availableGlobalProperties = (event: PlanEvent) => {
    const linkedIds = new Set(event.global_properties.map((property) => property.id));
    return plan?.global_properties.filter((property) => !linkedIds.has(property.id)) ?? [];
  };

  const visibleEvents = eventSearchResults ?? plan?.events ?? [];

  const governanceSummary = useMemo(() => {
    if (!plan) {
      return null;
    }

    const events = plan.events;
    const eventCount = events.length;
    const localPropertyCount = events.reduce((count, event) => count + event.properties.length, 0);
    const linkedGlobalPropertyCount = events.reduce(
      (count, event) => count + event.global_properties.length,
      0,
    );
    const documentedEvents = events.filter((event) => event.description?.trim()).length;
    const documentedProperties = events.reduce(
      (count, event) =>
        count + event.properties.filter((property) => property.description?.trim()).length,
      0,
    );
    const requiredProperties = events.reduce(
      (count, event) =>
        count +
        event.properties.filter((property) => property.required).length +
        event.global_properties.filter((property) => property.required).length,
      0,
    );
    const eventWithSchemaCount = events.filter(
      (event) => event.properties.length + event.global_properties.length > 0,
    ).length;
    const deprecatedEvents = events.filter((event) => event.status === "deprecated").length;

    const checks = [
      {
        label: "At least one event is defined",
        passed: eventCount > 0,
      },
      {
        label: "Every event has at least one local or shared property",
        passed: eventCount > 0 && eventWithSchemaCount === eventCount,
      },
      {
        label: "Every event has a description for analytics consumers",
        passed: eventCount > 0 && documentedEvents === eventCount,
      },
      {
        label: "At least one required property is declared",
        passed: requiredProperties > 0,
      },
      {
        label: "A published version exists for SDK validation",
        passed: plan.current_version > 0,
      },
    ];

    return {
      eventCount,
      localPropertyCount,
      linkedGlobalPropertyCount,
      documentedEvents,
      documentedProperties,
      requiredProperties,
      deprecatedEvents,
      score: Math.round(
        (checks.filter((check) => check.passed).length / checks.length) * 100,
      ),
      checks,
    };
  }, [plan]);

  const loadPlan = useCallback(async () => {
    if (!planId) return;

    setLoading(true);
    try {
      const { data } = await plansApi.get(planId);
      setPlan(data);

      const rootPlanId = data.is_main ? data.id : (data.parent_plan_id ?? data.id);
      const branchesResponse = await plansApi.branches(rootPlanId);
      setBranches(branchesResponse.data);
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => {
    loadPlan().catch((error) => {
      console.error(error);
      toast.error("Failed to load plan", "Could not load the selected workspace.");
      setLoading(false);
    });
  }, [loadPlan]);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!plan?.id) return;

    const query = eventQuery.trim();
    if (!query) {
      setEventSearchResults(null);
      setEventSearchLoading(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setEventSearchLoading(true);
      try {
        const { data } = await eventsApi.list(plan.id, query);
        if (!cancelled) {
          setEventSearchResults(data);
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          toast.error("Event search failed", "Could not filter events from the backend.");
        }
      } finally {
        if (!cancelled) {
          setEventSearchLoading(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [eventQuery, plan?.id]);

  const handleMutationError = async (error: any) => {
    if (error?.response?.data?.code === "stale_revision") {
      toast.warning(
        "Workspace changed",
        "The plan was updated elsewhere. We refreshed the latest draft revision.",
      );
      await loadPlan();
      return true;
    }

    return false;
  };

  const runMutation = async (
    action: () => Promise<void>,
    {
      actionKey,
      successTitle,
      successMessage,
    }: { actionKey: string; successTitle?: string; successMessage?: string },
  ) => {
    setBusyAction(actionKey);
    try {
      await action();
      await loadPlan();
      if (successTitle) {
        toast.success(successTitle, successMessage);
      }
    } catch (error: any) {
      console.error(error);
      const handled = await handleMutationError(error);
      if (!handled) {
        toast.error("Request failed", error?.response?.data?.message ?? "Please try again.");
      }
    } finally {
      setBusyAction(null);
    }
  };

  const loadComments = async (eventId: string) => {
    setLoadingComments((current) => ({ ...current, [eventId]: true }));
    try {
      const { data } = await commentsApi.list(eventId);
      setCommentsByEvent((current) => ({ ...current, [eventId]: data }));
    } catch (error) {
      console.error(error);
      toast.error("Comments failed", "Could not load comments for this event.");
    } finally {
      setLoadingComments((current) => ({ ...current, [eventId]: false }));
    }
  };

  const toggleComments = async (eventId: string) => {
    const willOpen = !openComments[eventId];
    setOpenComments((current) => ({ ...current, [eventId]: willOpen }));
    if (willOpen && !commentsByEvent[eventId]) {
      await loadComments(eventId);
    }
  };

  const addComment = async (event: React.FormEvent, eventId: string) => {
    event.preventDefault();
    const body = commentDrafts[eventId]?.trim();
    if (!body) return;

    setBusyAction(`comment-${eventId}`);
    try {
      const { data } = await commentsApi.create(eventId, body);
      setCommentsByEvent((current) => ({
        ...current,
        [eventId]: [...(current[eventId] ?? []), data],
      }));
      setCommentDrafts((current) => ({ ...current, [eventId]: "" }));
      toast.success("Comment added");
    } catch (error) {
      console.error(error);
      toast.error("Comment failed", "Could not add comment.");
    } finally {
      setBusyAction(null);
    }
  };

  const deleteComment = async (eventId: string, commentId: string) => {
    setBusyAction(`delete-comment-${commentId}`);
    try {
      await commentsApi.delete(commentId);
      setCommentsByEvent((current) => ({
        ...current,
        [eventId]: (current[eventId] ?? []).filter((comment) => comment.id !== commentId),
      }));
      toast.success("Comment deleted");
    } catch (error) {
      console.error(error);
      toast.error("Delete failed", "You can only delete your own comments.");
    } finally {
      setBusyAction(null);
    }
  };

  const addEvent = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!plan || !newEventName.trim()) return;

    await runMutation(
      async () => {
        await eventsApi.create(plan.id, {
          event_name: newEventName.trim(),
          draft_revision: plan.draft_revision,
        });
        setNewEventName("");
      },
      {
        actionKey: "create-event",
        successTitle: "Event added",
        successMessage: "The workspace draft revision was updated.",
      },
    );
  };

  const deleteEvent = async (eventId: string) => {
    if (!plan || !confirm("Delete this event from the workspace?")) return;

    await runMutation(
      async () => {
        await eventsApi.delete(eventId, plan.draft_revision);
      },
      { actionKey: `delete-event-${eventId}`, successTitle: "Event deleted" },
    );
  };

  const updateEvent = async (
    eventId: string,
    payload: Partial<Pick<PlanEvent, "event_name" | "description" | "category" | "status">>,
  ) => {
    if (!plan) return;

    await runMutation(
      async () => {
        await eventsApi.update(eventId, {
          ...payload,
          draft_revision: plan.draft_revision,
        });
      },
      {
        actionKey: `update-event-${eventId}`,
      },
    );
  };

  const addProperty = async (eventId: string) => {
    if (!plan) return;
    const name = propertyDrafts[eventId]?.trim();
    if (!name) return;

    await runMutation(
      async () => {
        await propertiesApi.create(eventId, {
          name,
          type: "string",
          required: false,
          constraints: {},
          draft_revision: plan.draft_revision,
        });
        setPropertyDrafts((current) => ({ ...current, [eventId]: "" }));
      },
      {
        actionKey: `create-property-${eventId}`,
        successTitle: "Property added",
      },
    );
  };

  const updateProperty = async (
    propertyId: string,
    payload: Partial<Pick<PlanProperty, "name" | "description" | "type" | "required">>,
  ) => {
    if (!plan) return;

    await runMutation(
      async () => {
        await propertiesApi.update(propertyId, {
          ...payload,
          draft_revision: plan.draft_revision,
        });
      },
      {
        actionKey: `update-property-${propertyId}`,
      },
    );
  };

  const deleteProperty = async (propertyId: string) => {
    if (!plan || !confirm("Delete this property?")) return;

    await runMutation(
      async () => {
        await propertiesApi.delete(propertyId, plan.draft_revision);
      },
      {
        actionKey: `delete-property-${propertyId}`,
        successTitle: "Property deleted",
      },
    );
  };

  const addGlobalProperty = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!plan || !newGlobalPropertyName.trim()) return;

    await runMutation(
      async () => {
        await globalPropertiesApi.create(plan.id, {
          name: newGlobalPropertyName.trim(),
          type: newGlobalPropertyType,
          required: false,
          constraints: {},
          draft_revision: plan.draft_revision,
        });
        setNewGlobalPropertyName("");
        setNewGlobalPropertyType("string");
      },
      {
        actionKey: "create-global-property",
        successTitle: "Global property added",
      },
    );
  };

  const deleteGlobalProperty = async (globalPropertyId: string) => {
    if (!plan || !confirm("Delete this global property?")) return;

    await runMutation(
      async () => {
        await globalPropertiesApi.delete(globalPropertyId, plan.draft_revision);
      },
      {
        actionKey: `delete-global-property-${globalPropertyId}`,
        successTitle: "Global property deleted",
      },
    );
  };

  const updateGlobalProperty = async (
    globalPropertyId: string,
    payload: Partial<Pick<GlobalProperty, "name" | "description" | "type" | "required">>,
  ) => {
    if (!plan) return;

    await runMutation(
      async () => {
        await globalPropertiesApi.update(globalPropertyId, {
          ...payload,
          draft_revision: plan.draft_revision,
        });
      },
      {
        actionKey: `update-global-property-${globalPropertyId}`,
      },
    );
  };

  const linkGlobalProperty = async (eventId: string, globalPropertyId: string) => {
    if (!plan) return;

    await runMutation(
      async () => {
        await globalPropertiesApi.link(eventId, globalPropertyId, plan.draft_revision);
      },
      {
        actionKey: `link-global-property-${eventId}-${globalPropertyId}`,
        successTitle: "Global property linked",
      },
    );
  };

  const unlinkGlobalProperty = async (eventId: string, globalPropertyId: string) => {
    if (!plan) return;

    await runMutation(
      async () => {
        await globalPropertiesApi.unlink(eventId, globalPropertyId, plan.draft_revision);
      },
      {
        actionKey: `unlink-global-property-${eventId}-${globalPropertyId}`,
        successTitle: "Global property unlinked",
      },
    );
  };

  const publishPlan = async () => {
    if (!plan || !plan.is_main) return;

    setBusyAction("publish");
    try {
      await plansApi.publish(plan.id, {
        draft_revision: plan.draft_revision,
        summary: `Publish from revision ${plan.draft_revision}`,
      });
      toast.success("Published", "Created a new immutable version from the main workspace.");
      await loadPlan();
    } catch (error: any) {
      if (error?.response?.data?.code === "breaking_change_blocked") {
        const confirmed = confirm(
          "Breaking changes were detected. Publish anyway and record them in the compatibility report?",
        );

        if (confirmed) {
          await plansApi.publish(plan.id, {
            draft_revision: plan.draft_revision,
            summary: `Publish from revision ${plan.draft_revision}`,
            allow_breaking: true,
          });
          toast.warning(
            "Published with breaking changes",
            "The compatibility report was recorded on the new version.",
          );
          await loadPlan();
        }
        return;
      }

      const handled = await handleMutationError(error);
      if (!handled) {
        toast.error("Publish failed", error?.response?.data?.message ?? "Please try again.");
      }
    } finally {
      setBusyAction(null);
    }
  };

  const createBranch = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!plan || !plan.is_main || !branchName.trim()) return;

    setBusyAction("create-branch");
    try {
      const response = await plansApi.createBranch(plan.id, {
        branch_name: branchName.trim(),
        draft_revision: plan.draft_revision,
      });
      toast.success("Branch created", "Opening the new workspace.");
      setShowBranchForm(false);
      setBranchName("");
      router.push(`/plans/${response.data.id}`);
    } catch (error: any) {
      console.error(error);
      const handled = await handleMutationError(error);
      if (!handled) {
        toast.error("Branch creation failed", "Could not create the branch.");
      }
    } finally {
      setBusyAction(null);
    }
  };

  const generateAiSchema = async () => {
    if (!plan || !aiPayload.trim()) return;

    setAiGenerating(true);
    setAiError("");
    setAiSuggestion(null);
    try {
      JSON.parse(aiPayload);
      const response = await aiApi.generate(plan.id, aiPayload);
      setAiSuggestion(response.data);
      toast.success("AI draft generated", "Review the event before adding it to the workspace.");
    } catch (error: any) {
      if (error instanceof SyntaxError) {
        setAiError("Paste valid JSON before generating an event draft.");
      } else {
        setAiError(
          error?.response?.data?.message ??
            error?.response?.data?.detail ??
            "AI generation failed. Check the provider settings.",
        );
      }
    } finally {
      setAiGenerating(false);
    }
  };

  const addAiSuggestionToPlan = async () => {
    if (!plan || !aiSuggestion?.event_name) return;

    setBusyAction("ai-add-event");
    try {
      const eventResponse = await eventsApi.create(plan.id, {
        event_name: aiSuggestion.event_name,
        description: aiSuggestion.description ?? null,
        category: aiSuggestion.category ?? null,
        draft_revision: plan.draft_revision,
      });
      let nextRevision = eventResponse.data.draft_revision ?? plan.draft_revision + 1;

      for (const property of aiSuggestion.properties ?? []) {
        if (!property.name) continue;
        const propertyResponse = await propertiesApi.create(eventResponse.data.id, {
          name: property.name,
          description: property.description ?? null,
          type: (PROPERTY_TYPES as readonly string[]).includes(property.type ?? "")
            ? property.type
            : "string",
          required: Boolean(property.required),
          constraints: {},
          draft_revision: nextRevision,
        });
        nextRevision = propertyResponse.data.draft_revision ?? nextRevision + 1;
      }

      setAiSuggestion(null);
      setAiPayload("");
      toast.success("AI event added", "The generated event was written to the draft workspace.");
      await loadPlan();
    } catch (error: any) {
      console.error(error);
      const handled = await handleMutationError(error);
      if (!handled) {
        toast.error("AI event failed", error?.response?.data?.message ?? "Could not add event.");
      }
    } finally {
      setBusyAction(null);
    }
  };

  const analyzeAiDuplicates = async () => {
    if (!plan) return;

    setAiDuplicateLoading(true);
    setAiDuplicateError("");
    setAiDuplicates([]);
    try {
      const response = await aiApi.analyze(plan.id);
      setAiDuplicates(response.data.duplicates ?? []);
      toast.success("AI analysis complete");
    } catch (error: any) {
      setAiDuplicateError(
        error?.response?.data?.message ??
          error?.response?.data?.detail ??
          "AI analysis failed. Check the provider settings.",
      );
    } finally {
      setAiDuplicateLoading(false);
    }
  };

  if (loading || !plan) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="page-pad fade-in-up mx-auto flex h-full w-full max-w-7xl flex-col">
      <div className="mb-7 flex flex-col justify-between gap-5 xl:flex-row xl:items-start">
        <div className="flex items-start gap-3">
          <button onClick={() => router.push("/plans")} className="btn-secondary p-3">
            <ArrowLeft size={16} />
          </button>
          <div>
            <p className="section-label mb-3">{plan.is_main ? "Main workspace" : "Branch workspace"}</p>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="editorial-title text-4xl md:text-5xl">
                {plan.name}
              </h1>
              <span className={`badge badge-${plan.status}`}>{plan.status}</span>
              <span className="outline-pill">
                {plan.is_main ? "main" : plan.branch_name || "branch"}
              </span>
              <span className="outline-pill">
                draft r{plan.draft_revision}
              </span>
              <span className="outline-pill">
                published v{plan.current_version}
              </span>
            </div>
            <p className="mt-3 max-w-3xl text-sm font-medium leading-6 text-[var(--text-secondary)]">
              {plan.description ||
                "This workspace is the source of truth for event definitions, publish readiness, and merge review."}
            </p>
            {!plan.is_main && (
              <p className="mt-2 text-sm font-medium italic text-[var(--warning)]">
                Branch workspace. Merge into main, then publish from main to release a new version.
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {plan.is_main ? (
            <>
              <button
                onClick={() => setShowBranchForm((current) => !current)}
                className="btn-secondary flex items-center gap-2"
              >
                <GitBranch size={14} />
                Branch
              </button>
              <button
                onClick={publishPlan}
                disabled={busyAction === "publish"}
                className="btn-primary flex items-center gap-2"
              >
                {busyAction === "publish" ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <Send size={14} />
                )}
                {busyAction === "publish" ? "Publishing..." : "Publish"}
              </button>
            </>
          ) : (
            <Link
              href={`/plans/${mainPlanId}/merge-requests/new?branch=${plan.id}`}
              className="btn-primary flex items-center gap-2"
            >
              <GitBranch size={14} />
              Open Merge Request
            </Link>
          )}
        </div>
      </div>

      {showBranchForm && plan.is_main && (
        <form
          onSubmit={createBranch}
          method="post"
          className="card mb-6 flex flex-col gap-3 border"
          style={{ borderColor: "var(--border)" }}
        >
          <div>
            <h2 className="text-sm font-medium text-[var(--text-primary)]">Create branch</h2>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              The branch starts from the current main revision and does not publish automatically.
            </p>
          </div>
          <div className="flex gap-3">
            <input
              className="input flex-1"
              placeholder="feature/new-checkout"
              value={branchName}
              onChange={(event) => setBranchName(event.target.value)}
              disabled={!isMounted || busyAction === "create-branch"}
            />
            <button
              type="submit"
              disabled={!isMounted || busyAction === "create-branch" || !branchName.trim()}
              className="btn-primary"
            >
              {busyAction === "create-branch" ? "Creating..." : "Create"}
            </button>
          </div>
        </form>
      )}

      {governanceSummary && (
        <div className="card mb-6 overflow-hidden">
          <div className="grid gap-6 xl:grid-cols-[260px_1fr]">
            <div className="rounded-[1.75rem] border bg-[var(--surface-2)] p-5" style={{ borderColor: "var(--border)" }}>
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--text-primary)] shadow-sm">
                  <ClipboardCheck size={20} strokeWidth={1.6} />
                </div>
                <div>
                  <p className="section-label">Governance score</p>
                  <p className="metric-number text-5xl text-[var(--text-primary)]">
                    {governanceSummary.score}
                  </p>
                </div>
              </div>
              <p className="text-sm font-medium leading-6 text-[var(--text-secondary)]">
                A lightweight readiness check inspired by paid tracking-plan governance tools:
                catalog coverage, schema depth, required fields, and publish readiness.
              </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
              <div className="grid grid-cols-2 gap-3">
                {[
                  ["Events", governanceSummary.eventCount],
                  ["Local props", governanceSummary.localPropertyCount],
                  ["Shared links", governanceSummary.linkedGlobalPropertyCount],
                  ["Required props", governanceSummary.requiredProperties],
                  ["Documented events", `${governanceSummary.documentedEvents}/${governanceSummary.eventCount}`],
                  ["Documented props", governanceSummary.documentedProperties],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-[1.25rem] border bg-[var(--surface-2)] p-4" style={{ borderColor: "var(--border)" }}>
                    <p className="section-label mb-2">{label}</p>
                    <p className="text-2xl font-medium tracking-[-0.035em] text-[var(--text-primary)]">
                      {value}
                    </p>
                  </div>
                ))}
              </div>

              <div className="rounded-[1.5rem] border bg-[var(--surface-2)] p-4" style={{ borderColor: "var(--border)" }}>
                <p className="section-label mb-3">Release checklist</p>
                <div className="space-y-2">
                  {governanceSummary.checks.map((check) => (
                    <div key={check.label} className="flex items-start gap-2 text-sm font-medium">
                      <span
                        className={`mt-1 h-2.5 w-2.5 rounded-full ${
                          check.passed ? "bg-emerald-500" : "bg-amber-500"
                        }`}
                      />
                      <span className={check.passed ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}>
                        {check.label}
                      </span>
                    </div>
                  ))}
                </div>
                {governanceSummary.deprecatedEvents > 0 && (
                  <p className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs font-semibold text-amber-700">
                    {governanceSummary.deprecatedEvents} deprecated event(s) remain in the catalog.
                    Keep them documented until consumers migrate.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="card mb-6">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="section-label mb-2">Optional AI assistant</p>
                <h2 className="text-2xl font-semibold tracking-[-0.035em] text-[var(--text-primary)]">
                  Draft schema from payload
                </h2>
                <p className="mt-1 text-sm font-medium leading-6 text-[var(--text-secondary)]">
                  Uses the organization AI provider from Settings. Generated schemas are drafts:
                  nothing is written until you approve it.
                </p>
              </div>
              <Link href="/settings" className="btn-secondary text-xs">
                AI settings
              </Link>
            </div>

            <textarea
              className="input min-h-[210px] rounded-[1.75rem] font-mono text-sm"
              placeholder={'{\n  "event": "signup_completed",\n  "properties": { "user_id": "usr_123", "method": "google" }\n}'}
              value={aiPayload}
              onChange={(event) => setAiPayload(event.target.value)}
              disabled={!isMounted || aiGenerating}
              spellCheck={false}
            />
            {aiError && (
              <div className="mt-3 rounded-[1.25rem] border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
                {aiError}
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={generateAiSchema}
                disabled={!isMounted || aiGenerating || !aiPayload.trim()}
                className="btn-primary flex items-center gap-2"
              >
                {aiGenerating ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                {aiGenerating ? "Generating..." : "Generate draft"}
              </button>
              <button
                type="button"
                onClick={analyzeAiDuplicates}
                disabled={!isMounted || aiDuplicateLoading || plan.events.length < 2}
                className="btn-secondary flex items-center gap-2"
              >
                {aiDuplicateLoading ? <Loader2 size={14} className="animate-spin" /> : <Bot size={14} />}
                Analyze duplicates
              </button>
            </div>
          </div>

          <div className="rounded-[1.75rem] border bg-[var(--surface-2)] p-4" style={{ borderColor: "var(--border)" }}>
            <p className="section-label mb-3">AI review output</p>
            {aiSuggestion ? (
              <div className="space-y-3">
                <div>
                  <p className="font-mono text-sm font-semibold text-[var(--text-primary)]">
                    {aiSuggestion.event_name || "unnamed_event"}
                  </p>
                  <p className="mt-1 text-xs font-medium text-[var(--text-secondary)]">
                    {aiSuggestion.description || "No description returned."}
                  </p>
                  {aiSuggestion.category && (
                    <span className="outline-pill mt-2 inline-flex">{aiSuggestion.category}</span>
                  )}
                </div>
                <div className="space-y-2">
                  {(aiSuggestion.properties ?? []).map((property) => (
                    <div key={property.name} className="rounded-2xl border bg-[var(--surface)] px-3 py-2 text-xs" style={{ borderColor: "var(--border)" }}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono font-semibold text-[var(--text-primary)]">{property.name}</span>
                        <span className="text-[var(--text-muted)]">{property.type ?? "string"}</span>
                      </div>
                      <p className="mt-1 text-[var(--text-secondary)]">
                        {property.required ? "required" : "optional"}
                      </p>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addAiSuggestionToPlan}
                  disabled={!aiSuggestion.event_name || busyAction === "ai-add-event"}
                  className="btn-primary w-full"
                >
                  {busyAction === "ai-add-event" ? "Adding..." : "Add generated event"}
                </button>
              </div>
            ) : aiDuplicates.length > 0 ? (
              <div className="space-y-3">
                {aiDuplicates.map((duplicate, index) => (
                  <div key={`${duplicate.event_a}-${duplicate.event_b}-${index}`} className="rounded-2xl border bg-[var(--surface)] p-3" style={{ borderColor: "var(--border)" }}>
                    <p className="font-mono text-xs font-semibold text-[var(--text-primary)]">
                      {duplicate.event_a} / {duplicate.event_b}
                    </p>
                    <p className="mt-2 text-xs font-medium text-[var(--text-secondary)]">
                      {duplicate.confidence} confidence. {duplicate.reason}
                    </p>
                  </div>
                ))}
              </div>
            ) : aiDuplicateError ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-600">
                {aiDuplicateError}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed p-5 text-center text-sm font-medium text-[var(--text-secondary)]">
                Generate a draft event or run duplicate analysis to see AI output here.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card mb-6">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-[-0.035em] text-[var(--text-primary)]">
              Events
            </h2>
            <p className="mt-1 text-sm font-medium text-[var(--text-secondary)]">
              All edits update the workspace draft revision. If someone else changes the plan first,
              we refresh and ask you to retry on the latest revision.
            </p>
          </div>
          <Link
            href={`/plans/${mainPlanId}/merge-requests`}
            className="btn-secondary flex items-center gap-2 text-xs"
          >
            <GitBranch size={14} />
            Review Merge Requests
          </Link>
        </div>

        <div className="mb-4 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
          <input
            className="input"
            placeholder="Filter events via backend list endpoint..."
            value={eventQuery}
            onChange={(event) => setEventQuery(event.target.value)}
            disabled={!isMounted}
          />
          <div className="text-xs font-semibold text-[var(--text-secondary)]">
            {eventSearchLoading
              ? "Filtering..."
              : eventSearchResults
                ? `${eventSearchResults.length} matched`
                : `${plan.events.length} total`}
          </div>
        </div>

        <div className="space-y-4">
          {visibleEvents.map((event) => (
            <div
              key={event.id}
              className="rounded-[1.5rem] border bg-[var(--surface-2)] p-4"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="grid gap-2 lg:grid-cols-[1fr_160px_150px]">
                    <input
                      className="input font-mono text-sm"
                      defaultValue={event.event_name}
                      disabled={!isMounted || busyAction === `update-event-${event.id}`}
                      onBlur={(inputEvent) => {
                        const nextValue = inputEvent.target.value.trim();
                        if (nextValue && nextValue !== event.event_name) {
                          void updateEvent(event.id, { event_name: nextValue });
                        } else {
                          inputEvent.target.value = event.event_name;
                        }
                      }}
                    />
                    <input
                      className="input text-sm"
                      placeholder="category"
                      defaultValue={event.category ?? ""}
                      disabled={!isMounted || busyAction === `update-event-${event.id}`}
                      onBlur={(inputEvent) => {
                        const nextValue = inputEvent.target.value.trim();
                        const currentValue = event.category ?? "";
                        if (nextValue !== currentValue) {
                          void updateEvent(event.id, { category: nextValue || null });
                        }
                      }}
                    />
                    <select
                      className="input text-sm"
                      value={event.status}
                      disabled={!isMounted || busyAction === `update-event-${event.id}`}
                      onChange={(inputEvent) =>
                        void updateEvent(event.id, { status: inputEvent.target.value })
                      }
                    >
                      {EVENT_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </div>
                  <textarea
                    className="input mt-2 min-h-[76px] resize-y text-sm"
                    placeholder="Describe when this event fires, who owns it, and downstream analytics intent..."
                    defaultValue={event.description ?? ""}
                    disabled={!isMounted || busyAction === `update-event-${event.id}`}
                    onBlur={(inputEvent) => {
                      const nextValue = inputEvent.target.value.trim();
                      const currentValue = event.description ?? "";
                      if (nextValue !== currentValue) {
                        void updateEvent(event.id, { description: nextValue || null });
                      }
                    }}
                  />
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => void toggleComments(event.id)}
                    className="btn-ghost flex items-center gap-1.5 p-2"
                    title="Open comments"
                  >
                    <MessageSquare size={14} />
                    <span className="text-xs">{commentsByEvent[event.id]?.length ?? ""}</span>
                  </button>
                  <button
                    onClick={() => deleteEvent(event.id)}
                    className="btn-ghost p-2 hover:text-red-400"
                    title="Delete event"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {event.properties.map((property) => (
                  <div
                    key={property.id}
                    className="grid gap-2 xl:grid-cols-[1fr_1.2fr_140px_110px_40px]"
                  >
                    <input
                      className="input font-mono text-sm"
                      defaultValue={property.name}
                      disabled={!isMounted || busyAction === `update-property-${property.id}`}
                      onBlur={(inputEvent) => {
                        const nextValue = inputEvent.target.value.trim();
                        if (nextValue && nextValue !== property.name) {
                          void updateProperty(property.id, { name: nextValue });
                        } else {
                          inputEvent.target.value = property.name;
                        }
                      }}
                    />
                    <input
                      className="input text-sm"
                      placeholder="description"
                      defaultValue={property.description ?? ""}
                      disabled={!isMounted || busyAction === `update-property-${property.id}`}
                      onBlur={(inputEvent) => {
                        const nextValue = inputEvent.target.value.trim();
                        const currentValue = property.description ?? "";
                        if (nextValue !== currentValue) {
                          void updateProperty(property.id, { description: nextValue || null });
                        }
                      }}
                    />
                    <select
                      className="input font-mono text-sm"
                      value={property.type}
                      disabled={!isMounted || busyAction === `update-property-${property.id}`}
                      onChange={(inputEvent) =>
                        void updateProperty(property.id, { type: inputEvent.target.value })
                      }
                    >
                      {PROPERTY_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                    <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                      <input
                        type="checkbox"
                        checked={property.required}
                        disabled={!isMounted || busyAction === `update-property-${property.id}`}
                        onChange={(inputEvent) =>
                          void updateProperty(property.id, {
                            required: inputEvent.target.checked,
                          })
                        }
                        className="h-4 w-4 accent-brand-600"
                      />
                      Required
                    </label>
                    <button
                      onClick={() => deleteProperty(property.id)}
                      className="btn-ghost p-2 hover:text-red-400"
                      title="Delete property"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>

              {event.global_properties.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
                    Linked global properties
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {event.global_properties.map((property) => (
                      <button
                        key={property.id}
                        onClick={() => unlinkGlobalProperty(event.id, property.id)}
                        className="rounded-full border bg-[var(--surface)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)] hover:border-red-300 hover:text-red-400"
                        style={{ borderColor: "var(--border)" }}
                        title="Unlink global property"
                      >
                        {property.name} x
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_180px_auto]">
                <input
                  className="input"
                  placeholder="new_property"
                  value={propertyDrafts[event.id] ?? ""}
                  disabled={!isMounted || busyAction === `create-property-${event.id}`}
                  onChange={(inputEvent) =>
                    setPropertyDrafts((current) => ({
                      ...current,
                      [event.id]: inputEvent.target.value,
                    }))
                  }
                />
                <select
                  className="input"
                  defaultValue=""
                  disabled={!isMounted || availableGlobalProperties(event).length === 0}
                  onChange={(inputEvent) => {
                    const nextId = inputEvent.target.value;
                    if (nextId) {
                      void linkGlobalProperty(event.id, nextId);
                      inputEvent.target.value = "";
                    }
                  }}
                >
                  <option value="">Link global property</option>
                  {availableGlobalProperties(event).map((property) => (
                    <option key={property.id} value={property.id}>
                      {property.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => addProperty(event.id)}
                  disabled={
                    !isMounted ||
                    busyAction === `create-property-${event.id}` ||
                    !(propertyDrafts[event.id] ?? "").trim()
                  }
                  className="btn-secondary flex items-center justify-center gap-2"
                >
                  <Plus size={14} />
                  Add property
                </button>
              </div>

              {openComments[event.id] && (
                <div
                  className="mt-4 rounded-[1.5rem] border bg-[var(--surface)] p-4"
                  style={{ borderColor: "var(--border)" }}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <p className="section-label">Event comments</p>
                    <button
                      type="button"
                      className="btn-ghost text-xs"
                      onClick={() => void loadComments(event.id)}
                      disabled={loadingComments[event.id]}
                    >
                      {loadingComments[event.id] ? "Loading..." : "Refresh"}
                    </button>
                  </div>

                  <div className="space-y-3">
                    {loadingComments[event.id] ? (
                      <div className="rounded-2xl border border-dashed p-4 text-sm text-[var(--text-secondary)]">
                        Loading comments...
                      </div>
                    ) : (commentsByEvent[event.id] ?? []).length === 0 ? (
                      <div className="rounded-2xl border border-dashed p-4 text-sm text-[var(--text-secondary)]">
                        No comments yet. Leave the first review note for this event.
                      </div>
                    ) : (
                      (commentsByEvent[event.id] ?? []).map((comment) => (
                        <div key={comment.id} className="flex items-start gap-3 rounded-2xl bg-[var(--surface-2)] p-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-[var(--surface)] text-xs font-medium">
                            {(comment.user_name ?? "U").slice(0, 1).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium text-[var(--text-primary)]">
                                {comment.user_name ?? "Unknown user"}
                              </span>
                              <span className="text-xs text-[var(--text-muted)]">
                                {formatRelative(comment.created_at)}
                              </span>
                            </div>
                            <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[var(--text-secondary)]">
                              {comment.body}
                            </p>
                          </div>
                          <button
                            type="button"
                            className="btn-ghost p-2 hover:text-red-400"
                            onClick={() => void deleteComment(event.id, comment.id)}
                            disabled={busyAction === `delete-comment-${comment.id}`}
                            title="Delete comment"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>

                  <form method="post" onSubmit={(formEvent) => void addComment(formEvent, event.id)} className="mt-3 flex gap-2">
                    <input
                      className="input flex-1"
                      placeholder="Add a review note..."
                      value={commentDrafts[event.id] ?? ""}
                      onChange={(inputEvent) =>
                        setCommentDrafts((current) => ({
                          ...current,
                          [event.id]: inputEvent.target.value,
                        }))
                      }
                      disabled={!isMounted || busyAction === `comment-${event.id}`}
                    />
                    <button
                      type="submit"
                      className="btn-primary"
                      disabled={
                        !isMounted ||
                        busyAction === `comment-${event.id}` ||
                        !commentDrafts[event.id]?.trim()
                      }
                    >
                      Comment
                    </button>
                  </form>
                </div>
              )}
            </div>
          ))}

          {visibleEvents.length === 0 && (
            <div className="rounded-[1.5rem] border border-dashed p-8 text-center font-medium text-[var(--text-secondary)]">
              {eventSearchResults
                ? "No events match this backend filter."
                : "No events yet. Add the first event to start the workspace."}
            </div>
          )}
        </div>

        <form method="post" onSubmit={addEvent} className="mt-4 flex gap-3">
          <input
            className="input flex-1"
            placeholder="event_name"
            value={newEventName}
            onChange={(event) => setNewEventName(event.target.value)}
            disabled={!isMounted || busyAction === "create-event"}
          />
          <button
            type="submit"
            disabled={!isMounted || busyAction === "create-event" || !newEventName.trim()}
            className="btn-primary"
          >
            Add event
          </button>
        </form>
      </div>

      <div className="card">
        <div className="mb-3 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-[-0.035em] text-[var(--text-primary)]">
              Global properties
            </h2>
            <p className="mt-1 text-sm font-medium text-[var(--text-secondary)]">
              Shared schema fragments that can be linked into multiple events.
            </p>
          </div>
          <Link
            href={`/plans/${mainPlanId}/observability`}
            className="btn-secondary flex items-center gap-2 text-xs"
          >
            <AlertTriangle size={14} />
            Open DLQ
          </Link>
        </div>

        <div className="mb-4 space-y-2">
          {plan.global_properties.map((property) => (
            <div
              key={property.id}
              className="grid gap-2 rounded-[1.25rem] border bg-[var(--surface-2)] p-3 lg:grid-cols-[1fr_1.2fr_140px_120px_40px]"
              style={{ borderColor: "var(--border)" }}
            >
              <input
                className="input font-mono text-sm"
                defaultValue={property.name}
                disabled={!isMounted || busyAction === `update-global-property-${property.id}`}
                onBlur={(inputEvent) => {
                  const nextValue = inputEvent.target.value.trim();
                  if (nextValue && nextValue !== property.name) {
                    void updateGlobalProperty(property.id, { name: nextValue });
                  } else {
                    inputEvent.target.value = property.name;
                  }
                }}
              />
              <input
                className="input text-sm"
                placeholder="description"
                defaultValue={property.description ?? ""}
                disabled={!isMounted || busyAction === `update-global-property-${property.id}`}
                onBlur={(inputEvent) => {
                  const nextValue = inputEvent.target.value.trim();
                  const currentValue = property.description ?? "";
                  if (nextValue !== currentValue) {
                    void updateGlobalProperty(property.id, { description: nextValue || null });
                  }
                }}
              />
              <select
                className="input font-mono text-sm"
                value={property.type}
                disabled={!isMounted || busyAction === `update-global-property-${property.id}`}
                onChange={(inputEvent) =>
                  void updateGlobalProperty(property.id, { type: inputEvent.target.value })
                }
              >
                {PROPERTY_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                <input
                  type="checkbox"
                  checked={property.required}
                  disabled={!isMounted || busyAction === `update-global-property-${property.id}`}
                  onChange={(inputEvent) =>
                    void updateGlobalProperty(property.id, { required: inputEvent.target.checked })
                  }
                  className="h-4 w-4 accent-brand-600"
                />
                Required
              </label>
              <button
                onClick={() => deleteGlobalProperty(property.id)}
                className="btn-ghost p-2 hover:text-red-400"
                title="Delete global property"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {plan.global_properties.length === 0 && (
            <p className="text-sm text-[var(--text-secondary)]">
              No global properties yet.
            </p>
          )}
        </div>

        <form method="post" onSubmit={addGlobalProperty} className="grid gap-3 lg:grid-cols-[1fr_180px_auto]">
          <input
            className="input"
            placeholder="device_os"
            value={newGlobalPropertyName}
            onChange={(event) => setNewGlobalPropertyName(event.target.value)}
            disabled={!isMounted || busyAction === "create-global-property"}
          />
          <select
            className="input"
            value={newGlobalPropertyType}
            onChange={(event) => setNewGlobalPropertyType(event.target.value)}
            disabled={!isMounted || busyAction === "create-global-property"}
          >
            {PROPERTY_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={
              !isMounted ||
              busyAction === "create-global-property" ||
              !newGlobalPropertyName.trim()
            }
            className="btn-primary"
          >
            Add global property
          </button>
        </form>
      </div>
    </div>
  );
}
