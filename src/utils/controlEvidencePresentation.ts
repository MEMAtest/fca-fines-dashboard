/** A short exact leading excerpt; the complete source text remains in disclosure. */
export function compactControlPassagePreview(passage: string, maxLength = 220) {
  const compact = passage.trim().replace(/\s+/g, " ");
  return compact.length > maxLength ? `${compact.slice(0, maxLength).trimEnd()}…` : compact;
}
