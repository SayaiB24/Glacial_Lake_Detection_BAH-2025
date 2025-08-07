/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    // Add a rule to handle .geojson files
    config.module.rules.push({
      test: /\.geojson$/,
      use: [
        {
          loader: 'json-loader',
        },
      ],
    });

    // Return the modified config
    return config;
  },
};

export default nextConfig;
