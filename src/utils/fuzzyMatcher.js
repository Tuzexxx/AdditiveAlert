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

// Color words and common culinary words that must NEVER trigger matches on their own
const COLOR_WORDS = new Set([
  'rot', 'rote', 'roter', 'rotes', 'gelb', 'gelbe', 'gelber', 'gelbes',
  'gruen', 'gruene', 'gruener', 'gruenes', 'blau', 'blaue', 'blauer', 'blaues',
  'schwarz', 'schwarze', 'schwarzer', 'schwarzes', 'weiss', 'weisse', 'weisser', 'weisses',
  'braun', 'braune', 'brauner', 'braunes',
  'cerven', 'cervena', 'cervene', 'cerveny', 'zlut', 'zluta', 'zlute', 'zluty',
  'zelen', 'zelena', 'zelene', 'zeleny', 'modr', 'modra', 'modre', 'modry',
  'cern', 'cerna', 'cerne', 'cerny', 'hned', 'hneda', 'hnede', 'hnedy', 'bila', 'bile', 'bily',
  'red', 'yellow', 'green', 'blue', 'black', 'white', 'brown'
]);

const GENERIC_STOP_WORDS = new Set([
  'extrakt', 'extract', 'prirodni', 'natural',
  'olej', 'oil', 'oel', 'sul', 'salt', 'salz', 'voda', 'water', 'wasser',
  'mouka', 'flour', 'mehl', 'cukr', 'sugar', 'zucker'
]);

/**
 * Robust fuzzy offline matcher:
 * Scans normalized text for exact E-numbers AND multi-word fuzzy additive names.
 */
export function matchAdditivesOffline(rawText, eNumbersDatabase) {
  if (!rawText || !Array.isArray(eNumbersDatabase)) return [];

  const normalizedInput = normalizeText(rawText);
  // Tokenize normalized input into words (preserve alphanumeric codes like 2g, 4r)
  const inputWords = normalizedInput
    .split(/[\s,.:;()/\\[\]{}<>=+\-_*!?"'`~|%]+/)
    .filter(w => w.length >= 1);
  const inputWordSet = new Set(inputWords);
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
        // Strip secondary parenthetical comments: "Rot 2G ( Cl... )" -> "Rot 2G"
        const candidateClean = candidate.replace(/\([^)]*\)/g, '').trim();
        const normCandidate = normalizeText(candidateClean);

        // 1. Exact phrase match with boundary check
        if (normCandidate.length >= 4) {
          const escaped = normCandidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp('(?:^|[^a-z0-9])' + escaped + '(?:$|[^a-z0-9])');
          if (regex.test(normalizedInput)) {
            isMatched = true;
            matchedSnippet = candidateClean;
            break;
          }
        }

        // 2. Token-based matching for multi-word additives
        // Keep tokens of length >= 1 (so 2g, 4r, fcf, etc. are retained!)
        const candWords = normCandidate
          .split(/[\s,.:;()/\\[\]{}<>=+\-_*!?"'`~|%]+/)
          .filter(w => w.length >= 1 && !/^\d+$/.test(w)); // exclude pure numbers

        if (candWords.length === 0) continue;

        const containsColor = candWords.some(w => COLOR_WORDS.has(w));
        const meaningfulWords = candWords.filter(w => !GENERIC_STOP_WORDS.has(w));

        // NEVER match if the only meaningful word is a generic color (e.g. "Rot", "Gelb", "Grün")
        if (meaningfulWords.length === 1 && COLOR_WORDS.has(meaningfulWords[0])) {
          continue;
        }

        // Single unique chemical name (e.g. Aspartam, Benzoan, Tartrazin) - length >= 6
        if (meaningfulWords.length === 1) {
          const singleWord = meaningfulWords[0];
          if (singleWord.length >= 6 && !containsColor) {
            const singleStem = getStem(singleWord);
            const found = inputStems.some(({ word, stem }) =>
              word === singleWord || (stem.length >= 4 && stem === singleStem)
            );
            if (found) {
              isMatched = true;
              matchedSnippet = candidateClean;
              break;
            }
          }
          continue;
        }

        // Multi-word phrase: e.g. "Rot 2G", "Dusitan sodny", "Kyselina citronova"
        if (meaningfulWords.length >= 2) {
          // If the phrase contains a color (e.g. "Rot 2G"), the alphanumeric code (e.g. "2g") MUST match exactly as a word!
          if (containsColor) {
            const nonColorWords = meaningfulWords.filter(w => !COLOR_WORDS.has(w));
            if (nonColorWords.length === 0) continue;
            // Every non-color word must be present in the input
            const allNonColorsFound = nonColorWords.every(w => inputWordSet.has(w));
            if (!allNonColorsFound) continue;
          }

          const allFound = meaningfulWords.every(candWord => {
            const candStem = getStem(candWord);
            return inputStems.some(({ word, stem }) => {
              if (word === candWord) return true;
              if (candWord.length >= 4 && stem.length >= 3 && stem === candStem) return true;
              if (candWord.length >= 6 && word.startsWith(candStem)) return true;
              return false;
            });
          });

          if (allFound) {
            isMatched = true;
            matchedSnippet = candidateClean;
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
