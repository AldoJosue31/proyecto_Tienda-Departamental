import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { QueryProvider } from "@/components/query-provider";
import { getCurrentUser } from "@/lib/auth/session.server";

export default async function PlatformLayout({ children }: { children: ReactNode }) {
  let user = null;
  try {
    user = await getCurrentUser();
  } catch {
    // The catalog remains usable if identity is temporarily unavailable.
  }

  // A new identity gets a fresh cache, including private orders and coupons.
  return <QueryProvider key={user?.id ?? "guest"}><AppShell user={user}>{children}</AppShell></QueryProvider>;
}
