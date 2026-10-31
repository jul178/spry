import Link from "next/link";
import { ArrowRight, Brain, Calendar, CheckCircle2, Clock, Sparkles } from "lucide-react";

import { HealthBadge } from "@/components/health-badge";
import { ItemSummary } from "@/components/item-summary";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function DashboardPage() {
  return (
    <div className="grid gap-8">
      <PageHeader
        icon="⚡"
        title="Spry Workspace"
        description="AI-powered meeting agenda parsing, deep-work protection, and team productivity analytics."
      />

      {/* Top Value Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">AI Agenda Parser</span>
            <Badge variant="secondary" className="gap-1">
              <Sparkles className="size-3 text-primary" /> Active
            </Badge>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold tracking-tight">Bedrock AI</div>
            <p className="text-xs text-muted-foreground mt-0.5">Parse unstructured notes</p>
          </div>
        </Card>

        <Card className="p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Focus Protection</span>
            <Brain className="size-4 text-muted-foreground" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold tracking-tight">Deep Work</div>
            <p className="text-xs text-muted-foreground mt-0.5">Automated sync defense</p>
          </div>
        </Card>

        <Card className="p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Team Meetings</span>
            <Calendar className="size-4 text-muted-foreground" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold tracking-tight">Cost Analytics</div>
            <p className="text-xs text-muted-foreground mt-0.5">Track time & $/hr impact</p>
          </div>
        </Card>

        <Card className="p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">System Status</span>
            <HealthBadge />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold tracking-tight">Operational</div>
            <p className="text-xs text-muted-foreground mt-0.5">Cloud services online</p>
          </div>
        </Card>
      </div>

      {/* Main Interactive Feature Cards */}
      <div className="grid gap-6 sm:grid-cols-2">
        <Card className="flex flex-col justify-between shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2 mb-1">
              <div className="grid size-8 place-items-center rounded-lg bg-accent text-foreground">
                <Sparkles className="size-4" />
              </div>
              <Badge variant="outline">Smart Agendas</Badge>
            </div>
            <CardTitle className="text-xl">Meetings & Agenda Intelligence</CardTitle>
            <CardDescription className="text-sm">
              Paste raw emails, chat messages, or team notes. Spry parses the schedule, extracts key discussion topics, assigns action item owners, and computes time cost.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 pt-0">
            <div className="rounded-lg bg-accent/40 p-3 text-xs text-muted-foreground border border-border/50">
              <span className="font-semibold text-foreground">Tip:</span> Try clicking <strong>&quot;Add agenda&quot;</strong> on any meeting to paste unstructured Ukrainian or English notes!
            </div>
            <Button
              asChild
              size="lg"
              className="w-full sm:w-auto self-start font-medium"
            >
              <Link href="/meetings">
                Open Meetings & Agendas
                <ArrowRight className="size-4 ml-1.5" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="flex flex-col justify-between shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2 mb-1">
              <div className="grid size-8 place-items-center rounded-lg bg-accent text-foreground">
                <CheckCircle2 className="size-4" />
              </div>
              <Badge variant="outline">Workflow</Badge>
            </div>
            <CardTitle className="text-xl">Project Tasks Board</CardTitle>
            <CardDescription className="text-sm">
              View and organize deliverable cards across your team&apos;s Kanban workflow columns.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 pt-0">
            <ItemSummary />
            <Button
              asChild
              variant="outline"
              size="lg"
              className="w-full sm:w-auto self-start font-medium"
            >
              <Link href="/items">
                Open Tasks Board
                <ArrowRight className="size-4 ml-1.5" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
