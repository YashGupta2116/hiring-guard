/** @type {import('next').NextConfig} */
const nextConfig = {
  // Produce the minimal self-hosting bundle used by the production Docker image.
  output: "standalone",
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
