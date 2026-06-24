import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/backend/:path*',
        destination: 'https://ash2kkid-f1-race-engineer.hf.space/:path*',
      },
    ];
  },
};

export default nextConfig;
