import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";

const startTestServer = (deps = {}) => {
  const app = createApp(deps);
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${port}`,
      });
    });
  });
};

test("GET /api/health returns ok", async (t) => {
  const { server, baseUrl } = await startTestServer();
  t.after(() => server.close());

  const res = await fetch(`${baseUrl}/api/health`);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.service, "clinic-ai-agent");
});

test("POST /api/ingest validates startUrl", async (t) => {
  const { server, baseUrl } = await startTestServer();
  t.after(() => server.close());

  const res = await fetch(`${baseUrl}/api/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const body = await res.json();

  assert.equal(res.status, 400);
  assert.match(body.error, /startUrl is required/i);
});

test("POST /api/chat returns mocked assistant response", async (t) => {
  const { server, baseUrl } = await startTestServer({
    answerClinicQuestion: async () => ({
      answer: "We offer telehealth consultations.",
      citations: ["https://clinic.test/programs"],
    }),
  });
  t.after(() => server.close());

  const res = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: "Do you offer telehealth?" }),
  });
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.answer, "We offer telehealth consultations.");
  assert.deepEqual(body.citations, ["https://clinic.test/programs"]);
  assert.equal(body.intake?.attempted, false);
});

test("POST /api/chat auto-submits intake when details and consent are present", async (t) => {
  let savedLead;

  const { server, baseUrl } = await startTestServer({
    answerClinicQuestion: async () => ({
      answer: "Thanks, I can help schedule that.",
      citations: [],
    }),
    validateLead: () => null,
    saveLead: async (lead) => {
      savedLead = lead;
    },
    notifyStaff: async () => ({
      delivered: true,
      email: { delivered: true },
      googleChat: { delivered: false },
    }),
  });
  t.after(() => server.close());

  const question =
    "Please schedule a consultation. My name is Jane Doe, email jane@example.com, phone 555-111-2222. I am interested in longevity medicine and I consent to be contacted. Best time is 1 PM.";

  const res = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question,
      history: [{ role: "user", content: question }],
      conversationId: "chat-auto-1",
    }),
  });
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.intake.attempted, true);
  assert.equal(body.intake.submitted, true);
  assert.equal(body.intake.delivered, true);
  assert.equal(body.intake.emailDelivered, true);
  assert.equal(savedLead.source, "website-ai-agent-chat");
  assert.equal(savedLead.email, "jane@example.com");
});

test("POST /api/chat does not auto-submit without consent", async (t) => {
  const { server, baseUrl } = await startTestServer({
    answerClinicQuestion: async () => ({
      answer: "Please share your consent and I can proceed.",
      citations: [],
    }),
    validateLead: () => null,
    saveLead: async () => {
      throw new Error("should not save lead without consent");
    },
    notifyStaff: async () => ({
      delivered: true,
      email: { delivered: true },
      googleChat: { delivered: false },
    }),
  });
  t.after(() => server.close());

  const question =
    "Book consultation. My name is Jane Doe, email jane@example.com, phone 555-111-2222. I am interested in longevity medicine.";

  const res = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question,
      history: [{ role: "user", content: question }],
      conversationId: "chat-auto-2",
    }),
  });
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.intake.attempted, true);
  assert.equal(body.intake.submitted, false);
  assert.match(body.intake.message, /consent to be contacted/i);
});

test("POST /api/chat keeps intake flow active for partial details", async (t) => {
  const { server, baseUrl } = await startTestServer({
    answerClinicQuestion: async () => ({
      answer: "Thanks for sharing.",
      citations: [],
    }),
  });
  t.after(() => server.close());

  const question = "my name is Quang Vu, quangvu@primemedteam, 3213333333, 1PM";
  const res = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question,
      history: [{ role: "user", content: question }],
      conversationId: "chat-partial-1",
    }),
  });
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.intake.attempted, true);
  assert.equal(body.intake.submitted, false);
  assert.match(body.intake.message, /valid email address/i);
  assert.match(body.intake.message, /program or service of interest/i);
  assert.match(body.intake.message, /consent to be contacted/i);
});

test("POST /api/intake requires patient consent", async (t) => {
  const { server, baseUrl } = await startTestServer();
  t.after(() => server.close());

  const res = await fetch(`${baseUrl}/api/intake`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Jane" }),
  });
  const body = await res.json();

  assert.equal(res.status, 400);
  assert.match(body.error, /patient consent is required/i);
});

test("POST /api/intake blocks honeypot spam payload", async (t) => {
  const { server, baseUrl } = await startTestServer();
  t.after(() => server.close());

  const res = await fetch(`${baseUrl}/api/intake`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Jane Doe",
      email: "jane@example.com",
      phone: "555-111-2222",
      interest: "Weight program",
      consentToContact: true,
      website: "https://spam.example",
    }),
  });
  const body = await res.json();

  assert.equal(res.status, 400);
  assert.match(body.error, /spam detection/i);
});

test("POST /api/intake validates required lead fields", async (t) => {
  const { server, baseUrl } = await startTestServer();
  t.after(() => server.close());

  const res = await fetch(`${baseUrl}/api/intake`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Jane Doe",
      consentToContact: true,
    }),
  });
  const body = await res.json();

  assert.equal(res.status, 400);
  assert.match(body.error, /missing required fields/i);
});

test("POST /api/intake saves and notifies with mocked services", async (t) => {
  let savedLead;

  const { server, baseUrl } = await startTestServer({
    validateLead: () => null,
    saveLead: async (lead) => {
      savedLead = lead;
    },
    notifyStaff: async () => ({ delivered: true }),
  });
  t.after(() => server.close());

  const payload = {
    name: "Jane Doe",
    email: "jane@example.com",
    phone: "555-111-2222",
    interest: "Weight program",
    preferredTime: "Next Tuesday morning",
    message: "Please call me after 10am",
    consentToContact: true,
  };

  const res = await fetch(`${baseUrl}/api/intake`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.emailStatus.delivered, true);
  assert.equal(savedLead.name, payload.name);
  assert.equal(savedLead.email, payload.email);
  assert.equal(savedLead.source, "website-ai-agent");
  assert.equal(savedLead.consentToContact, true);
  assert.ok(savedLead.submittedAt);
});

test("POST /api/intake enforces rate limit", async (t) => {
  const { server, baseUrl } = await startTestServer({
    validateLead: () => null,
    saveLead: async () => {},
    notifyStaff: async () => ({ delivered: true }),
  });
  t.after(() => server.close());

  const payload = {
    name: "Jane Doe",
    email: "jane@example.com",
    phone: "555-111-2222",
    interest: "Weight program",
    consentToContact: true,
  };

  for (let i = 0; i < 5; i += 1) {
    const res = await fetch(`${baseUrl}/api/intake`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    assert.equal(res.status, 200);
  }

  const blocked = await fetch(`${baseUrl}/api/intake`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await blocked.json();
  assert.equal(blocked.status, 429);
  assert.match(body.error, /too many requests/i);
});
