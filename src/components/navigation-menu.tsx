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
  const activeLabel = pathname === "/checkout" && role === "CUSTOMER"
    ? "Bolsa"
    : navigation.find(({ href }) => href === activeHref)?.label;
  const links = navigation.map(({ href, label }) => {
    const active = href === activeHref;
    return (
      <Link key={href} href={href} aria-current={active ? "page" : undefined}
        className={`flex min-h-10 min-w-0 items-center rounded-lg px-3 py-2 text-sm font-semibold transition-colors lg:shrink-0 lg:whitespace-nowrap ${active ? "bg-[var(--surface)] text-[var(--accent-strong)]" : "text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"}`}>
        {label}
      </Link>
    );
  });

  return (
    <>
      <nav className="hidden min-w-0 items-center gap-1 py-1 lg:flex" aria-label="Principal">{links}</nav>
      <details key={pathname} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false; }} className="group lg:hidden">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg text-sm font-semibold [&::-webkit-details-marker]:hidden">
          <IconMenu2 size={18} aria-hidden="true" /><span>Menú</span>
          {activeLabel && <span className="ml-2 min-w-0 truncate font-normal text-[var(--muted)]">{activeLabel}</span>}
          <IconChevronDown size={18} aria-hidden="true" className="ml-auto shrink-0 transition-transform group-open:rotate-180" />
        </summary>
        <nav className="grid grid-cols-1 gap-1 border-t border-[var(--line)] py-2 sm:grid-cols-2" aria-label="Principal">{links}</nav>
      </details>
    </>
  );
}
