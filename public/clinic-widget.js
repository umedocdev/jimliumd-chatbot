(() => {
  const script = document.currentScript;
  const apiBase = (script?.dataset?.apiBase || "").replace(/\/$/, "");
  const assistantName = script?.dataset?.assistantName || "Clinic Assistant";
  const accent = script?.dataset?.accent || "#0b6b61";
  const iconCandidates = [
    script?.dataset?.iconUrl || "https://jimliumd.com/wp-content/uploads/2026/03/helpdesk-icon-100x100-1.png",
    apiBase ? `${apiBase}/images/helpdesk-icon-100x100.png` : "",
    script?.src ? new URL("images/helpdesk-icon-100x100.png", script.src).toString() : "",
    script?.src ? new URL("/images/helpdesk-icon-100x100.png", script.src).toString() : "",
  ].filter(Boolean);
  const autoOpenMsRaw = script?.dataset?.autoOpenMs || "10000";
  const autoOpenMs = Number.parseInt(autoOpenMsRaw, 10);
  const showSources = String(script?.dataset?.showSources || "false").toLowerCase() === "true";
  const staffPhone = script?.dataset?.staffPhone || "(239) 524-0125";
  const staffEmail = script?.dataset?.staffEmail || "info@jimliumd.com";
  const welcomeMessage = script?.dataset?.welcomeMessage || "Thank you for visiting JimLiuMD.com!";

  const toApi = (path) => `${apiBase}${path}`;
  const history = [];
  const conversationId =
    globalThis.crypto && typeof globalThis.crypto.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `conv-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const customer = {
    name: "",
    email: "",
    phone: "",
    onboarded: false,
  };

  const handoff = {
    active: false,
    step: "idle",
    lead: {
      contactMethod: "",
      phone: "",
      preferredTime: "",
    },
  };

  const root = document.createElement("div");
  root.id = "clinic-ai-widget-root";
  root.innerHTML = `
    <style>
      #clinic-ai-widget-root {
        position: fixed;
        right: 18px;
        bottom: 72px;
        z-index: 999999;
        font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
      }
      .cai-btn {
        width: 58px;
        height: 58px;
        border-radius: 999px;
        border: 0;
        background-color: #ffffff;
        color: transparent;
        font-size: 0;
        box-shadow: 0 12px 30px rgba(0, 0, 0, 0.22);
        cursor: pointer;
        display: grid;
        place-items: center;
        overflow: hidden;
        padding: 0;
      }
      .cai-btn-icon {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }
      .cai-panel {
        display: none;
        width: min(92vw, 390px);
        height: min(80vh, 740px);
        background: #f4f5f7;
        border-radius: 18px;
        box-shadow: 0 16px 36px rgba(0, 0, 0, 0.18);
        overflow: hidden;
        margin-bottom: 10px;
      }
      .cai-head {
        background: linear-gradient(140deg, ${accent}, #11443f);
        color: #fff;
        padding: 14px 14px 10px;
        font-weight: 600;
        display: grid;
        grid-template-columns: auto 1fr auto;
        gap: 10px;
        align-items: center;
      }
      .cai-head-title {
        font-size: 30px;
        line-height: 1.1;
      }
      .cai-head-meta {
        font-size: 13px;
      }
      .cai-head-icon {
        border: 0;
        background: transparent;
        color: #dbe7e4;
        font-size: 22px;
        cursor: pointer;
        padding: 0;
      }
      .cai-body {
        padding: 8px 10px 10px;
        height: calc(100% - 64px);
        display: grid;
        grid-template-rows: 1fr auto;
        gap: 8px;
      }
      .cai-log {
        border: 0;
        border-radius: 10px;
        padding: 6px;
        overflow: auto;
        background: transparent;
        font-size: 13px;
      }
      .cai-msg {
        margin: 8px 0;
        display: flex;
      }
      .cai-user {
        justify-content: flex-end;
      }
      .cai-ai {
        justify-content: flex-start;
      }
      .cai-bubble {
        max-width: 86%;
        border-radius: 14px;
        padding: 12px 14px;
        font-size: 17px;
        line-height: 1.32;
        box-shadow: 0 1px 0 rgba(0, 0, 0, 0.03);
        white-space: pre-wrap;
      }
      .cai-bubble-ai {
        background: #e9ecf1;
        color: #122033;
      }
      .cai-bubble-user {
        background: ${accent};
        color: #fff;
      }
      .cai-cites {
        font-size: 11px;
        color: #4a5b68;
        margin-top: 4px;
      }
      .cai-row {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 8px;
        background: #fff;
        border: 1px solid #dbe2ea;
        border-radius: 14px;
        padding: 8px;
      }
      .cai-input {
        width: 100%;
        box-sizing: border-box;
        border: 0;
        border-radius: 8px;
        padding: 8px 10px;
        font-size: 15px;
        background: transparent;
      }
      .cai-send {
        border: 0;
        border-radius: 999px;
        width: 36px;
        height: 36px;
        background: ${accent};
        color: #fff;
        font-weight: 600;
        cursor: pointer;
        padding: 0;
        font-size: 0;
        position: relative;
      }
      .cai-send::before {
        content: "➤";
        color: #ffffff;
        font-size: 16px;
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
      }
      .cai-send:disabled {
        background: #9abbb6;
        cursor: not-allowed;
      }
      .cai-mini { font-size: 11px; color: #607080; }
      .cai-options {
        display: flex;
        gap: 6px;
        margin: 4px 0 8px;
        flex-wrap: wrap;
      }
      .cai-onboard-inline {
        border: 1px solid #d8e0e8;
        background: #ffffff;
        border-radius: 10px;
        padding: 8px;
        margin: 4px 0 8px;
        display: grid;
        gap: 6px;
      }
      .cai-onboard-error {
        font-size: 11px;
        color: #b3261e;
      }
      .cai-tail-gap {
        height: 6px;
      }
      .cai-option-btn {
        border: 1px solid #b9c8d6;
        background: #fff;
        color: #1f2d3d;
        border-radius: 999px;
        padding: 4px 10px;
        font-size: 12px;
        cursor: pointer;
      }
      @media (max-width: 520px) {
        #clinic-ai-widget-root { right: 10px; bottom: 60px; }
      }
    </style>
    <div class="cai-panel" id="cai-panel">
      <div class="cai-head">
        <button id="cai-close-head" class="cai-head-icon" type="button" aria-label="Close chat">‹</button>
        <div class="cai-head-meta">
          <div><strong>Hi there</strong> 👋</div>
        </div>
        <div class="cai-head-title">⋮</div>
      </div>
      <div class="cai-body">
        <div class="cai-log" id="cai-log"></div>
        <div class="cai-row">
          <input id="cai-question" class="cai-input" placeholder="Ask about services, locations, hours..." disabled />
          <button id="cai-send" class="cai-send" disabled>Ask</button>
        </div>
        <div class="cai-tail-gap"></div>
      </div>
    </div>
    <button class="cai-btn" id="cai-toggle" aria-label="Open clinic assistant">
      <img id="cai-btn-icon" class="cai-btn-icon" alt="Chat support" />
    </button>
  `;

  document.body.appendChild(root);

  const panel = root.querySelector("#cai-panel");
  const toggle = root.querySelector("#cai-toggle");
  const toggleIcon = root.querySelector("#cai-btn-icon");
  const closeHeadBtn = root.querySelector("#cai-close-head");
  const log = root.querySelector("#cai-log");
  const qInput = root.querySelector("#cai-question");
  const askBtn = root.querySelector("#cai-send");
  let inlineOnboardWrap;
  let inlineNameInput;
  let inlineEmailInput;
  let inlinePhoneInput;
  let inlineStartBtn;
  let inlineOnboardError;

  const addMessage = (role, text, citationDetails = []) => {
    const msg = document.createElement("div");
    msg.className = `cai-msg ${role === "user" ? "cai-user" : "cai-ai"}`;
    const bubble = document.createElement("div");
    bubble.className = `cai-bubble ${role === "user" ? "cai-bubble-user" : "cai-bubble-ai"}`;
    bubble.textContent = text;
    msg.appendChild(bubble);
    log.appendChild(msg);

    if (showSources && role === "assistant" && citationDetails.length) {
      const cites = document.createElement("div");
      cites.className = "cai-cites";
      cites.innerHTML =
        "Sources: " +
        citationDetails
          .map((c) => `<a href="${c.url}" target="_blank" rel="noopener noreferrer">${c.title || c.url}</a>`)
          .join(" | ");
      log.appendChild(cites);
    }

    log.scrollTop = log.scrollHeight;
  };

  const addOptions = (options) => {
    const wrap = document.createElement("div");
    wrap.className = "cai-options";
    for (const opt of options) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cai-option-btn";
      btn.textContent = opt.label;
      btn.addEventListener("click", () => opt.onClick());
      wrap.appendChild(btn);
    }
    log.appendChild(wrap);
    log.scrollTop = log.scrollHeight;
  };

  const enableChatInput = () => {
    qInput.disabled = false;
    askBtn.disabled = false;
    qInput.focus();
  };

  const renderInlineOnboarding = () => {
    addMessage("assistant", welcomeMessage);
    addMessage(
      "assistant",
      "I can help answer your questions about our programs and schedule a consultation with our staff."
    );
    addMessage("assistant", "Please introduce yourself.");

    inlineOnboardWrap = document.createElement("div");
    inlineOnboardWrap.className = "cai-onboard-inline";
    inlineOnboardWrap.innerHTML = `
      <input id="cai-name-inline" class="cai-input" placeholder="Name" />
      <input id="cai-email-inline" class="cai-input" placeholder="Email" type="email" />
      <input id="cai-phone-inline" class="cai-input" placeholder="Phone number" type="tel" />
      <button id="cai-start-inline" class="cai-send" type="button">Start Chat</button>
      <div id="cai-onboard-error-inline" class="cai-onboard-error"></div>
    `;
    log.appendChild(inlineOnboardWrap);
    log.scrollTop = log.scrollHeight;

    inlineNameInput = inlineOnboardWrap.querySelector("#cai-name-inline");
    inlineEmailInput = inlineOnboardWrap.querySelector("#cai-email-inline");
    inlinePhoneInput = inlineOnboardWrap.querySelector("#cai-phone-inline");
    inlineStartBtn = inlineOnboardWrap.querySelector("#cai-start-inline");
    inlineOnboardError = inlineOnboardWrap.querySelector("#cai-onboard-error-inline");

    inlineStartBtn.addEventListener("click", () => {
      const name = inlineNameInput.value.trim();
      const email = inlineEmailInput.value.trim();
      const phone = inlinePhoneInput.value.trim();

      if (!name || !email || !phone) {
        inlineOnboardError.textContent = "Please enter your name, email, and phone number to continue.";
        return;
      }
      if (!isValidEmail(email)) {
        inlineOnboardError.textContent = "Please enter a valid email address.";
        return;
      }
      if (!isValidPhone(phone)) {
        inlineOnboardError.textContent = "Please enter a valid phone number including area code.";
        return;
      }

      customer.name = name;
      customer.email = email;
      customer.phone = phone;
      customer.onboarded = true;
      inlineOnboardWrap.remove();
      addMessage("user", `My name is ${name}, my email is ${email}, and my phone number is ${phone}.`);
      addMessage("assistant", `Nice to meet you, ${name}. How can I help you today?`);
      enableChatInput();
    });
  };

  const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  const isValidPhone = (value) => value.replace(/\D/g, "").length >= 10;
  const isYes = (value) => /^(yes|y|sure|ok|okay|please do|do it)$/i.test(value.trim());
  const isNo = (value) => /^(no|n|not now|nope)$/i.test(value.trim());
  const isSkip = (value) => /^(skip|no phone|prefer not|rather not|email only)$/i.test(value.trim());
  const isBye = (value) => /\b(bye|goodbye|see you|talk to you later|thanks bye)\b/i.test(value);
  const wantsStaffConnection = (value) => {
    const text = value.toLowerCase();
    const hasDirectIntent = /\b(connect|contact|reach|call me|follow up|follow-up|appointment|book|schedule)\b/.test(
      text
    );
    const hasTalkToProviderIntent =
      /\b(talk to|speak to)\b/.test(text) && /\b(dr\.?|doctor|physician|staff|someone)\b/.test(text);
    return hasDirectIntent || hasTalkToProviderIntent;
  };

  const resetHandoff = () => {
    handoff.active = false;
    handoff.step = "idle";
    handoff.lead = {
      contactMethod: "",
      phone: customer.phone || "",
      preferredTime: "",
    };
  };

  const submitLead = async () => {
    const payload = {
      name: customer.name,
      email: customer.email,
      phone: handoff.lead.phone || "(not provided)",
      interest: "Requested staff consultation via chatbot",
      preferredTime: handoff.lead.preferredTime || "",
      message: `Preferred contact method: ${handoff.lead.contactMethod}`,
      consentToContact: true,
      website: "",
    };

    const res = await fetch(toApi("/api/intake"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Unable to submit request right now.");
    }

    return data;
  };

  const startHandoffFlow = () => {
    handoff.active = true;
    handoff.step = "awaiting_opt_in";
    addMessage("assistant", `You can contact our staff directly at ${staffPhone} or ${staffEmail}.`);
    addMessage("assistant", "If you would like, I can send your details to our staff now.");
    addOptions([
      {
        label: "Yes",
        onClick: () => {
          addMessage("user", "Yes");
          handleHandoffInput("yes");
        },
      },
      {
        label: "No",
        onClick: () => {
          addMessage("user", "No");
          handleHandoffInput("no");
        },
      },
    ]);
  };

  const handleHandoffInput = async (inputText) => {
    const text = inputText.trim();

    if (handoff.step === "awaiting_opt_in") {
      if (isNo(text)) {
        addMessage("assistant", "No problem. I am here whenever you are ready.");
        resetHandoff();
        return;
      }
      if (!isYes(text)) {
        addMessage("assistant", "Please reply Yes or No.");
        return;
      }
      handoff.step = "awaiting_method";
      addMessage("assistant", "How would you like our staff to contact you?");
      addOptions([
        {
          label: "Email",
          onClick: () => {
            addMessage("user", "Email");
            handleHandoffInput("email");
          },
        },
        {
          label: "Phone",
          onClick: () => {
            addMessage("user", "Phone");
            handleHandoffInput("phone");
          },
        },
      ]);
      return;
    }

    if (handoff.step === "awaiting_method") {
      if (/^email$/i.test(text)) {
        handoff.lead.contactMethod = "email";
        handoff.lead.phone = customer.phone || handoff.lead.phone;
        if (handoff.lead.phone) {
          try {
            const data = await submitLead();
            addMessage(
              "assistant",
              data.emailStatus?.delivered
                ? `Done. I sent your request to our staff, and they will reach you by email at ${customer.email}.`
                : `I saved your request and our staff can contact you by email at ${customer.email}.`
            );
          } catch (error) {
            addMessage("assistant", error.message || "Unable to submit request right now.");
          }
          resetHandoff();
          return;
        }
        handoff.step = "awaiting_optional_phone";
        addMessage(
          "assistant",
          `Got it. We will use email as your preferred contact method at ${customer.email}. Please share a phone number as an optional backup contact, or type Skip.`
        );
        return;
      }

      if (/^phone$/i.test(text)) {
        handoff.lead.contactMethod = "phone";
        if (customer.phone) {
          handoff.lead.phone = customer.phone;
          handoff.step = "awaiting_phone_consent";
          addMessage("assistant", `Do you consent for our staff to call you at ${customer.phone}?`);
          addOptions([
            {
              label: "I Consent",
              onClick: () => {
                addMessage("user", "I consent");
                handleHandoffInput("yes");
              },
            },
            {
              label: "No",
              onClick: () => {
                addMessage("user", "No");
                handleHandoffInput("no");
              },
            },
          ]);
          return;
        }
        handoff.step = "awaiting_phone";
        addMessage("assistant", "Please share the best phone number to reach you.");
        return;
      }

      addMessage("assistant", "Please choose Email or Phone.");
      return;
    }

    if (handoff.step === "awaiting_optional_phone") {
      if (isSkip(text)) {
        handoff.lead.phone = "(not provided)";
      } else {
        const digits = text.replace(/\D/g, "");
        if (digits.length < 10) {
          addMessage("assistant", "Please enter a valid phone number including area code, or type Skip.");
          return;
        }
        handoff.lead.phone = text;
      }

      try {
        const data = await submitLead();
        addMessage(
          "assistant",
          data.emailStatus?.delivered
            ? `Done. I sent your request to our staff, and they will reach you by email at ${customer.email}.`
            : `I saved your request and our staff can contact you by email at ${customer.email}.`
        );
      } catch (error) {
        addMessage("assistant", error.message || "Unable to submit request right now.");
      }
      resetHandoff();
      return;
    }

    if (handoff.step === "awaiting_phone") {
      const digits = text.replace(/\D/g, "");
      if (digits.length < 10) {
        addMessage("assistant", "Please enter a valid phone number including area code.");
        return;
      }
      handoff.lead.phone = text;
      handoff.step = "awaiting_phone_consent";
      addMessage("assistant", "Do you consent for our staff to call you at that number?");
      addOptions([
        {
          label: "I Consent",
          onClick: () => {
            addMessage("user", "I consent");
            handleHandoffInput("yes");
          },
        },
        {
          label: "No",
          onClick: () => {
            addMessage("user", "No");
            handleHandoffInput("no");
          },
        },
      ]);
      return;
    }

    if (handoff.step === "awaiting_phone_consent") {
      if (!isYes(text)) {
        addMessage("assistant", "Understood. I will not submit a call request without your consent.");
        resetHandoff();
        return;
      }
      handoff.step = "awaiting_preferred_time";
      addMessage("assistant", "What is your preferred time to receive the call?");
      return;
    }

    if (handoff.step === "awaiting_preferred_time") {
      handoff.lead.preferredTime = text;
      try {
        const data = await submitLead();
        addMessage(
          "assistant",
          data.emailStatus?.delivered
            ? "Done. I sent your request to our staff, and they will contact you by phone."
            : "I saved your request and our staff will follow up with you by phone."
        );
      } catch (error) {
        addMessage("assistant", error.message || "Unable to submit request right now.");
      }
      resetHandoff();
    }
  };

  const ask = async () => {
    const question = qInput.value.trim();
    if (!question) return;

    qInput.value = "";
    addMessage("user", question);
    history.push({ role: "user", content: question });

    if (isBye(question)) {
      addMessage("assistant", `Goodbye ${customer.name || ""}. ${welcomeMessage}`);
      history.push({ role: "assistant", content: `Goodbye. ${welcomeMessage}` });
      return;
    }

    if (handoff.active) {
      await handleHandoffInput(question);
      return;
    }

    if (wantsStaffConnection(question)) {
      startHandoffFlow();
      return;
    }

    try {
      const res = await fetch(toApi("/api/chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, history, conversationId }),
      });
      const data = await res.json();
      const answer = data.answer || data.error || "No response.";
      addMessage("assistant", answer, data.citationDetails || []);
      history.push({ role: "assistant", content: answer });

      // Widget owns guided staff handoff. If backend intake was attempted but not submitted,
      // switch to our step-by-step flow instead of asking for all fields at once.
      if (data.intake?.attempted && !data.intake?.submitted && !handoff.active) {
        startHandoffFlow();
        return;
      }

      if (data.intake?.submitted) {
        const statusMessage = data.intake?.delivered
          ? "Your consultation request was sent to our staff."
          : "Your request was saved. Our staff will follow up soon.";
        addMessage("assistant", `[Intake] ${statusMessage}`);
        history.push({ role: "assistant", content: `[Intake] ${statusMessage}` });
      }
    } catch {
      addMessage("assistant", "I could not reach the assistant right now. Please try again.");
    }
  };

  askBtn.addEventListener("click", ask);
  qInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      ask();
    }
  });

  const setPanelOpen = (open) => {
    panel.style.display = open ? "block" : "none";
  };

  const isPanelOpen = () => panel.style.display === "block";

  toggle.addEventListener("click", () => {
    setPanelOpen(!isPanelOpen());
  });
  closeHeadBtn.addEventListener("click", () => {
    setPanelOpen(false);
  });

  if (Number.isFinite(autoOpenMs) && autoOpenMs > 0) {
    globalThis.setTimeout(() => {
      if (!isPanelOpen()) {
        setPanelOpen(true);
      }
    }, autoOpenMs);
  }

  if (toggleIcon && iconCandidates.length) {
    let idx = 0;
    const loadNext = () => {
      if (idx >= iconCandidates.length) return;
      toggleIcon.src = iconCandidates[idx];
      idx += 1;
    };
    toggleIcon.addEventListener("error", loadNext);
    loadNext();
  }

  renderInlineOnboarding();
})();
