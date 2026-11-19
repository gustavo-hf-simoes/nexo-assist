import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O @nexo/domain é publicado como TypeScript cru no workspace; o Next o transpila no build.
  transpilePackages: ["@nexo/domain"],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
