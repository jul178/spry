"use client";

import { useMutation } from "@tanstack/react-query";
import { LoaderCircle, Plus, Sparkles, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, type Meeting, type ParsedAgenda } from "@/lib/api";

type Props = {
  meeting: Meeting;
  onSaved: () => void;
};

const blankAgenda = (): ParsedAgenda => ({
  title: null,
  starts_at: null,
  duration_minutes: null,
  items: [],
  action_items: [],
  language: "en",
});

function toLocalInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function Suggested({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <Badge
      variant="secondary"
      className="ml-1.5 inline-flex items-center gap-1 px-1.5 py-0 text-[10px] font-normal text-muted-foreground bg-muted hover:bg-muted"
    >
      <Sparkles className="size-2.5 text-primary" />
      suggested
    </Badge>
  );
}

function removeRowSuggestions(
  current: Set<string>,
  group: "items" | "action_items",
  index: number,
) {
  const next = new Set<string>();
  for (const key of current) {
    const match = key.match(new RegExp(`^${group}\\.(\\d+)\\.(.+)$`));
    if (!match) {
      next.add(key);
      continue;
    }
    const rowIndex = Number(match[1]);
    if (rowIndex < index) next.add(key);
    else if (rowIndex > index) next.add(`${group}.${rowIndex - 1}.${match[2]}`);
  }
  return next;
}

export function MeetingAgendaDialog({ meeting, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const [pastedText, setPastedText] = useState("");
  const [agenda, setAgenda] = useState<ParsedAgenda>(blankAgenda);
  const [suggested, setSuggested] = useState<Set<string>>(new Set());
  const [parseError, setParseError] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [parseMetadata, setParseMetadata] = useState<{
    model: string;
    prompt_version: string;
    agenda: ParsedAgenda;
  } | null>(null);
  const parseController = useRef<AbortController | null>(null);

  const saveMutation = useMutation({
    mutationFn: () => {
      const cleanAgenda: ParsedAgenda = {
        ...agenda,
        title: agenda.title?.trim() || null,
        starts_at: agenda.starts_at || null,
        items: agenda.items
          .filter((item) => item.topic.trim())
          .map((item) => ({
            ...item,
            topic: item.topic.trim(),
            owner: item.owner?.trim() || null,
          })),
        action_items: agenda.action_items
          .filter((item) => item.task.trim())
          .map((item) => ({
            ...item,
            task: item.task.trim(),
            owner: item.owner?.trim() || null,
          })),
      };
      const aiSuggestion = parseMetadata;
      return api.saveMeetingAgenda(meeting.id, cleanAgenda, aiSuggestion);
    },
    onSuccess: () => {
      toast.success("Agenda saved successfully");
      onSaved();
      setOpen(false);
    },
    onError: (error: Error) =>
      toast.error(error.message || "Could not save agenda"),
  });

  function openDialog() {
    parseController.current?.abort();
    setIsParsing(false);
    setAgenda(
      meeting.agenda
        ? ({ ...blankAgenda(), ...meeting.agenda } as ParsedAgenda)
        : blankAgenda(),
    );
    setPastedText("");
    setSuggested(new Set());
    setParseError("");
    setParseMetadata(null);
    setOpen(true);
  }

  async function parseText() {
    if (!pastedText.trim()) return;
    parseController.current?.abort();
    const controller = new AbortController();
    parseController.current = controller;
    setIsParsing(true);
    setParseError("");
    try {
      const result = await api.parseAgenda(pastedText, controller.signal);
      const parsed = result.agenda;
      setAgenda(parsed);
      setParseMetadata({
        model: result.model,
        prompt_version: result.prompt_version,
        agenda: parsed,
      });
      const fields = new Set<string>();
      if (parsed.title) fields.add("title");
      if (parsed.starts_at) fields.add("starts_at");
      if (parsed.duration_minutes != null) fields.add("duration_minutes");
      parsed.items.forEach((item, index) => {
        if (item.topic) fields.add(`items.${index}.topic`);
        if (item.owner) fields.add(`items.${index}.owner`);
        if (item.minutes != null) fields.add(`items.${index}.minutes`);
      });
      parsed.action_items.forEach((item, index) => {
        if (item.task) fields.add(`action_items.${index}.task`);
        if (item.owner) fields.add(`action_items.${index}.owner`);
        if (item.due) fields.add(`action_items.${index}.due`);
      });
      setSuggested(fields);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setParseError(
        error instanceof Error ? error.message : "Agenda parsing failed.",
      );
    } finally {
      if (parseController.current === controller)
        parseController.current = null;
      setIsParsing(false);
    }
  }

  function updateField<K extends "title" | "starts_at" | "duration_minutes">(
    key: K,
    value: ParsedAgenda[K],
  ) {
    setAgenda((current) => ({ ...current, [key]: value }));
    setSuggested((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
  }

  function closeDialog(nextOpen: boolean) {
    if (!nextOpen) parseController.current?.abort();
    setOpen(nextOpen);
  }

  const hasAgendaContent = Boolean(
    agenda.title?.trim() ||
    agenda.starts_at ||
    agenda.duration_minutes ||
    agenda.items.some((item) => item.topic.trim()) ||
    agenda.action_items.some((item) => item.task.trim()),
  );

  return (
    <Dialog open={open} onOpenChange={closeDialog}>
      <Button variant="outline" size="sm" onClick={openDialog}>
        <Sparkles className="mr-1.5 size-4 text-primary" />
        {meeting.agenda ? "Edit agenda" : "Add agenda"}
      </Button>
      <DialogContent className="max-h-[92vh] w-[95vw] sm:max-w-3xl md:max-w-4xl lg:max-w-5xl overflow-hidden flex flex-col p-5 sm:p-6">
        <DialogHeader className="shrink-0 pb-2 border-b border-border">
          <DialogTitle className="text-base sm:text-lg">
            Agenda · {meeting.title}
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            Paste meeting notes or long transcripts to generate a structured
            agenda, review and adjust fields, and save.
          </DialogDescription>
        </DialogHeader>

        {/* Responsive 2-column layout on md+ screens */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 flex-1 overflow-y-auto overflow-x-hidden pt-3 pr-1">
          {/* Left Column: Source Notes (wider for large text) */}
          <section className="md:col-span-5 flex flex-col gap-2 md:border-r md:border-border md:pr-4">
            <div className="flex items-center justify-between">
              <Label
                htmlFor={`agenda-source-${meeting.id}`}
                className="text-xs font-semibold text-foreground flex items-center gap-1.5"
              >
                <span>Raw notes or transcript</span>
              </Label>
              <span className="text-[11px] text-muted-foreground">
                {pastedText.length.toLocaleString()} / 10,000 chars
              </span>
            </div>

            <Textarea
              id={`agenda-source-${meeting.id}`}
              value={pastedText}
              onChange={(event) => setPastedText(event.target.value)}
              placeholder="Paste email threads, calendar invites, transcripts, Slack/Teams messages, or rough notes (large text supported)…"
              disabled={isParsing}
              className="w-full flex-1 min-h-[180px] md:min-h-[320px] resize-y text-xs sm:text-sm leading-relaxed"
            />

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              {isParsing ? (
                <div className="flex items-center gap-2">
                  <span
                    className="flex items-center gap-2 text-xs text-muted-foreground"
                    role="status"
                  >
                    <LoaderCircle className="size-4 animate-spin text-primary" />{" "}
                    Parsing agenda with AI…
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => parseController.current?.abort()}
                  >
                    <X className="mr-1 size-3" /> Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  variant="default"
                  size="sm"
                  onClick={parseText}
                  disabled={!pastedText.trim()}
                  className="h-8 text-xs font-medium"
                >
                  <Sparkles className="mr-1.5 size-3.5" /> Parse agenda
                </Button>
              )}

              {pastedText && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPastedText("")}
                  className="h-7 text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear notes
                </Button>
              )}
            </div>

            {parseError && (
              <p
                className="rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive mt-1"
                role="alert"
              >
                {parseError}
              </p>
            )}

            <div className="mt-auto hidden md:block pt-3 text-[11px] text-muted-foreground bg-muted/40 p-2.5 rounded-md">
              💡 <strong>Tip:</strong> The AI extracts title, time, duration,
              discussion topics, owners, and action items. You can refine any field on the right.
            </div>
          </section>

          {/* Right Column: Structured Agenda Review */}
          <section className="md:col-span-7 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">
                Review structured agenda
              </h3>
              {parseMetadata?.model && (
                <Badge
                  variant="outline"
                  className="text-[11px] font-normal text-muted-foreground"
                >
                  Model: {parseMetadata.model.replace(/^.*\//, "")}
                </Badge>
              )}
            </div>

            {/* Meeting Title */}
            <div className="grid gap-1.5">
              <Label
                htmlFor="agenda-title"
                className="text-xs font-medium text-muted-foreground flex items-center"
              >
                Meeting title
                <Suggested active={suggested.has("title")} />
              </Label>
              <Input
                id="agenda-title"
                placeholder="e.g. Sprint Planning & Architecture Review"
                value={agenda.title ?? ""}
                onChange={(event) =>
                  updateField("title", event.target.value || null)
                }
                className="w-full text-xs sm:text-sm"
              />
            </div>

            {/* Starts At & Duration (50/50 split) */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5 min-w-0">
                <Label
                  htmlFor="agenda-start"
                  className="text-xs font-medium text-muted-foreground flex items-center"
                >
                  Starts at
                  <Suggested active={suggested.has("starts_at")} />
                </Label>
                <Input
                  id="agenda-start"
                  type="datetime-local"
                  value={toLocalInput(agenda.starts_at)}
                  onChange={(event) =>
                    updateField(
                      "starts_at",
                      event.target.value
                        ? new Date(event.target.value).toISOString()
                        : null,
                    )
                  }
                  className="w-full min-w-0 text-xs sm:text-sm"
                />
              </div>
              <div className="grid gap-1.5 min-w-0">
                <Label
                  htmlFor="agenda-duration"
                  className="text-xs font-medium text-muted-foreground flex items-center"
                >
                  Duration (minutes)
                  <Suggested active={suggested.has("duration_minutes")} />
                </Label>
                <Input
                  id="agenda-duration"
                  type="number"
                  min={1}
                  max={600}
                  placeholder="e.g. 45"
                  value={agenda.duration_minutes ?? ""}
                  onChange={(event) =>
                    updateField(
                      "duration_minutes",
                      event.target.value ? Number(event.target.value) : null,
                    )
                  }
                  className="w-full min-w-0 text-xs sm:text-sm"
                />
              </div>
            </div>

            {/* Topics List */}
            <div className="grid gap-3 pt-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h4 className="text-xs sm:text-sm font-semibold">
                    Discussion topics
                  </h4>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground font-mono">
                    {agenda.items.length}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() =>
                    setAgenda((current) => ({
                      ...current,
                      items: [
                        ...current.items,
                        { topic: "", owner: null, minutes: null },
                      ],
                    }))
                  }
                >
                  <Plus className="mr-1 size-3.5" /> Add topic
                </Button>
              </div>

              {agenda.items.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border/80 p-3 text-center text-xs text-muted-foreground">
                  No discussion topics yet. Click &quot;Add topic&quot; or parse notes.
                </p>
              ) : (
                agenda.items.map((item, index) => (
                  <div
                    className="rounded-lg border border-border/80 bg-muted/20 p-3 space-y-2.5 transition-colors hover:border-border"
                    key={`topic-${index}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0 space-y-1">
                        <Label
                          htmlFor={`topic-${index}`}
                          className="text-xs font-medium text-muted-foreground flex items-center"
                        >
                          Topic
                          <Suggested
                            active={suggested.has(`items.${index}.topic`)}
                          />
                        </Label>
                        <Input
                          id={`topic-${index}`}
                          placeholder="e.g. Discuss Q4 roadmap and priorities"
                          value={item.topic}
                          onChange={(event) => {
                            const items = [...agenda.items];
                            items[index] = { ...item, topic: event.target.value };
                            setAgenda({ ...agenda, items });
                            setSuggested((current) => {
                              const next = new Set(current);
                              next.delete(`items.${index}.topic`);
                              return next;
                            });
                          }}
                          className="w-full text-xs sm:text-sm"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="mt-6 text-muted-foreground hover:text-destructive shrink-0"
                        aria-label="Remove topic"
                        onClick={() => {
                          setAgenda({
                            ...agenda,
                            items: agenda.items.filter((_, i) => i !== index),
                          });
                          setSuggested((current) =>
                            removeRowSuggestions(current, "items", index),
                          );
                        }}
                      >
                        <X className="size-4" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      <div className="space-y-1 min-w-0">
                        <Label
                          htmlFor={`owner-${index}`}
                          className="text-xs font-medium text-muted-foreground flex items-center"
                        >
                          Owner
                          <Suggested
                            active={suggested.has(`items.${index}.owner`)}
                          />
                        </Label>
                        <Input
                          id={`owner-${index}`}
                          placeholder="e.g. Taras"
                          value={item.owner ?? ""}
                          onChange={(event) => {
                            const items = [...agenda.items];
                            items[index] = {
                              ...item,
                              owner: event.target.value || null,
                            };
                            setAgenda({ ...agenda, items });
                            setSuggested((current) => {
                              const next = new Set(current);
                              next.delete(`items.${index}.owner`);
                              return next;
                            });
                          }}
                          className="w-full text-xs sm:text-sm"
                        />
                      </div>
                      <div className="space-y-1 min-w-0">
                        <Label
                          htmlFor={`minutes-${index}`}
                          className="text-xs font-medium text-muted-foreground flex items-center"
                        >
                          Duration (min)
                          <Suggested
                            active={suggested.has(`items.${index}.minutes`)}
                          />
                        </Label>
                        <Input
                          id={`minutes-${index}`}
                          type="number"
                          min={1}
                          max={480}
                          placeholder="e.g. 15"
                          value={item.minutes ?? ""}
                          onChange={(event) => {
                            const items = [...agenda.items];
                            items[index] = {
                              ...item,
                              minutes: event.target.value
                                ? Number(event.target.value)
                                : null,
                            };
                            setAgenda({ ...agenda, items });
                            setSuggested((current) => {
                              const next = new Set(current);
                              next.delete(`items.${index}.minutes`);
                              return next;
                            });
                          }}
                          className="w-full text-xs sm:text-sm"
                        />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Action Items List */}
            <div className="grid gap-3 pt-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h4 className="text-xs sm:text-sm font-semibold">
                    Action items
                  </h4>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground font-mono">
                    {agenda.action_items.length}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() =>
                    setAgenda((current) => ({
                      ...current,
                      action_items: [
                        ...current.action_items,
                        { task: "", owner: null, due: null },
                      ],
                    }))
                  }
                >
                  <Plus className="mr-1 size-3.5" /> Add action
                </Button>
              </div>

              {agenda.action_items.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border/80 p-3 text-center text-xs text-muted-foreground">
                  No action items yet. Click &quot;Add action&quot; to assign tasks.
                </p>
              ) : (
                agenda.action_items.map((item, index) => (
                  <div
                    className="rounded-lg border border-border/80 bg-muted/20 p-3 space-y-2.5 transition-colors hover:border-border"
                    key={`action-${index}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0 space-y-1">
                        <Label
                          htmlFor={`task-${index}`}
                          className="text-xs font-medium text-muted-foreground flex items-center"
                        >
                          Action task
                          <Suggested
                            active={suggested.has(`action_items.${index}.task`)}
                          />
                        </Label>
                        <Input
                          id={`task-${index}`}
                          placeholder="e.g. Send architecture diagram to client"
                          value={item.task}
                          onChange={(event) => {
                            const items = [...agenda.action_items];
                            items[index] = { ...item, task: event.target.value };
                            setAgenda({ ...agenda, action_items: items });
                            setSuggested((current) => {
                              const next = new Set(current);
                              next.delete(`action_items.${index}.task`);
                              return next;
                            });
                          }}
                          className="w-full text-xs sm:text-sm"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="mt-6 text-muted-foreground hover:text-destructive shrink-0"
                        aria-label="Remove action item"
                        onClick={() => {
                          setAgenda({
                            ...agenda,
                            action_items: agenda.action_items.filter(
                              (_, i) => i !== index,
                            ),
                          });
                          setSuggested((current) =>
                            removeRowSuggestions(current, "action_items", index),
                          );
                        }}
                      >
                        <X className="size-4" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      <div className="space-y-1 min-w-0">
                        <Label
                          htmlFor={`action-owner-${index}`}
                          className="text-xs font-medium text-muted-foreground flex items-center"
                        >
                          Assignee
                          <Suggested
                            active={suggested.has(`action_items.${index}.owner`)}
                          />
                        </Label>
                        <Input
                          id={`action-owner-${index}`}
                          placeholder="e.g. Taras"
                          value={item.owner ?? ""}
                          onChange={(event) => {
                            const items = [...agenda.action_items];
                            items[index] = {
                              ...item,
                              owner: event.target.value || null,
                            };
                            setAgenda({ ...agenda, action_items: items });
                            setSuggested((current) => {
                              const next = new Set(current);
                              next.delete(`action_items.${index}.owner`);
                              return next;
                            });
                          }}
                          className="w-full text-xs sm:text-sm"
                        />
                      </div>
                      <div className="space-y-1 min-w-0">
                        <Label
                          htmlFor={`due-${index}`}
                          className="text-xs font-medium text-muted-foreground flex items-center"
                        >
                          Due date
                          <Suggested
                            active={suggested.has(`action_items.${index}.due`)}
                          />
                        </Label>
                        <Input
                          id={`due-${index}`}
                          type="date"
                          value={item.due ?? ""}
                          onChange={(event) => {
                            const items = [...agenda.action_items];
                            items[index] = {
                              ...item,
                              due: event.target.value || null,
                            };
                            setAgenda({ ...agenda, action_items: items });
                            setSuggested((current) => {
                              const next = new Set(current);
                              next.delete(`action_items.${index}.due`);
                              return next;
                            });
                          }}
                          className="w-full min-w-0 text-xs sm:text-sm"
                        />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        <DialogFooter className="shrink-0 mt-3 pt-2 border-t border-border flex-row justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => closeDialog(false)}>
            Close
          </Button>
          <Button
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !hasAgendaContent}
          >
            {saveMutation.isPending ? "Saving…" : "Save agenda"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
