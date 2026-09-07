import type { Metadata } from 'next'

const defaultOpenGraph: Metadata['openGraph'] = {
  type: 'website',
  title: 'TIKTOKFLOW',
  description: 'Nền tảng tự động hóa và quản trị dàn tài khoản TikTok quy mô lớn. Tích hợp GPMLogin API, kiểm soát checklist chấm công, theo dõi doanh thu và tối ưu RPM.',
  url: 'https://tiktokflow.com/',
  siteName: 'TIKTOKFLOW',
  images: [
    {
      url: '/favicon.ico',
      width: 1200,
      height: 630,
    },
  ],
  locale: 'en_US',
};

export const mergeOpenGraph = (og?: Metadata['openGraph']): Metadata['openGraph'] => {
  return {
    ...defaultOpenGraph,
    ...og,
    images: og?.images ? og.images : defaultOpenGraph.images,
  }
}


