import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Turbopack config (Next.js 16+ default bundler).
  // pdfjs-dist optionally requires 'canvas' for server-side Node.js rendering.
  // We run pdfjs entirely client-side, so stub it with an empty module.
  // NOTE: Turbopack requires a relative path (not absolute Windows path).
  turbopack: {
    resolveAlias: {
      canvas: "./lib/canvas-empty.js",
    },
  },
  // Webpack config (used when running with --webpack flag)
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...(config.resolve.alias as Record<string, unknown>),
      canvas: path.resolve("./lib/canvas-empty.js"),
    };
    return config;
  },
};

export default nextConfig;
