import axios from "axios";
import * as cheerio from "cheerio";
import { config } from "./config.js";
import { normalizeWhitespace } from "./utils.js";

const skipFileExtensions = [
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".pdf",
  ".svg",
  ".webp",
  ".zip",
  ".mp4",
  ".mp3",
];

const isSameDomain = (rootUrl, candidateUrl) => {
  try {
    const root = new URL(rootUrl);
    const candidate = new URL(candidateUrl);
    return root.hostname === candidate.hostname;
  } catch {
    return false;
  }
};

const isSkippable = (url) =>
  skipFileExtensions.some((extension) => url.toLowerCase().includes(extension));

const extractPageText = (html) => {
  const $ = cheerio.load(html);
  $("script,style,noscript,iframe").remove();
  return normalizeWhitespace($("body").text());
};

const extractTitle = (html) => {
  const $ = cheerio.load(html);
  return normalizeWhitespace($("title").first().text());
};

const extractContactSignals = (html) => {
  const $ = cheerio.load(html);
  const snippets = [];

  $("a[href^='tel:']").each((_, el) => {
    const href = ($(el).attr("href") || "").replace(/^tel:/i, "");
    const value = normalizeWhitespace(href);
    if (value) snippets.push(`Phone: ${value}`);
  });

  $("a[href^='mailto:']").each((_, el) => {
    const href = ($(el).attr("href") || "").replace(/^mailto:/i, "");
    const value = normalizeWhitespace(href);
    if (value) snippets.push(`Email: ${value}`);
  });

  const jsonLdTexts = $("script[type='application/ld+json']")
    .map((_, el) => $(el).text())
    .get();

  for (const raw of jsonLdTexts) {
    try {
      const payload = JSON.parse(raw);
      const items = Array.isArray(payload) ? payload : [payload];

      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        if (item.telephone) snippets.push(`Phone: ${normalizeWhitespace(item.telephone)}`);
        if (item.email) snippets.push(`Email: ${normalizeWhitespace(item.email)}`);

        const address = item.address;
        if (address && typeof address === "object") {
          const formatted = [
            address.streetAddress,
            address.addressLocality,
            address.addressRegion,
            address.postalCode,
            address.addressCountry,
          ]
            .filter(Boolean)
            .map((part) => normalizeWhitespace(String(part)))
            .join(", ");
          if (formatted) snippets.push(`Address: ${formatted}`);
        }
      }
    } catch {
      // Ignore invalid JSON-LD.
    }
  }

  const deduped = [...new Set(snippets.map((x) => normalizeWhitespace(x)).filter(Boolean))];
  return deduped.join(" ");
};

const extractLinks = (html, baseUrl) => {
  const $ = cheerio.load(html);
  const links = new Set();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;

    try {
      const url = new URL(href, baseUrl);
      url.hash = "";
      links.add(url.toString());
    } catch {
      // Ignore malformed URLs.
    }
  });
  return [...links];
};

export const crawlWebsite = async ({ startUrl, maxPages = config.maxPages }) => {
  const queue = [startUrl];
  const visited = new Set();
  const pages = [];

  while (queue.length > 0 && pages.length < maxPages) {
    const url = queue.shift();
    if (!url || visited.has(url) || isSkippable(url)) {
      continue;
    }

    visited.add(url);

    if (!isSameDomain(startUrl, url)) {
      continue;
    }

    try {
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          "User-Agent": "ClinicAIAgentBot/1.0 (+website assistant)",
        },
      });

      if (typeof response.data !== "string") continue;

      const baseText = extractPageText(response.data);
      const contactSignals = extractContactSignals(response.data);
      const text = normalizeWhitespace(`${baseText} ${contactSignals}`).slice(0, config.maxCharsPerPage);
      const title = extractTitle(response.data);
      if (text.length >= 80) {
        pages.push({ url, text, title });
      }

      const links = extractLinks(response.data, url)
        .filter((link) => isSameDomain(startUrl, link) && !visited.has(link))
        .slice(0, 40);

      queue.push(...links);
    } catch {
      // Ignore unreachable pages and continue crawling.
    }
  }

  return pages;
};
