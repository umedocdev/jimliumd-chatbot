export const normalizeWhitespace = (text) => text.replace(/\s+/g, " ").trim();

export const chunkText = (text, chunkSize, overlap) => {
  const clean = normalizeWhitespace(text);
  if (!clean) return [];

  const chunks = [];
  let start = 0;

  while (start < clean.length) {
    const end = Math.min(clean.length, start + chunkSize);
    chunks.push(clean.slice(start, end));
    if (end === clean.length) break;
    start = Math.max(0, end - overlap);
  }

  return chunks;
};

export const cosineSimilarity = (a, b) => {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  if (!magA || !magB) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
};
