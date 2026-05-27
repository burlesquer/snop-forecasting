import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // Static JSON is shipped in public/data and read at request time on Vercel.
  // No special export config needed — the app is dynamic-by-default but
  // pages are effectively static because they fetch a fixed set of files.
  experimental: {
    typedRoutes: true,
  },
};

export default config;
