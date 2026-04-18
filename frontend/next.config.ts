import type { NextConfig } from "next";

/** Proxy API calls to the FastAPI backend so the browser can use same-origin `/api/*` (fixes prod builds that would otherwise call localhost:8000). */
const backendOrigin =
  process.env.BACKEND_HTTP_ORIGIN?.replace(/\/$/, "") ||
  process.env.NEXT_PUBLIC_BACKEND_HTTP_URL?.replace(/\/$/, "") ||
  "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
