/**
 * Removes Vietnamese diacritics / accents and converts to lowercase.
 * E.g., "Nguyễn Văn Đạt" -> "nguyen van dat"
 */
export function removeDiacritics(str: string): string {
  if (!str) return "";
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase();
}

/**
 * Normalizes a search query string:
 * - Trims whitespace
 * - Strips leading '@' (e.g. '@username' -> 'username')
 */
export function normalizeSearchTerm(term?: string | null): string {
  if (!term) return "";
  return term.trim().replace(/^@+/, "");
}

/**
 * Multi-token intelligent search matching:
 * Returns true if all words in `query` match anywhere in the concatenated `targets`.
 * Supports:
 * - Case-insensitive matching
 * - Diacritic-insensitive matching (e.g. typing "nguyen" matches "Nguyễn")
 * - Leading '@' stripped (e.g. typing "@user" matches "user")
 * - Multi-word tokens: "user 123" matches if both "user" and "123" appear in targets
 */
export function smartSearchMatch(
  query: string | undefined | null,
  ...targets: Array<string | number | null | undefined>
): boolean {
  const cleanQuery = normalizeSearchTerm(query);
  if (!cleanQuery) return true;

  const validTargets = targets.filter((t) => t !== null && t !== undefined);
  if (validTargets.length === 0) return false;

  const rawTargetString = validTargets.join(" ").toLowerCase();
  const normalizedTargetString = removeDiacritics(rawTargetString);

  // Split query into tokens by whitespace
  const tokens = cleanQuery.split(/\s+/).filter(Boolean);

  return tokens.every((token) => {
    const rawToken = token.toLowerCase();
    const normalizedToken = removeDiacritics(rawToken);

    return (
      rawTargetString.includes(rawToken) ||
      normalizedTargetString.includes(normalizedToken)
    );
  });
}
