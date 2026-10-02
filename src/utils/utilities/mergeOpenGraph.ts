import type { Metadata } from 'next'

const defaultOpenGraph: Metadata['openGraph'] = {
  type: 'website',
  title: 'StreamDash',
  description: 'Nền tảng tự động hóa và quản trị vận hành kênh video quy mô lớn. Tích hợp GPMLogin API, kiểm soát checklist chấm công, theo dõi doanh thu và tối ưu RPM.',
  url: 'https://streamdash.top/',
  siteName: 'StreamDash',
  images: [
    {
      url: '/favicon.ico',
      width: 1200,
      height: 630,
    },
  ],
  locale: 'vi_VN',
};

export const mergeOpenGraph = (og?: Metadata['openGraph']): Metadata['openGraph'] => {
  return {
    ...defaultOpenGraph,
    ...og,
    images: og?.images ? og.images : defaultOpenGraph.images,
  }
}


