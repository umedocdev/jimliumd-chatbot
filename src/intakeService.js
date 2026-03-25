import axios from "axios";
import nodemailer from "nodemailer";
import { canSendEmail, canSendGoogleChat, config } from "./config.js";
import { readStore, writeStore } from "./dataStore.js";

const requiredFields = ["name", "email", "phone", "interest"];

export const validateLead = (payload) => {
  const missing = requiredFields.filter((field) => !String(payload[field] || "").trim());
  if (missing.length) {
    return `Missing required fields: ${missing.join(", ")}`;
  }
  return null;
};

const createTransporter = () =>
  nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: {
      user: config.smtpUser,
      pass: config.smtpPass,
    },
  });

export const saveLead = async (lead) => {
  const existing = await readStore("leads", []);
  existing.push(lead);
  await writeStore("leads", existing);
};

export const notifyStaff = async (lead) => {
  const body = [
    `New patient consultation request`,
    "",
    `Name: ${lead.name}`,
    `Email: ${lead.email}`,
    `Phone: ${lead.phone}`,
    `Program/Interest: ${lead.interest}`,
    `Preferred Time: ${lead.preferredTime || "Not specified"}`,
    "",
    "Patient Message:",
    lead.message || "(none)",
    "",
    `Submitted At: ${lead.submittedAt}`,
  ].join("\n");

  const emailStatus = { delivered: false, reason: "SMTP not configured" };
  if (canSendEmail()) {
    const transporter = createTransporter();
    await transporter.sendMail({
      from: config.fromEmail,
      to: config.staffEmail,
      subject: `New consultation request: ${lead.name}`,
      text: body,
    });
    emailStatus.delivered = true;
    delete emailStatus.reason;
  }

  const googleChatStatus = { delivered: false, reason: "Google Chat webhook not configured" };
  if (canSendGoogleChat()) {
    const googleChatText = [
      "*New patient consultation request*",
      `Name: ${lead.name}`,
      `Email: ${lead.email}`,
      `Phone: ${lead.phone}`,
      `Program/Interest: ${lead.interest}`,
      `Preferred Time: ${lead.preferredTime || "Not specified"}`,
      `Message: ${lead.message || "(none)"}`,
      `Submitted At: ${lead.submittedAt}`,
    ].join("\n");

    await axios.post(
      config.googleChatWebhookUrl,
      { text: googleChatText },
      { headers: { "Content-Type": "application/json; charset=UTF-8" }, timeout: 10000 }
    );
    googleChatStatus.delivered = true;
    delete googleChatStatus.reason;
  }

  return {
    delivered: emailStatus.delivered || googleChatStatus.delivered,
    email: emailStatus,
    googleChat: googleChatStatus,
  };
};
