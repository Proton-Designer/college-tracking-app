import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@collegeos/core", "@collegeos/api", "@collegeos/design"],
  agentRules: false,
};

export default nextConfig;
