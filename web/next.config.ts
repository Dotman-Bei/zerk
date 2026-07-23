import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  // web/ is its own npm project inside the contracts repo; pin the root so Turbopack does not
  // pick the parent lockfile.
  turbopack: { root: import.meta.dirname },
};

export default nextConfig;
