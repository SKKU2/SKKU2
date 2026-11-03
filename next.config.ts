import type { NextConfig } from 'next';

const config: NextConfig = {
  experimental: {
    // 백업 불러오기(JSON)는 서버 액션으로 보내므로 기본 1MB보다 크게 허용
    serverActions: { bodySizeLimit: '4mb' }
  }
};

export default config;
