"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Calendar, Clock, DollarSign, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
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
  const [duration, setDuration] = useState(30);
  const [attendees, setAttendees] = useState(4);
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
      toast.success("Meeting logged in PostgreSQL");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Could not create meeting");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteMeeting(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meetings"] });
      toast.success("Meeting deleted");
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

  return (
    <div className="grid gap-8">
      <PageHeader
        icon="📊"
        title="Meetings & Deep-Work Analytics"
        description="First vertical slice from PROJECT.md: log meetings into the PostgreSQL meetings table and compute real-time team cost and focus load."
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
            Could not load meetings from <code>/api/v1/meetings</code>.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5">
                <Calendar className="size-4" /> Total Meetings
              </CardDescription>
              <CardTitle className="text-2xl tabular-nums">
                {data.summary.total_meetings}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5">
                <Clock className="size-4" /> Meeting Hours
              </CardDescription>
              <CardTitle className="text-2xl tabular-nums">
                {data.summary.total_hours}h
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5">
                <DollarSign className="size-4" /> Estimated Cost
              </CardDescription>
              <CardTitle className="text-2xl tabular-nums">
                ${data.summary.total_cost_usd.toFixed(2)}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5">
                <ShieldCheck className="size-4" /> Deep-Work Blocks
              </CardDescription>
              <CardTitle className="text-2xl tabular-nums">
                {data.summary.deep_work_blocks}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Log Meeting or Focus Block</CardTitle>
            <CardDescription>
              Persists to the <code>meetings</code> table via{" "}
              <code>POST /api/v1/meetings</code>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="meeting-title">Title</Label>
                <Input
                  id="meeting-title"
                  placeholder="e.g., Weekly Architecture Sync"
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
                      {cat.replace("_", " ")}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="duration">Min</Label>
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
                  <Label htmlFor="attendees">People</Label>
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
                  <Label htmlFor="rate">$/hr</Label>
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

              <Button type="submit" disabled={createMutation.isPending}>
                <Plus className="mr-1.5 size-4" />
                {createMutation.isPending ? "Saving..." : "Add to Calendar"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Logged Sessions</CardTitle>
            <CardDescription>
              Rows stored in PostgreSQL <code>meetings</code> table
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!data || data.items.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No meetings logged yet. Use the form on the left to add your
                first session.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {data.items.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-4 py-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{m.title}</span>
                        <Badge variant="outline">{m.category}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {m.duration_minutes} min · {m.attendee_count} attendees ·
                        Est. cost ${m.estimated_cost_usd.toFixed(2)}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteMutation.mutate(m.id)}
                      aria-label={`Delete ${m.title}`}
                    >
                      <Trash2 className="size-4 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
