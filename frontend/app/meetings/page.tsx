"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Calendar,
  Clock,
  DollarSign,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { MeetingAgendaDialog } from "@/components/meeting-agenda-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { api, type MeetingInput, meetingCategories } from "@/lib/api";

export default function MeetingsPage() {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<MeetingInput["category"]>("sync");
  const [duration, setDuration] = useState(45);
  const [attendees, setAttendees] = useState(3);
  const [hourlyRate, setHourlyRate] = useState(65);

  const { data, isPending, isError } = useQuery({
    queryKey: ["meetings"],
    queryFn: () => api.listMeetings(),
  });

  const createMutation = useMutation({
    mutationFn: (payload: MeetingInput) => api.createMeeting(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meetings"] });
      setTitle("");
      toast.success("Meeting added to schedule");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not schedule meeting");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteMeeting(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meetings"] });
      toast.success("Meeting removed");
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    createMutation.mutate({
      title: title.trim(),
      category,
      start_time: new Date().toISOString(),
      duration_minutes: Number(duration),
      attendee_count: Number(attendees),
      hourly_rate_usd: Number(hourlyRate),
    });
  }

  function handleAddSample() {
    createMutation.mutate({
      title: "Weekly Pricing & Product Sync",
      category: "sync",
      start_time: new Date().toISOString(),
      duration_minutes: 45,
      attendee_count: 4,
      hourly_rate_usd: 75,
    });
  }

  return (
    <div className="grid gap-8">
      <PageHeader
        icon="📊"
        title="Meetings & Agenda Intelligence"
        description="Schedule team syncs, compute cost impact, and parse unstructured notes into structured agendas using AI."
      />

      {isPending ? (
        <div className="grid gap-4 sm:grid-cols-4">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
      ) : isError || !data ? (
        <Card>
          <CardContent className="py-6 text-sm text-destructive">
            Unable to load scheduled meetings. Please verify your connection or sign in.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-4">
          <Card className="p-4">
            <CardHeader className="p-0">
              <CardDescription className="text-xs">Scheduled Sessions</CardDescription>
              <CardTitle className="text-2xl font-bold mt-1">
                {data.summary.total_meetings}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 pt-2 text-xs text-muted-foreground flex items-center gap-1.5">
              <Calendar className="size-3.5 text-muted-foreground" />
              <span>Active on team calendar</span>
            </CardContent>
          </Card>

          <Card className="p-4">
            <CardHeader className="p-0">
              <CardDescription className="text-xs">Total Duration</CardDescription>
              <CardTitle className="text-2xl font-bold mt-1">
                {data.summary.total_hours.toFixed(1)} hrs
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 pt-2 text-xs text-muted-foreground flex items-center gap-1.5">
              <Clock className="size-3.5 text-muted-foreground" />
              <span>Time invested by team</span>
            </CardContent>
          </Card>

          <Card className="p-4">
            <CardHeader className="p-0">
              <CardDescription className="text-xs">Estimated Cost</CardDescription>
              <CardTitle className="text-2xl font-bold mt-1">
                ${data.summary.total_cost_usd.toFixed(2)}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 pt-2 text-xs text-muted-foreground flex items-center gap-1.5">
              <DollarSign className="size-3.5 text-muted-foreground" />
              <span>Based on attendee rates</span>
            </CardContent>
          </Card>

          <Card className="p-4">
            <CardHeader className="p-0">
              <CardDescription className="text-xs">Deep-Work Protection</CardDescription>
              <CardTitle className="text-2xl font-bold mt-1 flex items-center gap-2">
                <span>{data.summary.deep_work_blocks}</span>
                {data.summary.overload_warning ? (
                  <Badge variant="destructive" className="text-[10px] py-0 px-1.5">
                    Meeting Overload
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px] py-0 px-1.5 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40">
                    Protected
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 pt-2 text-xs text-muted-foreground flex items-center gap-1.5">
              <ShieldCheck className="size-3.5 text-muted-foreground" />
              <span>{data.summary.overload_warning ? "High sync volume" : "Balanced schedule"}</span>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1 shadow-sm">
          <CardHeader>
            <CardTitle>Schedule Session</CardTitle>
            <CardDescription>
              Add a team sync, review, or reserve deep-work focus time
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="meeting-title">Session Title</Label>
                <Input
                  id="meeting-title"
                  placeholder="e.g., Weekly Pricing & Rates Sync"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="meeting-category">Category</Label>
                <select
                  id="meeting-category"
                  value={category}
                  onChange={(e) =>
                    setCategory(e.target.value as MeetingInput["category"])
                  }
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                >
                  {meetingCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat.replace("_", " ").toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="duration" className="text-xs">Duration (min)</Label>
                  <Input
                    id="duration"
                    type="number"
                    min={5}
                    max={480}
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="attendees" className="text-xs">Attendees</Label>
                  <Input
                    id="attendees"
                    type="number"
                    min={1}
                    max={200}
                    value={attendees}
                    onChange={(e) => setAttendees(Number(e.target.value))}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="rate" className="text-xs">Hourly rate ($)</Label>
                  <Input
                    id="rate"
                    type="number"
                    min={0}
                    max={1000}
                    value={hourlyRate}
                    onChange={(e) => setHourlyRate(Number(e.target.value))}
                  />
                </div>
              </div>

              <Button type="submit" disabled={createMutation.isPending} className="w-full mt-1">
                <Plus className="mr-1.5 size-4" />
                {createMutation.isPending ? "Scheduling..." : "Add to Schedule"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Scheduled Sessions & Agendas</CardTitle>
              <CardDescription>
                Review meetings, edit agendas, and parse unstructured notes with Claude AI
              </CardDescription>
            </div>
            {(!data || data.items.length === 0) && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddSample}
                disabled={createMutation.isPending}
                className="gap-1.5"
              >
                <Plus className="size-3.5" />
                Add Sample
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {!data || data.items.length === 0 ? (
              <div className="py-12 text-center">
                <div className="mx-auto mb-3 grid size-10 place-items-center rounded-xl bg-accent text-foreground">
                  <Calendar className="size-5 text-muted-foreground" />
                </div>
                <h3 className="font-semibold text-sm">No sessions scheduled yet</h3>
                <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
                  Create a new session using the form on the left or add a sample session to test the AI agenda parser.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAddSample}
                  className="mt-4 gap-1.5"
                >
                  <Sparkles className="size-3.5 text-primary" />
                  Add Sample Session to Try AI
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {data.items.map((m) => {
                  const agendaItemsCount = Array.isArray(m.agenda?.items) ? m.agenda.items.length : 0;
                  const actionItemsCount = Array.isArray(m.agenda?.action_items) ? m.agenda.action_items.length : 0;
                  const hasAgenda = Boolean(m.agenda && (agendaItemsCount > 0 || m.agenda?.title));

                  return (
                    <div
                      key={m.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-4"
                    >
                      <div className="grid gap-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">{m.title}</span>
                          <Badge variant="outline" className="text-xs uppercase tracking-wide">
                            {m.category.replace("_", " ")}
                          </Badge>
                          {hasAgenda && (
                            <Badge variant="secondary" className="text-[11px] gap-1 bg-primary/10 text-primary hover:bg-primary/15 border-primary/20">
                              <Sparkles className="size-2.5" />
                              {agendaItemsCount} topics · {actionItemsCount} actions
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {m.duration_minutes} min · {m.attendee_count} attendees · Est. cost ${m.estimated_cost_usd.toFixed(2)}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 self-start sm:self-auto">
                        <MeetingAgendaDialog
                          meeting={m}
                          onSaved={() =>
                            queryClient.invalidateQueries({
                              queryKey: ["meetings"],
                            })
                          }
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteMutation.mutate(m.id)}
                          aria-label={`Delete ${m.title}`}
                          className="h-8 w-8 p-0"
                        >
                          <Trash2 className="size-4 text-muted-foreground hover:text-destructive transition-colors" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
