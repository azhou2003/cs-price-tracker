export function buildShareMessage(text: string, url: string) {
  return `${text} ${url}`.trim();
}
