import path from 'node:path';

const nextConfig = {
  webpack(config) {
    config.resolve.alias['@vladmandic/human$'] = path.resolve(
      process.cwd(),
      'node_modules/@vladmandic/human/dist/human.esm.js'
    );
    return config;
  }
};

export default nextConfig;
