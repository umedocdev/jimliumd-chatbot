const EMAIL_REGEX = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE_REGEX = /(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?){2}\d{4}/;
const TIME_REGEX = /\b\d{1,2}(?::\d{2})?\s?(?:am|pm)\b/i;

const cleanValue = (value) => String(value || "").trim();

const matchGroup = (text, regex, group = 1) => {
  const match = text.match(regex);
  return match ? cleanValue(match[group]) : "";
};

const normalizePhone = (value) => {
  const raw = cleanValue(value);
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return raw;
};

const extractFromUserMessages = (history, question) => {
  const userTexts = [
    ...history
      .filter((h) => h?.role === "user")
      .map((h) => cleanValue(h.content)),
    cleanValue(question),
  ].filter(Boolean);

  const joined = userTexts.join("\n");
  const lower = joined.toLowerCase();

  const name =
    matchGroup(joined, /(?:my name is|this is|i am)\s+([A-Za-z][A-Za-z' -]{1,60})/i) ||
    matchGroup(joined, /name\s*[:\-]\s*([A-Za-z][A-Za-z' -]{1,60})/i);

  const emailMatch = joined.match(EMAIL_REGEX);
  const phoneMatch = joined.match(PHONE_REGEX);
  const timeMatch =
    matchGroup(joined, /(?:preferred time|best time|available at|reach me at)\s*[:\-]?\s*([^\n.!?]+)/i) ||
    matchGroup(joined, /(around\s+\d{1,2}(?::\d{2})?\s?(?:am|pm))/i) ||
    matchGroup(joined, /(at\s+\d{1,2}(?::\d{2})?\s?(?:am|pm))/i) ||
    (joined.match(TIME_REGEX)?.[0] || "");

  const interest =
    matchGroup(joined, /(?:interested in|interest is|program is|service is|looking for)\s*[:\-]?\s*([^\n.!?]+)/i) ||
    (/\b(schedule|book|consult|appointment|fit call)\b/i.test(joined) ? "General consultation" : "");

  const consentToContact =
    /\bi consent\b/i.test(lower) ||
    /\bi agree\b.*\bcontact/i.test(lower) ||
    /\byou can contact me\b/i.test(lower) ||
    /\bplease contact me\b/i.test(lower);

  const scheduleIntent = /\b(schedule|book|consult|appointment|fit call|call me)\b/i.test(joined);

  return {
    name,
    email: emailMatch ? emailMatch[0] : "",
    phone: normalizePhone(phoneMatch ? phoneMatch[0] : ""),
    interest,
    preferredTime: timeMatch,
    message: cleanValue(question),
    consentToContact,
    scheduleIntent,
  };
};

export const buildAutoLeadCandidate = ({ history = [], question = "" }) => {
  const extracted = extractFromUserMessages(history, question);
  const hasAnyPatientDetails = Boolean(
    extracted.name ||
      extracted.email ||
      extracted.phone ||
      extracted.preferredTime ||
      extracted.interest ||
      /@/.test(question) ||
      /\d{7,}/.test(question.replace(/\D/g, ""))
  );
  const missing = [];

  if (!extracted.name) missing.push("name");
  if (!extracted.email) missing.push("email");
  if (!extracted.phone) missing.push("phone");
  if (!extracted.interest) missing.push("interest");
  if (!extracted.consentToContact) missing.push("consent");

  return {
    lead: {
      name: extracted.name,
      email: extracted.email,
      phone: extracted.phone,
      interest: extracted.interest,
      preferredTime: extracted.preferredTime,
      message: extracted.message,
      consentToContact: extracted.consentToContact,
    },
    scheduleIntent: extracted.scheduleIntent,
    hasAnyPatientDetails,
    shouldStartIntakeFlow: extracted.scheduleIntent || hasAnyPatientDetails,
    missing,
    isComplete: missing.length === 0,
  };
};
