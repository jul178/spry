"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "react-oidc-context";
import { Loader2, LogIn } from "lucide-react";

import { isAuthEnabled } from "@/lib/auth-config";

export default function LoginPage() {
  const auth = useAuth();
  const router = useRouter();
  const authConfigured = isAuthEnabled();

  useEffect(() => {
    if (!authConfigured) {
      return;
    }

    if (auth.isAuthenticated) {
      router.replace("/");
      return;
    }

    if (!auth.isLoading) {
      auth.signinRedirect().catch((err) => {
        console.error("Sign-in redirect error:", err);
      });
    }
  }, [auth, authConfigured, router]);

  if (!authConfigured) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center justify-center rounded-xl border border-border p-8 text-center shadow-sm">
        <h1 className="text-lg font-semibold tracking-tight">Authentication not configured</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Cognito User Pool ID and Client ID are not set. Run <code className="rounded bg-muted px-1.5 py-0.5 text-xs">make deploy-cognito</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center p-6 text-center">
      <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="mx-auto grid size-12 place-items-center rounded-xl bg-accent text-foreground">
          {auth.isLoading ? (
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          ) : (
            <LogIn className="size-6 text-foreground" />
          )}
        </div>
        <h1 className="mt-4 text-lg font-semibold tracking-tight">
          Redirecting to secure login...
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You are being redirected to Amazon Cognito managed sign-in.
        </p>
        <button
          type="button"
          onClick={() => auth.signinRedirect()}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-md bg-foreground px-4 py-2 text-xs font-medium text-background transition hover:bg-foreground/90"
        >
          Click here if not redirected
        </button>
      </div>
    </div>
  );
}
