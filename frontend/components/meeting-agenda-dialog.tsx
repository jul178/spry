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
  return active ? (
    <Badge variant="secondary" className="ml-2 align-middle">
      suggested
    </Badge>
  ) : null;
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
      toast.success("Agenda saved");
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
        <Sparkles className="mr-1 size-4" />{" "}
        {meeting.agenda ? "Edit agenda" : "Add agenda"}
      </Button>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Agenda · {meeting.title}</DialogTitle>
          <DialogDescription>
            Paste notes for a suggested agenda, review every field, then save it
            to this meeting.
          </DialogDescription>
        </DialogHeader>

        <section className="grid gap-2">
          <Label htmlFor={`agenda-source-${meeting.id}`}>Paste an agenda</Label>
          <Textarea
            id={`agenda-source-${meeting.id}`}
            value={pastedText}
            onChange={(event) => setPastedText(event.target.value)}
            placeholder="Paste an email, team message, or meeting notes…"
            rows={5}
            disabled={isParsing}
          />
          <div className="flex flex-wrap items-center gap-2">
            {isParsing ? (
              <>
                <span
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                  role="status"
                >
                  <LoaderCircle className="size-4 animate-spin" /> Parsing your
                  agenda…
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => parseController.current?.abort()}
                >
                  <X className="mr-1 size-4" /> Cancel
                </Button>
              </>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={parseText}
                disabled={!pastedText.trim()}
              >
                <Sparkles className="mr-1 size-4" /> Parse agenda
              </Button>
            )}
            <span className="text-xs text-muted-foreground">
              {pastedText.length.toLocaleString()} / 10,000
            </span>
          </div>
          {parseError && (
            <p className="text-sm text-destructive" role="alert">
              {parseError}
            </p>
          )}
        </section>

        <section className="grid gap-4 border-t border-border pt-4">
          <h3 className="font-medium">Review agenda details</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-1.5 sm:col-span-3">
              <Label htmlFor="agenda-title">
                Title
                <Suggested active={suggested.has("title")} />
              </Label>
              <Input
                id="agenda-title"
                value={agenda.title ?? ""}
                onChange={(event) =>
                  updateField("title", event.target.value || null)
                }
              />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="agenda-start">
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
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="agenda-duration">
                Duration in minutes
                <Suggested active={suggested.has("duration_minutes")} />
              </Label>
              <Input
                id="agenda-duration"
                type="number"
                min={1}
                max={600}
                value={agenda.duration_minutes ?? ""}
                onChange={(event) =>
                  updateField(
                    "duration_minutes",
                    event.target.value ? Number(event.target.value) : null,
                  )
                }
              />
            </div>
          </div>

          <div className="grid gap-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">Topics</h4>
              <Button
                type="button"
                variant="ghost"
                size="sm"
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
                <Plus className="mr-1 size-4" /> Add topic
              </Button>
            </div>
            {agenda.items.map((item, index) => (
              <div
                className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1fr_1fr_7rem_auto]"
                key={`topic-${index}`}
              >
                <div className="grid gap-1">
                  <Label htmlFor={`topic-${index}`}>
                    Topic
                    <Suggested active={suggested.has(`items.${index}.topic`)} />
                  </Label>
                  <Input
                    id={`topic-${index}`}
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
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor={`owner-${index}`}>
                    Owner
                    <Suggested active={suggested.has(`items.${index}.owner`)} />
                  </Label>
                  <Input
                    id={`owner-${index}`}
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
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor={`minutes-${index}`}>
                    Minutes
                    <Suggested
                      active={suggested.has(`items.${index}.minutes`)}
                    />
                  </Label>
                  <Input
                    id={`minutes-${index}`}
                    type="number"
                    min={1}
                    max={480}
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
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
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
            ))}
          </div>

          <div className="grid gap-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">Action items</h4>
              <Button
                type="button"
                variant="ghost"
                size="sm"
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
                <Plus className="mr-1 size-4" /> Add action
              </Button>
            </div>
            {agenda.action_items.map((item, index) => (
              <div
                className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1fr_1fr_9rem_auto]"
                key={`action-${index}`}
              >
                <div className="grid gap-1">
                  <Label htmlFor={`task-${index}`}>
                    Task
                    <Suggested
                      active={suggested.has(`action_items.${index}.task`)}
                    />
                  </Label>
                  <Input
                    id={`task-${index}`}
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
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor={`action-owner-${index}`}>
                    Owner
                    <Suggested
                      active={suggested.has(`action_items.${index}.owner`)}
                    />
                  </Label>
                  <Input
                    id={`action-owner-${index}`}
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
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor={`due-${index}`}>
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
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
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
            ))}
          </div>
        </section>

        <DialogFooter>
          <Button variant="outline" onClick={() => closeDialog(false)}>
            Close
          </Button>
          <Button
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
