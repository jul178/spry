import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { HealthBadge } from "@/components/health-badge";
import { ItemSummary } from "@/components/item-summary";
import { PageHeader } from "@/components/page-header";
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
    <div className="grid gap-10">
      <PageHeader
        icon="⚡"
        title="Spry Dashboard"
        description="Real-time workspace analytics and team workflow overview."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>API & Database Readiness</CardTitle>
            <CardDescription>
              Readiness of the FastAPI backend and PostgreSQL database
            </CardDescription>
            <CardAction>
              <HealthBadge />
            </CardAction>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm text-muted-foreground">
            <p>
              Polled every 15 seconds from <code>/api/v1/health/ready</code>.
            </p>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="justify-self-start"
            >
              <Link href="/meetings">
                Open Meetings Analytics
                <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tasks Board</CardTitle>
            <CardDescription>Cards on the board, by status</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <ItemSummary />
            <Button
              asChild
              variant="outline"
              size="lg"
              className="justify-self-start"
            >
              <Link href="/items">
                Open board
                <ArrowRight data-icon="inline-end" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
