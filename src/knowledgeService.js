import { config } from "./config.js";
import { readStore, writeStore } from "./dataStore.js";
import { getOpenAI } from "./openaiClient.js";
import { crawlWebsite } from "./scraper.js";
import { chunkText, cosineSimilarity } from "./utils.js";

const embedMany = async (inputs) => {
  if (!inputs.length) return [];
  const openai = getOpenAI();
  const response = await openai.embeddings.create({
    model: config.embeddingModel,
    input: inputs,
  });
  return response.data.map((x) => x.embedding);
};

export const ingestWebsite = async ({ startUrl, maxPages }) => {
  const pages = await crawlWebsite({ startUrl, maxPages });
  const chunks = [];

  for (const page of pages) {
    const pieces = chunkText(page.text, config.chunkSize, config.chunkOverlap);
    for (const piece of pieces) {
      chunks.push({
        id: `${page.url}::${chunks.length + 1}`,
        url: page.url,
        title: page.title || "",
        text: piece,
      });
    }
  }

  const embeddings = await embedMany(chunks.map((c) => c.text));

  const records = chunks.map((chunk, i) => ({
    ...chunk,
    embedding: embeddings[i],
  }));

  const payload = {
    updatedAt: new Date().toISOString(),
    startUrl,
    pageCount: pages.length,
    chunkCount: records.length,
    records,
  };

  await writeStore("knowledge", payload);
  return payload;
};

export const retrieveContext = async ({ query, topK = 6 }) => {
  const knowledge = await readStore("knowledge", null);
  if (!knowledge || !knowledge.records?.length) {
    return { snippets: [], updatedAt: null };
  }

  const [queryEmbedding] = await embedMany([query]);

  const scored = knowledge.records
    .map((record) => ({
      ...record,
      score: cosineSimilarity(queryEmbedding, record.embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return {
    snippets: scored,
    updatedAt: knowledge.updatedAt,
  };
};
