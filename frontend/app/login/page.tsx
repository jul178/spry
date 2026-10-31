"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "react-oidc-context";
import { ArrowRight, Loader2, LogIn, ShieldCheck, Sparkles, UserCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { COGNITO_GOOGLE_ENABLED, isAuthEnabled } from "@/lib/auth-config";

export default function LoginPage() {
  const auth = isAuthEnabled() ? useAuth() : null;
  const router = useRouter();
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (auth?.isAuthenticated) {
      router.replace("/");
    }
  }, [auth?.isAuthenticated, router]);

  function handleCognitoLogin() {
    if (!auth) {
      router.replace("/");
      return;
    }
    setRedirecting(true);
    auth.signinRedirect().catch((err) => {
      console.error("Sign-in redirect error:", err);
      setRedirecting(false);
    });
  }

  function handleGoogleLogin() {
    if (!auth) {
      router.replace("/");
      return;
    }
    setRedirecting(true);
    auth
      .signinRedirect({
        extraQueryParams: {
          identity_provider: "Google",
        },
      })
      .catch((err) => {
        console.error("Google sign-in redirect error:", err);
        setRedirecting(false);
      });
  }

  function handleDevLogin() {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("spry_dev_user", "demo@spry.local");
      localStorage.setItem("spry_dev_auth", "true");
    }
    router.replace("/");
  }

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center p-4">
      <Card className="w-full shadow-lg border-border/80">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-foreground text-background shadow-md">
            <Sparkles className="size-6 text-background" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">
            Sign in to Spry
          </CardTitle>
          <CardDescription className="text-sm text-muted-foreground mt-1">
            Access your AI-powered meetings, deep-work schedule, and team board
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-3 pt-2">
          {isAuthEnabled() ? (
            <>
              <Button
                type="button"
                size="lg"
                className="w-full font-medium gap-2"
                onClick={handleCognitoLogin}
                disabled={redirecting || auth?.isLoading}
              >
                {redirecting || auth?.isLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <LogIn className="size-4" />
                )}
                {redirecting ? "Redirecting to Cognito..." : "Continue with Amazon Cognito"}
              </Button>

              {COGNITO_GOOGLE_ENABLED && (
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="w-full font-medium gap-2"
                  onClick={handleGoogleLogin}
                  disabled={redirecting || auth?.isLoading}
                >
                  <svg className="size-4" viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="currentColor"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  Continue with Google
                </Button>
              )}

              <div className="relative my-2 text-center text-xs after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t after:border-border">
                <span className="relative z-10 bg-card px-2 text-muted-foreground">
                  or preview locally
                </span>
              </div>
            </>
          ) : null}

          <Button
            type="button"
            variant={isAuthEnabled() ? "secondary" : "default"}
            size="lg"
            className="w-full font-medium gap-2"
            onClick={handleDevLogin}
          >
            <UserCheck className="size-4" />
            Continue as Demo Workspace User
            <ArrowRight className="size-3.5 ml-auto" />
          </Button>
        </CardContent>

        <CardFooter className="flex flex-col gap-2 pt-2 text-center text-xs text-muted-foreground border-t border-border/60">
          <div className="flex items-center justify-center gap-1.5 pt-3">
            <ShieldCheck className="size-3.5 text-muted-foreground" />
            <span>Encrypted with OAuth 2.0 & Cognito User Pools</span>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
