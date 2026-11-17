import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained build for the Docker container (see web/Dockerfile).
  output: "standalone",
  // Trace from the project root, so the shared package is included.
  outputFileTracingRoot: path.join(import.meta.dirname, ".."),
  transpilePackages: ["@scc/shared"],
};

export default nextConfig;
