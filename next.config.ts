import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["playwright", "sharp", "impeccable"],
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
};

export default nextConfig;
