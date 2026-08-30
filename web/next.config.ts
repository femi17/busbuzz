import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dashboard imports from ../shared, so the build root is the repo,
  // not web/. Without this, Turbopack infers web/ as the root (it has its
  // own lockfile) and refuses to resolve shared/'s imports from the
  // hoisted node_modules above it — which breaks the Vercel build.
  turbopack: {
    root: path.join(__dirname, ".."),
  },
};

export default nextConfig;
