"use client";

import { Toaster } from "sileo";

export function ToastProvider() {
  return <Toaster position="top-right" theme="system" offset={{ top: 16, right: 16 }} />;
}
