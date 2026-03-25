import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "./config.js";
import { answerClinicQuestion } from "./chatService.js";
import { ingestWebsite } from "./knowledgeService.js";
import { notifyStaff, saveLead, validateLead } from "./intakeService.js";
import { createRateLimiter } from "./security.js";
import { buildAutoLeadCandidate } from "./chatIntakeAutomation.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const defaultDeps = {
  answerClinicQuestion,
  ingestWebsite,
  notifyStaff,
  saveLead,
  validateLead,
};

const missingFieldLabel = {
  name: "full name",
  email: "valid email address",
  phone: "phone number",
  interest: "program or service of interest",
  consent: "consent to be contacted",
};

const buildMissingInfoMessage = (missing) => {
  const readable = missing.map((field) => missingFieldLabel[field] || field);
  return `To submit your consultation request, please provide: ${readable.join(
    ", "
  )}. Reply in one message, for example: "My name is..., email is..., phone is..., I am interested in..., I consent to be contacted."`;
};

export const createApp = (deps = {}) => {
  const services = { ...defaultDeps, ...deps };
  const app = express();
  const submittedConversations = new Set();
  const intakeRateLimit = createRateLimiter({
    windowMs: config.intakeRateLimitWindowMs,
    maxRequests: config.intakeRateLimitMax,
  });

  app.use((req, res, next) => {
    if (config.corsOrigin) {
      res.header("Access-Control-Allow-Origin", config.corsOrigin);
      res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      res.header("Access-Control-Allow-Headers", "Content-Type");
    }

    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }

    return next();
  });

  app.use(express.json({ limit: "1mb" }));
  app.use(express.static(path.resolve(__dirname, "../public")));

  app.get("/api/health", (_, res) => {
    res.json({ ok: true, service: "clinic-ai-agent" });
  });

  app.post("/api/ingest", async (req, res) => {
    try {
      const startUrl = String(req.body?.startUrl || "").trim();
      const maxPages = Number.parseInt(req.body?.maxPages, 10) || config.maxPages;

      if (!startUrl) {
        return res.status(400).json({ error: "startUrl is required" });
      }

      const data = await services.ingestWebsite({ startUrl, maxPages });
      return res.json({
        success: true,
        pageCount: data.pageCount,
        chunkCount: data.chunkCount,
        updatedAt: data.updatedAt,
      });
    } catch (error) {
      return res.status(500).json({ error: error.message || "Ingest failed" });
    }
  });

  app.post("/api/chat", async (req, res) => {
    try {
      const question = String(req.body?.question || "").trim();
      const history = Array.isArray(req.body?.history) ? req.body.history : [];
      const conversationId = String(req.body?.conversationId || "").trim();

      if (!question) {
        return res.status(400).json({ error: "question is required" });
      }

      const result = await services.answerClinicQuestion({ question, history });
      const autoLead = buildAutoLeadCandidate({ history, question });
      const intake = {
        attempted: false,
        submitted: false,
        delivered: false,
        emailDelivered: false,
        googleChatDelivered: false,
        message: "",
        missing: autoLead.missing,
      };

      if (autoLead.shouldStartIntakeFlow) {
        intake.attempted = true;

        if (!autoLead.isComplete) {
          intake.message = buildMissingInfoMessage(autoLead.missing);
        } else if (conversationId && submittedConversations.has(conversationId)) {
          intake.message = "Your request was already submitted in this chat.";
        } else {
          const lead = {
            ...autoLead.lead,
            submittedAt: new Date().toISOString(),
            source: "website-ai-agent-chat",
          };

          const validationError = services.validateLead(lead);
          if (validationError) {
            intake.message = validationError;
          } else {
            await services.saveLead(lead);
            const deliveryStatus = await services.notifyStaff(lead);
            intake.submitted = true;
            intake.delivered = Boolean(deliveryStatus?.delivered);
            intake.emailDelivered = Boolean(deliveryStatus?.email?.delivered);
            intake.googleChatDelivered = Boolean(deliveryStatus?.googleChat?.delivered);
            intake.message = intake.delivered
              ? "Your consultation request has been sent to our office staff."
              : "Your request was saved, but no delivery channel is configured yet.";
            if (conversationId) {
              submittedConversations.add(conversationId);
            }
          }
        }
      }

      return res.json({ ...result, intake });
    } catch (error) {
      return res.status(500).json({ error: error.message || "Chat failed" });
    }
  });

  app.post("/api/intake", intakeRateLimit, async (req, res) => {
    try {
      const payload = req.body || {};

      if (String(payload.website || "").trim()) {
        return res.status(400).json({ error: "Spam detection triggered." });
      }

      const consentGiven =
        payload.consentToContact === true || String(payload.consentToContact).toLowerCase() === "true";
      if (!consentGiven) {
        return res.status(400).json({ error: "Patient consent is required." });
      }

      const validationError = services.validateLead(payload);
      if (validationError) {
        return res.status(400).json({ error: validationError });
      }

      const lead = {
        name: String(payload.name).trim(),
        email: String(payload.email).trim(),
        phone: String(payload.phone).trim(),
        interest: String(payload.interest).trim(),
        preferredTime: String(payload.preferredTime || "").trim(),
        message: String(payload.message || "").trim(),
        consentToContact: true,
        submittedAt: new Date().toISOString(),
        source: "website-ai-agent",
      };

      await services.saveLead(lead);
      const emailStatus = await services.notifyStaff(lead);

      return res.json({ success: true, emailStatus });
    } catch (error) {
      return res.status(500).json({ error: error.message || "Intake failed" });
    }
  });

  return app;
};
