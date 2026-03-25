import { ingestWebsite } from "../knowledgeService.js";

const startUrl = process.argv[2];
const maxPagesArg = process.argv[3];

if (!startUrl) {
  // eslint-disable-next-line no-console
  console.error("Usage: npm run ingest -- <startUrl> [maxPages]");
  process.exit(1);
}

const maxPages = Number.parseInt(maxPagesArg, 10);

const run = async () => {
  const result = await ingestWebsite({
    startUrl,
    maxPages: Number.isFinite(maxPages) ? maxPages : undefined,
  });

  // eslint-disable-next-line no-console
  console.log(
    `Ingestion complete. Pages: ${result.pageCount}, Chunks: ${result.chunkCount}, Updated: ${result.updatedAt}`
  );
};

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error.message || error);
  process.exit(1);
});