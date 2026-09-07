import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This repository is nested below a workspace-level lockfile. Pinning the
  // Turbopack root keeps Next's dependency discovery scoped to this app.
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
