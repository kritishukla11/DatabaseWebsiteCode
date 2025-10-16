/** @type {import('next').NextConfig} */
const nextConfig = {
  // ✅ Allow builds to complete even if ESLint errors exist
  eslint: {
    ignoreDuringBuilds: true,
  },

  // ✅ Experimental & runtime options
  experimental: {
    typedRoutes: false,
    reactCompiler: false,
    serverActions: false,
  },

  // ✅ Build/runtime settings
  output: "standalone",
  staticPageGenerationTimeout: 120,

  // ✅ Disable static pre-rendering at build time for dynamic pages
  env: {
    NEXT_SKIP_BUILD_STATIC_GENERATION: "true",
  },
};

// Optional: ensure this env variable is actually applied at runtime
if (process.env.NODE_ENV === "production") {
  process.env.NEXT_SKIP_BUILD_STATIC_GENERATION = "true";
}

module.exports = nextConfig;

