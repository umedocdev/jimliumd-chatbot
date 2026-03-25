import { config } from "./config.js";
import { ingestWebsite } from "./knowledgeService.js";

export const handler = async () => {
  const startUrl = process.env.INGEST_START_URL || "";
  const maxPages = Number.parseInt(process.env.INGEST_MAX_PAGES || "", 10) || config.maxPages;

  if (!startUrl) {
    throw new Error("INGEST_START_URL is required for scheduled ingestion.");
  }

  const result = await ingestWebsite({ startUrl, maxPages });
  return {
    ok: true,
    pageCount: result.pageCount,
    chunkCount: result.chunkCount,
    updatedAt: result.updatedAt,
  };
};
