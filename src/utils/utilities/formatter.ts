export function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(price)
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(date)
}

export function calculateReadTime(content: string): number {
  const wordsPerMinute = 200
  const words = content.trim().split(/\s+/).length
  return Math.ceil(words / wordsPerMinute)
}

export const normalizeTimestamp = (raw: string | Date | null | undefined): string => {
  if (!raw) return new Date().toISOString();
  if (raw instanceof Date) return raw.toISOString();
  if (typeof raw === 'string') {
    // If the string has no timezone info, assume UTC
    if (!raw.endsWith('Z') && !raw.includes('+')) {
      return new Date(raw + 'Z').toISOString();
    }
    return new Date(raw).toISOString();
  }
  return new Date().toISOString();
};
