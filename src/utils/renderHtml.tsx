export function renderHtml(html?: string | null) {
  return { __html: html ?? "" };
}

