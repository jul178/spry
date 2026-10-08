"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "react-oidc-context";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

export default function CallbackPage() {
  const auth = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (auth.isAuthenticated) {
      const timer = setTimeout(() => {
        router.replace("/");
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [auth.isAuthenticated, router]);

  if (auth.error) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center p-6 text-center">
        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-8 shadow-sm">
          <AlertCircle className="mx-auto size-10 text-destructive" />
          <h1 className="mt-4 text-lg font-semibold tracking-tight text-destructive">
            Authentication Error
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {auth.error.message || "Failed to complete authentication with Cognito."}
          </p>
          <a
            href="/login/"
            className="mt-6 inline-flex items-center justify-center rounded-md bg-foreground px-4 py-2 text-xs font-medium text-background transition hover:bg-foreground/90"
          >
            Try again
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center p-6 text-center">
      <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
        {auth.isAuthenticated ? (
          <>
            <CheckCircle2 className="mx-auto size-10 text-emerald-600" />
            <h1 className="mt-4 text-lg font-semibold tracking-tight">
              Signed in successfully!
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Returning to dashboard...
            </p>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto size-10 animate-spin text-muted-foreground" />
            <h1 className="mt-4 text-lg font-semibold tracking-tight">
              Completing sign in...
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Exchanging authorization code for secure credentials.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
