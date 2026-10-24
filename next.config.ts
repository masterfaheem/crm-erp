import type { NextConfig } from "next";

/* Basic browser security headers on every page / API response */
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" }, // no click-jacking inside other sites
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=15552000" }, // HTTPS only (this host)
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
