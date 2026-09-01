import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: false },
  serverExternalPackages: ["pg", "pg-boss"],
};

export default nextConfig;
