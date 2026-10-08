import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  distDir: process.env.ISPATLA_DEMO === "1" ? ".next-demo" : ".next",
  allowedDevOrigins: ["localhost", "127.0.0.1"],
  experimental: {
    // Next 16's CLI checker currently emits output that this installed Next build cannot parse with TypeScript 5.9.
    useTypeScriptCli: false,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
