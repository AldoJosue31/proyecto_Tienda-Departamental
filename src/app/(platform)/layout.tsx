import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { getCurrentUser } from "@/lib/auth/session.server";

export default async function PlatformLayout({ children }: { children: ReactNode }) {
  let user = null;
  try {
    user = await getCurrentUser();
  } catch {
    // The catalog remains usable if identity is temporarily unavailable.
  }

  return <AppShell user={user}>{children}</AppShell>;
}
