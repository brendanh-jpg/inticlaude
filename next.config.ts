import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["playwright-core", "@browserbasehq/sdk", "winston", "better-sqlite3"],
};

export default nextConfig;
