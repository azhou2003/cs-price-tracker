import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    minimumCacheTTL: 604800,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "community.fastly.steamstatic.com",
      },
      {
        protocol: "https",
        hostname: "cdn.fastly.steamstatic.com",
      },
    ],
  },
};

export default nextConfig;
