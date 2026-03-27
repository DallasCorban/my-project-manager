/** Strip markdown formatting for cleaner TTS output. */
export function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s+/g, '') // headers
    .replace(/\*\*(.+?)\*\*/g, '$1') // bold
    .replace(/\*(.+?)\*/g, '$1') // italic
    .replace(/`{1,3}[^`]*`{1,3}/g, '') // inline code and code blocks
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
    .replace(/^[-*+]\s+/gm, '') // list markers
    .replace(/^\d+\.\s+/gm, '') // numbered lists
    .replace(/>\s+/g, '') // blockquotes
    .replace(/\n{2,}/g, '. ') // paragraph breaks to pauses
    .replace(/\n/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
