/* 0PTICBOX community language safety filter — starter client-side layer.
   The Supabase trigger is the authoritative enforcement layer. */

const BLOCKED_TERMS = Object.freeze([
  'nigger',
  'nigga',
  'faggot',
  'fag',
  'kike',
  'chink',
  'spic',
  'wetback',
  'tranny',
  'retard',
]);

const substitutions = Object.freeze({
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  '$': 's',
});

function normalize(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[013457@$]/g, (char) => substitutions[char] || char)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function hasBlockedLanguage(value) {
  const source = Array.isArray(value) ? value.join(' ') : value;
  const normalized = normalize(source);
  if (!normalized) return false;

  const tokens = new Set(normalized.split(/\s+/).filter(Boolean));
  const compact = normalized.replace(/\s+/g, '');

  return BLOCKED_TERMS.some((term) => {
    if (tokens.has(term)) return true;
    return term.length >= 5 && compact.includes(term);
  });
}
