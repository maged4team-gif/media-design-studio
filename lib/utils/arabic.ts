/**
 * Arabic Text Normalization & Search Utilities
 * Implements standard Arabic linguistic rules:
 * - Strips Tashkeel (harakat / diacritics)
 * - Strips Tatweel (Kashida)
 * - Normalizes Alef variants (إ / أ / آ / ٱ -> ا)
 * - Normalizes Yaa / Alef Maksura (ى -> ي)
 * - Normalizes Taa Marbuta / Haa (ة -> ه)
 * - Normalizes Hamza carriers (ؤ -> و, ئ -> ي)
 * - Collapses repeated whitespace
 * - Supports searching with or without the definite article prefix "الـ"
 */

export function normalizeArabic(text: string | null | undefined): string {
  if (!text) return '';
  return text
    // Remove Tashkeel (diacritics: Fathatan, Dammatan, Kasratan, Fatha, Damma, Kasra, Shadda, Sukun, Superscript Alef)
    .replace(/[\u064B-\u065F\u0670]/g, '')
    // Remove Tatweel / Kashida
    .replace(/\u0640/g, '')
    // Normalize Alefs
    .replace(/[إأآٱ]/g, 'ا')
    // Normalize Alef Maksura to Yaa
    .replace(/ى/g, 'ي')
    // Normalize Taa Marbuta to Haa
    .replace(/ة/g, 'ه')
    // Normalize Hamza on Waw / Yaa
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    // Collapse multiple whitespace characters into single space
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Checks whether target text matches the query taking into account
 * Arabic normalization and "الـ" (definite article) flexibility.
 * E.g., "أخبار" matches "اخبار" and "الأخبار"; "قناة" matches "القناة".
 */
export function matchesArabicSearch(target: string | null | undefined, query: string | null | undefined): boolean {
  if (!query || !query.trim()) return true;
  if (!target) return false;

  const normTarget = normalizeArabic(target);
  const normQuery = normalizeArabic(query);

  if (!normQuery) return true;
  if (normTarget.includes(normQuery)) return true;

  // Split query into tokens for multi-term query matching
  const queryTokens = normQuery.split(' ').filter(Boolean);
  const targetTokens = normTarget.split(' ').filter(Boolean);

  // All tokens in query must match something in the target
  return queryTokens.every((qToken) => {
    // 1. Direct substring
    if (normTarget.includes(qToken)) return true;

    // 2. Token with and without "ال" prefix
    const qWithoutAl = qToken.startsWith('ال') ? qToken.slice(2) : qToken;
    const qWithAl = qToken.startsWith('ال') ? qToken : `ال${qToken}`;

    if (qWithoutAl && normTarget.includes(qWithoutAl)) return true;
    if (normTarget.includes(qWithAl)) return true;

    // 3. Match against target individual words with/without "ال"
    return targetTokens.some((tToken) => {
      const tWithoutAl = tToken.startsWith('ال') ? tToken.slice(2) : tToken;
      return (
        tWithoutAl === qWithoutAl ||
        tWithoutAl.includes(qWithoutAl) ||
        (qWithoutAl.length > 2 && tWithoutAl.startsWith(qWithoutAl))
      );
    });
  });
}
