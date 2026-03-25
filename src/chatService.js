import { config } from "./config.js";
import { retrieveContext } from "./knowledgeService.js";
import { getOpenAI } from "./openaiClient.js";

const systemPrompt = `You are a clinic assistant for a medical practice.
Rules:
1) Use only the provided clinic context when stating clinic facts.
2) If information is missing, clearly say you are not sure and offer to connect the patient to staff.
3) Do not diagnose, prescribe, or replace medical professionals.
4) Keep answers concise, polite, and practical.
5) If patient asks to book, ask for name, email, phone, and preferred time.`;

const dedupeCitations = (snippets) => {
  const seen = new Set();
  const citationDetails = [];

  for (const snippet of snippets) {
    let canonicalUrl = snippet.url;
    try {
      const u = new URL(snippet.url);
      u.hash = "";
      if (u.pathname !== "/" && u.pathname.endsWith("/")) {
        u.pathname = u.pathname.slice(0, -1);
      }
      canonicalUrl = u.toString();
    } catch {
      // Keep original URL when parsing fails.
    }

    if (seen.has(canonicalUrl)) continue;
    seen.add(canonicalUrl);
    citationDetails.push({
      url: canonicalUrl,
      title: snippet.title || "Clinic Website",
    });
  }

  return citationDetails;
};

export const answerClinicQuestion = async ({ question, history = [] }) => {
  const { snippets, updatedAt } = await retrieveContext({ query: question, topK: 6 });

  const contextBlock = snippets.length
    ? snippets
        .map(
          (s, i) =>
            `[Source ${i + 1}] URL: ${s.url}\nScore: ${s.score.toFixed(3)}\nContent: ${s.text}`
        )
        .join("\n\n")
    : "No clinic context found in the knowledge base.";

  const openai = getOpenAI();
  const input = [
    ...history.slice(-8).map((h) => ({
      role: h.role === "assistant" ? "assistant" : "user",
      content: h.content,
    })),
    {
      role: "user",
      content: `Question: ${question}\n\nClinic Context Last Updated: ${updatedAt || "never"}\n\n${contextBlock}`,
    },
  ];

  const response = await openai.responses.create({
    model: config.model,
    instructions: systemPrompt,
    input,
    temperature: 0.2,
  });

  const answer = response.output_text || "I do not have enough information yet.";

  const citationDetails = dedupeCitations(snippets);

  return {
    answer,
    citations: citationDetails.map((c) => c.url),
    citationDetails,
  };
};
