/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // Monaco editor and webcams work smoother in strictMode: false for development
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 'api.dicebear.com',
      },
    ],
  },
};

export default nextConfig;
