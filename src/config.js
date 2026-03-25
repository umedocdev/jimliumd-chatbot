import dotenv from "dotenv";

dotenv.config();

const intOr = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const config = {
  port: intOr(process.env.PORT, 3000),
  openaiApiKey: process.env.OPENAI_API_KEY,
  model: process.env.MODEL || "gpt-4.1-mini",
  embeddingModel: process.env.EMBEDDING_MODEL || "text-embedding-3-small",
  maxPages: intOr(process.env.MAX_PAGES, 25),
  maxCharsPerPage: intOr(process.env.MAX_CHARS_PER_PAGE, 12000),
  chunkSize: intOr(process.env.CHUNK_SIZE, 800),
  chunkOverlap: intOr(process.env.CHUNK_OVERLAP, 120),
  smtpHost: process.env.SMTP_HOST,
  smtpPort: intOr(process.env.SMTP_PORT, 587),
  smtpSecure: String(process.env.SMTP_SECURE).toLowerCase() === "true",
  smtpUser: process.env.SMTP_USER,
  smtpPass: process.env.SMTP_PASS,
  staffEmail: process.env.STAFF_EMAIL,
  fromEmail: process.env.FROM_EMAIL || process.env.SMTP_USER,
  corsOrigin: process.env.CORS_ORIGIN || "",
  intakeRateLimitMax: intOr(process.env.INTAKE_RATE_LIMIT_MAX, 5),
  intakeRateLimitWindowMs: intOr(process.env.INTAKE_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  googleChatWebhookUrl: process.env.GOOGLE_CHAT_WEBHOOK_URL || "",
  storageBackend: (process.env.STORAGE_BACKEND || "local").toLowerCase(),
  s3Bucket: process.env.S3_BUCKET || "",
  s3Prefix: process.env.S3_PREFIX || "clinic-ai",
};

export const requireOpenAI = () => {
  if (!config.openaiApiKey) {
    throw new Error("Missing OPENAI_API_KEY in environment variables.");
  }
};

export const canSendEmail = () =>
  Boolean(config.smtpHost && config.smtpUser && config.smtpPass && config.staffEmail);

export const canSendGoogleChat = () => Boolean(config.googleChatWebhookUrl);
