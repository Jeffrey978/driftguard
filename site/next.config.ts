import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The repo root has its own package-lock.json (the extension). Pin the app root to site/
  // so Next doesn't infer the parent folder as the workspace.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
