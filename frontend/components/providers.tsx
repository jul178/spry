"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AuthProvider, AuthProviderNoUserManagerProps } from "react-oidc-context";

import { isAuthEnabled, oidcConfig } from "@/lib/auth-config";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 10_000 },
        },
      }),
  );

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isAuthEnabled()) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  }

  const clientOidcConfig: AuthProviderNoUserManagerProps = {
    ...oidcConfig,
    redirect_uri:
      mounted && typeof window !== "undefined"
        ? `${window.location.origin}/auth/callback/`
        : oidcConfig.redirect_uri,
  };

  return (
    <AuthProvider {...clientOidcConfig}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </AuthProvider>
  );
}
