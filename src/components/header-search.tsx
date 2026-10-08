"use client";

import { IconSearch } from "@tabler/icons-react";
import Form from "next/form";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function SearchForm({ query }: { query: string }) {
  return <Form action="/" role="search" className="flex h-11 min-w-0 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] transition-colors focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent-soft)] lg:h-12">
    <label htmlFor="header-product-search" className="sr-only">Buscar productos en el catálogo</label>
    <input key={query} id="header-product-search" name="q" type="search" defaultValue={query} maxLength={200} placeholder="Buscar productos" className="min-w-0 flex-1 bg-transparent px-4 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--muted)]" />
    <button type="submit" aria-label="Buscar productos" className="grid w-12 shrink-0 place-items-center bg-[var(--accent)] text-white transition-colors hover:bg-[var(--accent-strong)] lg:w-14"><IconSearch size={21} stroke={2} aria-hidden="true" /></button>
  </Form>;
}

function SearchFormWithQuery() {
  const query = (useSearchParams().get("q") ?? "").trim().slice(0, 200);
  return <SearchForm query={query} />;
}

export function HeaderSearch() {
  return <Suspense fallback={<SearchForm query="" />}><SearchFormWithQuery /></Suspense>;
}
