import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.resolve(import.meta.dirname, "../.."),
  allowedDevOrigins: ["localhost"],
  cacheComponents: true,
  experimental: { authInterrupts: true, serverActions: { bodySizeLimit: "9mb" } },
  env: { APP_BUILD_DATE: new Date().toISOString().slice(0, 10).replaceAll("-", "") },
  partialPrefetching: true,
  reactCompiler: true,
  typedRoutes: true,
  logging: {
    incomingRequests: { ignore: [/^\/api\/v1\/auth(?:\/|$)/] },
    serverFunctions: false,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default createNextIntlPlugin("./src/i18n/request.ts")(nextConfig);
