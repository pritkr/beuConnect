/**
 * Sizes, measured the way the device stores them.
 *
 * `Storage` keeps UTF-8 strings, so a size in `String.length` undercounts every
 * Hindi character and every rupee sign. These two helpers are the only place
 * the app converts a value into bytes or a byte count into something a student
 * reads, so the Storage screen and the offline packs can never disagree.
 */

/** "980 B", "31.4 KB", "1.25 MB". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

/** Exact UTF-8 size, without depending on TextEncoder being present. */
export function utf8Bytes(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      index += 1;
    } else bytes += 3;
  }
  return bytes;
}
