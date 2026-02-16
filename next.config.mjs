/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "yt3.ggpht.com"
      },
      {
        protocol: "https",
        hostname: "i.ytimg.com"
      }
    ]
  },
  webpack: (config, { dev }) => {
    if (dev) {
      // Avoid intermittent corrupted filesystem cache on Windows dev sessions.
      config.cache = false;
    }
    return config;
  }
};

export default nextConfig;
