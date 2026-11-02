import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native/binary packages must not be bundled by Next.
  serverExternalPackages: ["playwright", "playwright-core", "@sparticuz/chromium", "sharp", "impeccable"],
  // Make sure the serverless Chromium binaries and Impeccable's CLI ship with the functions on Vercel.
  outputFileTracingIncludes: {
    "/api/analyze": ["./node_modules/@sparticuz/chromium/bin/**", "./node_modules/impeccable/**"],
  },
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
};

export default nextConfig;
