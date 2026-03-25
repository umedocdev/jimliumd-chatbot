# Clinic AI Agent Starter

This project gives you a production-ready starting point for a clinic website assistant that can:

1. Crawl your website pages and build a searchable knowledge base.
2. Answer patient questions using only your clinic content.
3. Collect consultation requests and email office staff.
4. Send consultation requests to Google Chat webhook.

## Architecture

- `POST /api/ingest`: crawls your clinic website, chunks text, creates embeddings, stores data in `data/knowledge.json`.
- `POST /api/chat`: retrieves relevant chunks and uses OpenAI Responses API to answer questions with deduped citations.
- `POST /api/chat`: can auto-submit consultation intake when patient gives name/email/phone/interest plus explicit consent in chat.
- `POST /api/intake`: validates patient lead form, requires consent, applies honeypot spam protection and IP rate limit, stores in `data/leads.json`, and sends notifications through SMTP and/or Google Chat webhook.
- `public/clinic-widget.js`: embeddable floating assistant widget for live websites.

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Configure environment:

```bash
copy .env.example .env
```

Fill in:
- `OPENAI_API_KEY`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`
- `STAFF_EMAIL`, `FROM_EMAIL`
- `GOOGLE_CHAT_WEBHOOK_URL` (optional)

3. Start server:

```bash
npm run dev
```

Run tests:

```bash
npm test
```

4. Open browser:

- `http://localhost:3000`

## API Examples

### Ingest website

```bash
curl -X POST http://localhost:3000/api/ingest \
  -H "Content-Type: application/json" \
  -d '{"startUrl":"https://yourclinic.com","maxPages":25}'
```

### Ask a question

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"question":"Do you offer weight loss programs?"}'
```

### Auto-submit intake via chat

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"conversationId":"demo-1","history":[{"role":"user","content":"Please schedule consultation. My name is Jane Doe. Email jane@example.com. Phone 555-111-2222. I am interested in longevity medicine. I consent to be contacted."}],"question":"Please schedule consultation."}'
```

### Submit consultation request

```bash
curl -X POST http://localhost:3000/api/intake \
  -H "Content-Type: application/json" \
  -d '{"name":"Jane Doe","email":"jane@example.com","phone":"555-111-2222","interest":"Hormone program","consentToContact":true,"website":""}'
```

Response includes per-channel delivery:
- `emailStatus.email.delivered`
- `emailStatus.googleChat.delivered`

## Embed on Your Website

Add this before your closing `</body>` tag on your website:

```html
<script
  src="https://YOUR_AGENT_DOMAIN/clinic-widget.js"
  data-api-base="https://YOUR_AGENT_DOMAIN"
  data-assistant-name="Jim Liu MD Assistant"
  data-accent="#0b6b61"
  data-auto-open-ms="10000"
  data-show-sources="false"
  data-staff-phone="(239) 524-0125"
  data-staff-email="info@jimliumd.com"
  defer
></script>
```

Notes:
- `data-api-base` should point to where this API is hosted.
- If your website and API are different domains, enable CORS on this server.
- Widget includes consultation form consent checkbox and hidden honeypot field by default.

## Important Compliance Notes

- Do not store or email sensitive medical records in plain text.
- For HIPAA workflows, use HIPAA-eligible hosting, encrypted storage, secure staff inboxes, and legal review.
- Add a visible consent notice before collecting patient information.

## Next Improvements

1. Replace local `knowledge.json` with OpenAI Vector Store for scale.
2. Add authenticated admin page for re-ingest and lead review.
3. Add appointment API integration (Athena, eClinicalWorks, etc.).
4. Add CAPTCHA and signed webhook delivery for intake.

## Deploy to AWS Lambda + S3 (SAM)

This repo now supports Lambda + S3 persistence:
- API handler: `src/lambda.js`
- Scheduled ingest handler: `src/lambdaIngest.js`
- SAM template: `template.yaml`

### Prerequisites

- AWS CLI configured
- AWS SAM CLI installed
- Node.js 22+

Verify tools:

```bash
aws sts get-caller-identity
sam --version
```

### 1) Configure deploy parameters

Edit `samconfig.toml`:

- `prod.deploy.parameters.parameter_overrides`
- Replace all `REPLACE_ME` values (`OpenAIApiKey`, SMTP, emails, etc.)
- Optional: set `GoogleChatWebhookUrl` (or leave empty)

### 2) Build and deploy

```bash
sam build
sam deploy --config-env prod
```

If stack is stuck in `ROLLBACK_COMPLETE`, delete then redeploy:

```bash
aws cloudformation delete-stack --stack-name jmliumd-agent --region us-east-1
aws cloudformation wait stack-delete-complete --stack-name jmliumd-agent --region us-east-1
sam deploy --config-env prod
```

### 3) Validate deployment

Get stack outputs:

```bash
aws cloudformation describe-stacks --stack-name jmliumd-agent --query "Stacks[0].Outputs"
```

Open health endpoint:

- `https://<HttpApiUrl>/api/health`

### 4) Run first ingestion once (important)

Scheduled ingestion runs daily, but initialize immediately:

```bash
sam remote invoke IngestFunction --stack-name jmliumd-agent --region us-east-1
```

### Storage

- `template.yaml` already sets `STORAGE_BACKEND=s3`
- Stack creates S3 bucket automatically (`AgentDataBucket`)
- Data is stored in S3 keys:
  - `clinic-ai/knowledge.json`
  - `clinic-ai/leads.json`

### 5) WordPress Embed (Production)

After deploy, use `HttpApiUrl` output as `YOUR_AGENT_API_URL`:

```html
<script
  src="https://e1jywbequ6.execute-api.us-east-1.amazonaws.com/clinic-widget.js"
  data-api-base="https://e1jywbequ6.execute-api.us-east-1.amazonaws.com"
  data-assistant-name="Jim Liu MD Assistant"
  data-accent="#0b6b61"
  data-auto-open-ms="10000"
  data-show-sources="false"
  data-staff-phone="(239) 524-0125"
  data-staff-email="info@jimliumd.com"
  defer
></script>
```

### Notes

- `template.yaml` now uses CloudFormation parameters instead of Secrets Manager JSON.
- `template.yaml` currently sets `CORS_ORIGIN` from parameter `CorsOrigin` (default `https://jimliumd.com`).
- Rotate credentials immediately if any secret values are exposed.

## Release Checklist

Use this quick checklist for future updates.

### A) Update variables only

1. Edit `samconfig.toml`:
   - `[prod.deploy.parameters].parameter_overrides`
2. Deploy:

```bash
sam build
sam deploy --config-env prod
```

### B) Deploy code changes

```bash
sam build
sam deploy --config-env prod
```

Validate:
- Open `https://<HttpApiUrl>/api/health`
- Test one chat question and one intake submission

### C) Refresh website knowledge (after content changes)

```bash
sam remote invoke IngestFunction --stack-name jmliumd-agent --region us-east-1
```

### D) WordPress widget check

Ensure your WordPress embed snippet still points to current API URL:

```html
<script
  src="https://YOUR_HTTP_API_URL/clinic-widget.js"
  data-api-base="https://YOUR_HTTP_API_URL"
  data-assistant-name="Jim Liu MD Assistant"
  data-accent="#0b6b61"
  data-auto-open-ms="10000"
  data-show-sources="false"
  data-staff-phone="(239) 524-0125"
  data-staff-email="info@jimliumd.com"
  defer
></script>
```
