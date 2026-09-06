// Common packaging abbreviations in normalized ASCII
const ABBREVIATIONS = [
  { pattern: /\bkys\.?\b/gi, replacement: 'kyselina' },
  { pattern: /\bkysel\.?\b/gi, replacement: 'kyselina' },
  { pattern: /\bkonzerv\.?\b/gi, replacement: 'konzervant' },
  { pattern: /\bstab\.?\b/gi, replacement: 'stabilizator' },
  { pattern: /\bstabiliz\.?\b/gi, replacement: 'stabilizator' },
  { pattern: /\bemulg\.?\b/gi, replacement: 'emulgator' },
  { pattern: /\bantiox\.?\b/gi, replacement: 'antioxidant' },
  { pattern: /\bregul\.?\b/gi, replacement: 'regulator' },
  { pattern: /\bprir\.?\b/gi, replacement: 'prirodni' },
  { pattern: /\bbarv\.?\b/gi, replacement: 'barvivo' },
  { pattern: /\bslad\.?\b/gi, replacement: 'sladidlo' },
  { pattern: /\bzahust\.?\b/gi, replacement: 'zahustovadlo' },
  { pattern: /\bdifosforec\.?\b/gi, replacement: 'difosforecnany' },
  { pattern: /\btrifosforec\.?\b/gi, replacement: 'trifosforecnany' },
  { pattern: /\bpolyfosforec\.?\b/gi, replacement: 'polyfosforecnany' },
  { pattern: /\baskorb\.?\b/gi, replacement: 'askorbova' },
  { pattern: /\bcitr\.?\b/gi, replacement: 'citronova' },
  { pattern: /\bsod\.?\b/gi, replacement: 'sodny' },
  { pattern: /\bdras\.?\b/gi, replacement: 'draselny' },
  { pattern: /\bvapen\.?\b/gi, replacement: 'vapenaty' },
];

// Normalize text: lowercase, strip diacritics to pure ASCII, expand abbreviations
export function normalizeText(text) {
  if (!text) return '';
  let str = String(text).toLowerCase();

  // 1. Remove Czech/German diacritics first so \b word boundaries work accurately on ASCII
  str = str.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
  str = str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // 2. Expand known packaging abbreviations
  for (const { pattern, replacement } of ABBREVIATIONS) {
    str = str.replace(pattern, replacement);
  }

  return str;
}

// Light stemmer for Czech/Slovak inflected endings on ASCII words
export function getStem(word) {
  if (!word || word.length < 4) return word;
  let stem = word;

  const endings = [
    'ovych', 'oveho', 'ovemu', 'ovym', 'ovou', 'ove', 'ovy', 'ova', 'ovo',
    'ickeho', 'ickemu', 'ickych', 'ickym', 'ickou', 'icka', 'icke', 'icky',
    'nymi', 'nych', 'nym', 'nou', 'ny', 'na', 'ne', 'ni',
    'tech', 'tem', 'em', 'um', 'am', 'ou', 'at',
    'ich', 'ech', 'ych', 'ach', 'ami',
    'y', 'e', 'u', 'i', 'a', 'o'
  ];

  for (const ending of endings) {
    if (stem.length - ending.length >= 3 && stem.endsWith(ending)) {
      stem = stem.slice(0, -ending.length);
      break;
    }
  }

  return stem;
}

/**
 * Robust fuzzy offline matcher:
 * Scans normalized text for exact E-numbers AND multi-word fuzzy additive names.
 */
export function matchAdditivesOffline(rawText, eNumbersDatabase) {
  if (!rawText || !Array.isArray(eNumbersDatabase)) return [];

  const normalizedInput = normalizeText(rawText);
  const inputWords = normalizedInput
    .split(/[\s,.:;()/\\[\]{}<>=+\-_*!?"'`~|]+/)
    .filter(w => w.length >= 2);
  const inputStems = inputWords.map(w => ({ word: w, stem: getStem(w) }));

  // 1. Find E-numbers via strict boundary regex (e.g. E100, E-100, E 100, E150d, E 331)
  const eRegex = /\b[Ee][-\s]?(\d{3,4})\s*([a-z]|\([a-z0-9]+\))?\b/gi;
  const directEMatches = new Set();
  let match;
  while ((match = eRegex.exec(rawText)) !== null) {
    const num = match[1];
    const suffix = match[2] ? match[2].replace(/[()]/g, '').toLowerCase() : '';
    directEMatches.add(`E${num}${suffix}`.toUpperCase());
    directEMatches.add(`E${num}`.toUpperCase());
  }

  const results = [];
  const addedIds = new Set();

  // 2. Iterate database items and check for matches
  for (const item of eNumbersDatabase) {
    const standardId = item.id.toUpperCase();
    let isMatched = false;
    let matchedSnippet = null;

    // Check direct E-number match
    if (directEMatches.has(standardId)) {
      isMatched = true;
      matchedSnippet = standardId;
    }

    // Check multi-word name matches across Czech, English, and German names
    if (!isMatched) {
      const candidates = [
        item.czechName || item.name,
        item.englishName,
        item.germanName
      ].filter(Boolean);

      for (const candidate of candidates) {
        const normCandidate = normalizeText(candidate);
        
        // Exact substring match in normalized text
        if (normCandidate.length >= 4 && normalizedInput.includes(normCandidate)) {
          isMatched = true;
          matchedSnippet = candidate;
          break;
        }

        // Multi-word stem matching (e.g. "kyselina citronova" matches "kyselinou citronovou")
        const candWords = normCandidate
          .split(/[\s,.:;()/\\[\]{}<>=+\-_*!?"'`~|]+/)
          .filter(w => w.length >= 3);

        const STOP_WORDS = new Set(['kyselina', 'acid', 'saeure', 'extrakt', 'extract', 'prirodni', 'natural']);
        const meaningfulWords = candWords.filter(w => !STOP_WORDS.has(w));

        if (meaningfulWords.length > 0) {
          const allMeaningfulFound = meaningfulWords.every(candWord => {
            const candStem = getStem(candWord);
            return inputStems.some(
              ({ word, stem }) =>
                word === candWord ||
                (stem.length >= 3 && stem === candStem) ||
                (candWord.length >= 5 && word.startsWith(candStem))
            );
          });

          if (allMeaningfulFound) {
            isMatched = true;
            matchedSnippet = candidate;
            break;
          }
        }
      }
    }

    if (isMatched && !addedIds.has(standardId)) {
      addedIds.add(standardId);
      results.push({
        item,
        matchedSnippet: matchedSnippet || standardId,
      });
    }
  }

  // 3. Any direct E-numbers that aren't in the database
  for (const eNum of directEMatches) {
    if (!addedIds.has(eNum) && !results.some(r => r.item.id.toUpperCase().startsWith(eNum))) {
      results.push({
        item: {
          id: eNum,
          name: 'Unknown Additive',
          czechName: 'Neznámé aditivum',
          englishName: 'Unknown Additive',
          germanName: 'Unbekannter Zusatzstoff',
          rating: 3,
          ferpotravinaScore: null,
          description: 'Nenalezeno v lokální databázi.',
        },
        matchedSnippet: eNum,
      });
      addedIds.add(eNum);
    }
  }

  return results;
}
