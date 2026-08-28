import type { NextConfig } from 'next';

const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1];
const inferredBasePath =
  process.env.GITHUB_ACTIONS === 'true' && repositoryName
    ? `/${repositoryName}`
    : '';
const publicPath = process.env.NEXT_PUBLIC_BASE_PATH ?? inferredBasePath;

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  // GitHub Pages mounts the artifact at /<repository>. Keeping routes at the
  // artifact root preserves index.html; assetPrefix points generated assets to
  // their public project URL without changing the route that gets prerendered.
  assetPrefix: publicPath || undefined,
  env: {
    NEXT_PUBLIC_BASE_PATH: publicPath,
  },
};

export default nextConfig;
