const STREET_TYPE_WORDS = [
  '\u0443\u043b\u0438\u0446\u0430',
  '\u0443\u043b',
  '\u043f\u0440\u043e\u0441\u043f\u0435\u043a\u0442',
  '\u043f\u0440-\u043a\u0442',
  '\u043f\u0440',
  '\u043f\u0435\u0440\u0435\u0443\u043b\u043e\u043a',
  '\u043f\u0435\u0440',
  '\u043f\u0440\u043e\u0435\u0437\u0434',
  '\u043f\u0440-\u0434',
  '\u0448\u043e\u0441\u0441\u0435',
  '\u043f\u043b\u043e\u0449\u0430\u0434\u044c',
  '\u043f\u043b',
  '\u0431\u0443\u043b\u044c\u0432\u0430\u0440',
  '\u0431\u0443\u043b',
  '\u043d\u0430\u0431\u0435\u0440\u0435\u0436\u043d\u0430\u044f',
  '\u043d\u0430\u0431',
  '\u0442\u0440\u0430\u043a\u0442',
  '\u0442\u0443\u043f\u0438\u043a',
  '\u0430\u043b\u043b\u0435\u044f',
  '\u043b\u0438\u043d\u0438\u044f',
  '\u043c\u0438\u043a\u0440\u043e\u0440\u0430\u0439\u043e\u043d',
  '\u043c\u043a\u0440',
  '\u043a\u0432\u0430\u0440\u0442\u0430\u043b',
  '\u043a\u0432-\u043b',
];

const BLOCKED_HOUSE_FIRST_WORDS = new Set([
  '\u043b\u0435\u0442',
  '\u0433\u043e\u0434\u0430',
  '\u0433\u043e\u0434',
  ...STREET_TYPE_WORDS,
  '\u043f\u043e\u0441\u0435\u043b\u043e\u043a',
  '\u043f\u043e\u0441\u0451\u043b\u043e\u043a',
  '\u043f\u043e\u0441',
  '\u0441\u0435\u043b\u043e',
  '\u0434\u0435\u0440\u0435\u0432\u043d\u044f',
  '\u0442\u0435\u0440\u0440\u0438\u0442\u043e\u0440\u0438\u044f',
  '\u0440\u0430\u0439\u043e\u043d',
]);

const HOUSE_TOKEN_PATTERNS = [
  /^\d+[\u0430-\u044fa-z]?(?:[/-]\d+[\u0430-\u044fa-z]?)?$/iu,
  /^\d+[\u0430-\u044fa-z]?\u043a\d+[\u0430-\u044fa-z]?$/iu,
  /^\d+[\u0430-\u044fa-z]?\u0441\d+[\u0430-\u044fa-z]?$/iu,
  /^\d+[\u0430-\u044fa-z]?\u043b\u0438\u0442[\u0430-\u044fa-z]$/iu,
];

const HOUSE_PREFIX_WORD_RE = /^(?:\u0434\u043e\u043c|\u0434)$/u;
const HOUSE_CORPUS_RE = /^\u043a(?:\u043e\u0440\u043f(?:\u0443\u0441)?)?$/u;
const HOUSE_BUILDING_RE = /^(?:\u0441\u0442\u0440(?:\u043e\u0435\u043d\u0438\u0435)?|\u0441)$/u;
const HOUSE_LITERAL_RE = /^(?:\u043b\u0438\u0442(?:\u0435\u0440)?)$/u;

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\u0451/g, '\u0435')
    .replace(/[.,;:()[\]{}"'`~\u2116]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactText(value) {
  return normalizeText(value).replace(/\s+/g, '');
}

function tokenizeRaw(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\u0451/g, '\u0435')
    .replace(/[.,;:()[\]{}"'`~\u2116]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((item) => item.trim())
    .filter(Boolean);
}

function isOrdinalPair(left, right) {
  return /^\d+$/.test(String(left || '').trim())
    && /^(?:\u0439|\u044f|\u044b\u0439|\u0430\u044f)$/.test(String(right || '').trim());
}

function normalizeHouseToken(value) {
  const normalized = String(value || '')
    .toLowerCase()
    .replace(/\u0451/g, '\u0435')
    .replace(/[.,;:()[\]{}"'`~]+/g, ' ')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return '';

  const tokens = normalized.split(' ').filter(Boolean);
  const result = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (HOUSE_PREFIX_WORD_RE.test(token)) continue;
    if (HOUSE_CORPUS_RE.test(token)) {
      const next = tokens[index + 1] || '';
      if (next) {
        result.push(`\u043a${next}`);
        index += 1;
      } else {
        result.push('\u043a');
      }
      continue;
    }
    if (HOUSE_BUILDING_RE.test(token)) {
      const next = tokens[index + 1] || '';
      if (next) {
        result.push(`\u0441${next}`);
        index += 1;
      } else {
        result.push('\u0441');
      }
      continue;
    }
    if (HOUSE_LITERAL_RE.test(token)) {
      const next = tokens[index + 1] || '';
      if (next) {
        result.push(`\u043b\u0438\u0442${next}`);
        index += 1;
      } else {
        result.push('\u043b\u0438\u0442');
      }
      continue;
    }
    result.push(token);
  }

  return result
    .join('')
    .replace(/(\d)\s+([a-z\u0430-\u044f])/giu, '$1$2')
    .trim();
}

function isHouseToken(value) {
  const normalized = normalizeHouseToken(value);
  if (!normalized) return false;
  return HOUSE_TOKEN_PATTERNS.some((pattern) => pattern.test(normalized));
}

function extractHouseCandidateFromSide(tokens, side = 'end') {
  const list = Array.isArray(tokens) ? tokens : [];
  const maxSpan = Math.min(3, list.length);
  for (let span = maxSpan; span >= 1; span -= 1) {
    const candidateTokens = side === 'start'
      ? list.slice(0, span)
      : list.slice(list.length - span);
    const candidate = candidateTokens.join(' ');
    const normalizedCandidate = normalizeHouseToken(candidate);
    if (!normalizedCandidate || !isHouseToken(normalizedCandidate)) continue;

    if (side === 'start') {
      const firstToken = candidateTokens[0] || '';
      const nextToken = list[span] || '';
      if (isOrdinalPair(firstToken, nextToken)) continue;
      if (nextToken && BLOCKED_HOUSE_FIRST_WORDS.has(String(nextToken || '').trim())) continue;
      return normalizedCandidate;
    }

    const firstCandidateToken = candidateTokens[0] || '';
    const beforeCandidate = list[list.length - span - 1] || '';
    if (isOrdinalPair(beforeCandidate, firstCandidateToken)) continue;
    return normalizedCandidate;
  }
  return '';
}

function extractHouseToken(value) {
  const tokens = tokenizeRaw(value);
  if (!tokens.length) return '';
  return extractHouseCandidateFromSide(tokens, 'end')
    || extractHouseCandidateFromSide(tokens, 'start')
    || '';
}

function removeHouseToken(value, houseToken) {
  const normalizedHouse = normalizeHouseToken(houseToken);
  if (!normalizedHouse) return normalizeText(value);
  const rawTokens = tokenizeRaw(value);
  const maxSpan = Math.min(3, rawTokens.length);

  for (let span = 1; span <= maxSpan; span += 1) {
    const tailTokens = rawTokens.slice(rawTokens.length - span);
    if (normalizeHouseToken(tailTokens.join(' ')) === normalizedHouse) {
      return normalizeText(rawTokens.slice(0, rawTokens.length - span).join(' '));
    }
  }

  for (let span = 1; span <= maxSpan; span += 1) {
    const headTokens = rawTokens.slice(0, span);
    if (normalizeHouseToken(headTokens.join(' ')) === normalizedHouse) {
      return normalizeText(rawTokens.slice(span).join(' '));
    }
  }

  const filtered = [];
  let removed = false;
  for (let index = 0; index < rawTokens.length; index += 1) {
    const token = rawTokens[index];
    if (!removed && normalizeHouseToken(token) === normalizedHouse) {
      removed = true;
      continue;
    }
    filtered.push(token);
  }
  return normalizeText(filtered.join(' '));
}

function stripStreetNoise(value) {
  return tokenizeRaw(value)
    .filter((token) => !STREET_TYPE_WORDS.includes(token))
    .join(' ')
    .trim();
}

function normalizeStreetSearchValue(value) {
  return normalizeText(stripStreetNoise(value))
    .replace(/\b(\d+)\s+(?:года|год|лет)\b/giu, '$1')
    .replace(/(\d+)\s*-\s*(?:го|й|я|ый|ая)\b/giu, '$1')
    .replace(/(\d+)(?:-го|-й|-я|-ый|-ая)\b/giu, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniqueStrings(values) {
  const seen = new Set();
  const result = [];
  for (const raw of Array.isArray(values) ? values : []) {
    const value = String(raw || '').trim();
    if (!value) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function buildSearchText(parts) {
  const values = uniqueStrings(parts.map((part) => normalizeText(part)).filter(Boolean));
  return values.join(' | ');
}

function normalizeStreetSearchValue(value) {
  return normalizeText(stripStreetNoise(value))
    .replace(/(\d+)\s*-\s*(?:\u0433\u043e|\u0439|\u044f|\u044b\u0439|\u0430\u044f)\b/giu, '$1')
    .replace(/(\d+)(?:-\u0433\u043e|-\u0439|-\u044f|-\u044b\u0439|-\u0430\u044f)\b/giu, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = {
  normalizeText,
  compactText,
  normalizeHouseToken,
  isHouseToken,
  extractHouseToken,
  removeHouseToken,
  stripStreetNoise,
  normalizeStreetSearchValue,
  buildSearchText,
};
