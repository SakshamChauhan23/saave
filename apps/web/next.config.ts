import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev server binds to localhost; loading the page from 127.0.0.1 blocks
  // client JS (including login handlers) unless this origin is allowed.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
