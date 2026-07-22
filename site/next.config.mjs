import path from 'node:path';

const nextConfig = {
  output: 'export',
  trailingSlash: true,
  outputFileTracingRoot: path.join(process.cwd(), '..'),
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
