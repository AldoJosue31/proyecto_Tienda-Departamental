"use client";

import { IconChevronDown, IconMenu2 } from "@tabler/icons-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { isActiveDestination, navigationForRole } from "@/lib/auth/navigation";
import type { Role } from "@/lib/auth/roles";

export function NavigationMenu({ role }: { role: Role | null }) {
  const pathname = usePathname();
  const navigation = navigationForRole(role);
  const activeHref = navigation
    .filter(({ href }) => isActiveDestination(href, pathname))
    .sort((left, right) => right.href.length - left.href.length)[0]?.href;
  const activeLabel = navigation.find(({ href }) => href === activeHref)?.label;
  const links = navigation.map(({ href, label }) => {
    const active = href === activeHref;
    return (
      <Link key={href} href={href} aria-current={active ? "page" : undefined}
        className={`flex min-h-11 items-center rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${active ? "bg-[var(--accent-soft)] text-[var(--accent-strong)] underline decoration-2 underline-offset-4" : "text-[var(--muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]"}`}>
        {label}
      </Link>
    );
  });

  return (
    <>
      <nav className="hidden gap-1 border-t border-[var(--line)] py-2 lg:flex" aria-label="Principal">{links}</nav>
      <details key={pathname} className="group border-t border-[var(--line)] lg:hidden">
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-lg text-sm font-semibold [&::-webkit-details-marker]:hidden">
          <IconMenu2 size={18} aria-hidden="true" /><span>Menú</span>
          {activeLabel && <span className="ml-2 min-w-0 truncate font-normal text-[var(--muted)]">{activeLabel}</span>}
          <IconChevronDown size={18} aria-hidden="true" className="ml-auto shrink-0 transition-transform group-open:rotate-180" />
        </summary>
        <nav className="grid grid-cols-2 gap-1 pb-3" aria-label="Principal">{links}</nav>
      </details>
    </>
  );
}
