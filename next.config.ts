import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Deliberately NOT setting typescript.ignoreBuildErrors or eslint.ignoreDuringBuilds.
  // A failing typecheck must fail the build (CLAUDE.md rule 1).
};

export default nextConfig;
