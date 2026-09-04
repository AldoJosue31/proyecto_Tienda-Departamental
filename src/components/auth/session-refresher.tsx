"use client";

import { useEffect } from "react";

import { refreshSession } from "@/app/login/actions";

const refreshIntervalMs = 10 * 60 * 1000;

/** Keeps an active, HTTP-only session fresh without surfacing either token to the browser. */
export function SessionRefresher() {
  useEffect(() => {
    const renew = () => {
      void refreshSession();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") renew();
    };

    const timer = window.setInterval(renew, refreshIntervalMs);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return null;
}
