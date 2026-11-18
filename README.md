# ViralChat AI

**Turn conversations into customers automatically.**
AI-powered Instagram & Facebook Messenger automation, unified inbox and CRM. This repository contains the **Phase 1 MVP**.

## What's in Phase 1

| Area | What works |
| --- | --- |
| Auth & workspaces | Email/password sign-up (bcrypt, DB-backed sessions in httpOnly cookies), onboarding, multiple workspaces (Business+), owner/admin/staff roles, invite links, workspace switching |
| Instagram & Messenger | Official Meta OAuth (Facebook Login for Business), Page + linked Instagram professional account selection, webhook subscription, signed webhook ingestion (`X-Hub-Signature-256`), DMs, story replies/mentions, post & Reel comments, private replies, public comment replies, 24-hour window + `HUMAN_AGENT` tag enforcement |
| Automation builder | Drag-and-drop flow editor (React Flow) with triggers (DM keyword, comment keyword, story reply, new conversation) and steps: send message, ask question (waits for reply), condition (Yes/No), delay, tags, custom fields, lead score, pipeline stage, AI reply, notify team, human handoff, webhook, end. Validation, test-mode simulator, per-run step logs |
| Templates | 10 installable templates (Comment-to-DM, Welcome bot, AI support, Lead qualification, Booking funnel, Story reply, Real estate, Church visitor, Restaurant, Product launch) |
| AI chatbot | OpenAI-powered assistant with name, tone, personality, objective, booking link, language, handoff keywords; knowledge base (FAQ/text/pricing/policy, .txt/.md upload, web page import); guardrails against invented prices/discounts; handoff when unsure; live preview |
| Unified inbox | Instagram + Messenger threads, assignment, status, priority, labels, internal notes, saved replies, AI-suggested replies, human takeover (pauses bots), delivery errors surfaced per message |
| CRM | Contacts with tags, custom fields, notes, activity timeline, owner, lead score → Hot/Warm/Cold, pipeline stages (Kanban drag & drop), search/filters, CSV import (dedupes by email) & export, duplicate detection + merge, per-contact JSON data export and deletion |
| Analytics | Contacts, new leads, active conversations, automated/AI messages, response rate, workflow completion, lead sources, daily volume chart, 7/30/90-day ranges, CSV report |
| Billing | $47/month plan with a 30-day free trial via Stripe Checkout, Billing Portal, signed webhook syncing status, app locked without an active or trialing subscription, add-on ready, usage meters |
| Demo mode | Clearly labelled sample contacts/conversations; demo messages are never sent externally; "send as customer" to see automations/AI respond |

Phase 2/3 items (email, SMS, booking, landing pages, campaigns, WhatsApp, TikTok, e-commerce, agency/white-label) appear in the navigation as **Coming soon** and are not simulated.

## Stack

Next.js 16 (App Router, Server Actions) · React 19 · TypeScript · Tailwind CSS v4 with shadcn-style components · PostgreSQL + Drizzle ORM · OpenAI · Stripe · React Flow · Recharts · Vitest

## Getting started

```bash
cp .env.example .env          # fill in values (see below)
npm install
npm run db:migrate            # applies drizzle/ migrations to DATABASE_URL

> On Vercel, the `vercel-build` script runs `drizzle-kit migrate` automatically before `next build` whenever `DATABASE_URL` is set, so every deploy applies pending migrations.
npm run dev                   # http://localhost:3000
npm test                      # unit tests (engine, webhook parsing, crypto, CSV, AI prompt)
```

### Environment variables

| Variable | Needed for |
| --- | --- |
| `DATABASE_URL` | Postgres connection |
| `APP_URL` | Public base URL for OAuth redirects, Stripe return URLs and the webhook URL |
| `ENCRYPTION_KEY` | 32-byte base64 key (`openssl rand -base64 32`). Encrypts Page tokens and API keys (AES-256-GCM) |
| `CRON_SECRET` | Protects `/api/cron/automations` |
| `META_APP_ID`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, `META_GRAPH_VERSION` | Instagram & Messenger |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | Platform AI key (workspaces can also add their own on the Integrations page) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO` | The $47/month ViralChat Pro subscription. While `STRIPE_SECRET_KEY` is unset the app stays open to everyone |

The app runs without the optional integrations: each screen says exactly what is missing, and nothing is reported as connected until a real account is linked.

### Meta app setup (Instagram + Messenger)

1. Create a **Business** app at developers.facebook.com. Add **Facebook Login for Business**, **Messenger** and **Instagram** (Instagram API with Facebook Login).
2. Valid OAuth redirect URI: `${APP_URL}/api/integrations/meta/callback`.
3. Webhooks: callback `${APP_URL}/api/webhooks/meta`, verify token = `META_WEBHOOK_VERIFY_TOKEN`.
   - **Page** object: `messages`, `messaging_postbacks`, `feed`
   - **Instagram** object: `messages`, `messaging_postbacks`, `comments`
4. Permissions used: `pages_show_list, pages_manage_metadata, pages_messaging, pages_read_engagement, pages_manage_engagement, instagram_basic, instagram_manage_messages, instagram_manage_comments, business_management`. Accounts that aren't app testers need **Advanced Access** via App Review. Use `/privacy`, `/terms` and `/data-deletion` (templates, have them reviewed) for the review.
5. The Instagram account must be a professional account linked to the Facebook Page, with *Allow access to messages* enabled.

### Stripe setup

ViralChat sells one base plan, **ViralChat Pro at $47/month with a 30-day free trial** (card collected up front, one trial per workspace). Create a product with a $47 monthly recurring price and put its id in `STRIPE_PRICE_PRO`. Turn on the Billing Portal (allow cancel and payment method updates), and add a webhook endpoint at `${APP_URL}/api/webhooks/stripe` for `checkout.session.completed` and `customer.subscription.created|updated|deleted`.

Once `STRIPE_SECRET_KEY` is set, every workspace needs an active, trialing or past-due subscription to use the app; others land on `/subscribe`. Workspaces with `billing_exempt = true` (all workspaces that existed before billing shipped) keep full access for free.

**Add-ons:** add an entry to `ADDONS` in `src/lib/plans.ts` with its own recurring Stripe price. Extra subscription items with that price are recorded in `workspaces.addons` by the webhook and can raise plan limits through `extraLimits`.

### Scheduler

Delays and question time-outs are resumed by `GET /api/cron/automations` with `Authorization: Bearer $CRON_SECRET`. Call it every minute. `vercel.json` ships a once-a-day entry because Vercel's Hobby plan rejects more frequent crons; on Vercel Pro change it to `* * * * *`, or point an external scheduler (e.g. cron-job.org) at the endpoint every minute.

## Architecture notes

- **Workspace isolation**: every query is scoped by `workspace_id` taken from the server-side session (`requireWorkspace`); roles are checked server-side for every mutation.
- **Webhooks** are verified, acknowledged immediately, and processed with `after()`. Inbound messages are de-duplicated by a unique `(conversation_id, external_id)` index; comments and Stripe events via `webhook_events`.
- **Automation engine** (`src/lib/engine`): a pure executor (`executor.ts`, unit-tested with fake side effects) and a runtime that wires DB/Meta/AI and persists run state (`waiting` for a reply or timer). For higher volume, move `processDueRuns` and webhook processing to a queue/worker (Trigger.dev, Temporal or BullMQ on Redis); the executor is designed to drop into either.
- **Rate limiting** is in-memory (`src/lib/rate-limit.ts`); swap in Redis when running more than one instance.
- **Audit log** records sign-ins, integration changes, exports, deletions, role changes and billing events.
