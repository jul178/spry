"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "react-oidc-context";
import { LogIn, LogOut, User as UserIcon } from "lucide-react";

import { isAuthEnabled, signOut } from "@/lib/auth-config";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/meetings", label: "Meetings" },
  { href: "/items", label: "Board" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const auth = useAuth();
  const authActive = isAuthEnabled();

  const userEmail = auth?.user?.profile?.email || auth?.user?.profile?.preferred_username;

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-6 sm:px-8">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2">
            <span
              aria-hidden
              className="grid size-6 place-items-center rounded-md bg-foreground font-heading text-[13px] leading-none font-semibold text-background"
            >
              S
            </span>
            <span className="font-heading text-sm font-semibold tracking-tight">
              Spry
            </span>
          </Link>

          <nav className="flex items-center gap-1 text-sm">
            {links.map((link) => {
              const active =
                link.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "rounded-md px-2.5 py-1.5 font-medium transition-colors",
                    active
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Authentication status and actions */}
        <div className="flex items-center gap-3">
          {authActive && (
            <>
              {auth.isLoading ? (
                <span className="text-xs text-muted-foreground animate-pulse">
                  Checking session...
                </span>
              ) : auth.isAuthenticated && auth.user ? (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 rounded-full border border-border/60 bg-accent/40 px-3 py-1 text-xs font-medium text-foreground">
                    <UserIcon className="size-3.5 text-muted-foreground" />
                    <span className="max-w-[200px] truncate sm:max-w-[280px]">
                      {userEmail}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      auth.removeUser();
                      signOut();
                    }}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border/80 px-2.5 py-1 text-xs font-medium text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
                  >
                    <LogOut className="size-3" />
                    Sign out
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Link
                    href="/login/"
                    className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background transition hover:bg-foreground/90 shadow-sm"
                  >
                    <LogIn className="size-3" />
                    Sign in
                  </Link>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </header>
  );
}
