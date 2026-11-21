# Card Blueprint Daily

A mobile web app: people sign up with their birthday, see the cards the Card Blueprints
engine computes for them today, keep a list of important people, get alerts on shared
card days, and ask Claude Haiku 5.5 anything about their day.

## How it is put together

| Part | Where | What it does |
|---|---|---|
| App (phone UI) | `public/` | Sign-up / sign-in, card strip, chat, people, account. Installable to the home screen. |
| API | `src/worker.mjs` | Cloudflare Worker. Accounts, sessions, people, chat history, daily limit, Claude calls. |
| Database | `migrations/0001_init.sql` | Cloudflare D1: users, sessions, people, messages, usage. |
| Engine | `vendor/engine.mjs` | The cardblueprints.com engine and copy libraries, bundled unmodified from `cardology-mirror`. |
| Assistant logic | `shared/brain.mjs` | Builds the per-user card briefing and the engine tools. Runs on the server for chat and in the browser for the card strip and alerts. |

The Claude API key lives only on the server. For every question the Worker computes that
user's cards for their local date, sends them to `claude-haiku-5-5` as the system prompt,
lets Claude call the engine for other dates / years / cards / people, and streams the answer back.

## API

| Method and path | Purpose |
|---|---|
| `POST /api/signup` | `{name, email, password, birthdate}`. Creates the account and signs in. 18+ only; Dec 31 is refused (Joker). |
| `POST /api/login`, `POST /api/logout`, `GET /api/me` | Session cookie (HttpOnly, 30 days). |
| `GET /api/people`, `POST /api/people`, `DELETE /api/people/:id` | Important people (max 24). |
| `GET /api/messages`, `DELETE /api/messages` | Chat history. |
| `POST /api/chat` | Subscribers only (402 otherwise). `{message, today}`. Server-sent events: `text` deltas, then `done` or `error`. |
| `DELETE /api/account` | `{password}`. Cancels any active subscription, then deletes the account and all of its data. |
| `POST /api/stripe/webhook` | Stripe only (signature-verified). Keeps subscription status in step. |

## Deploy (about 10 minutes, needs your Cloudflare login and an Anthropic API key)

```bash
npm install
npx wrangler login
npx wrangler d1 create cardblueprint-daily      # paste the printed database_id into wrangler.toml
npm run db:remote                               # creates the tables
npx wrangler secret put ANTHROPIC_API_KEY       # paste your key from platform.claude.com
npm run deploy                                  # prints your https://cardblueprint-daily.<you>.workers.dev URL
```

## Turn on the $20/month subscription (Stripe)

Cards, alerts and the people list are free. Asking questions needs an active subscription
(up to `DAILY_MESSAGE_LIMIT` = 40 questions a day). Until the steps below are done, the
Subscribe button says subscriptions aren't open yet and nobody can ask questions.

1. In the Stripe account you want to use, create a **Payment Link** for a recurring product at
   **$20.00 / month**. Under "After payment", redirect to `https://<your app address>/?paid=1`.
   Paste the link (`https://buy.stripe.com/...`) into `STRIPE_PAYMENT_LINK` in `wrangler.toml`.
2. Add a **webhook endpoint** in Stripe: `https://<your app address>/api/stripe/webhook`, events
   `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`. Then `npx wrangler secret put STRIPE_WEBHOOK_SECRET` with its `whsec_...` secret.
3. Turn on the **customer portal** (Settings > Billing > Customer portal), copy its login link into
   `STRIPE_PORTAL_URL`. This is how subscribers update their card or cancel.
4. Create a **restricted API key** with write access to Subscriptions only and
   `npx wrangler secret put STRIPE_SECRET_KEY`. It is used for one thing: cancelling the
   subscription when someone deletes their account. Without it, account deletion is refused
   while a subscription is active.
5. `npm run db:remote && npm run deploy`.

The app adds `client_reference_id=<account id>` to the payment link, and the webhook uses it
(or the checkout email) to mark the right account active. `REQUIRE_SUBSCRIPTION = "false"`
turns the paywall off.

To put it on your own domain (for example `app.cardblueprints.com`), add a custom domain to
the Worker in the Cloudflare dashboard. This is a separate Worker; it does not touch the
`cardology-mirror` Pages project.

## Run locally

```bash
cp .dev.vars.example .dev.vars    # put a real key in it
npm run db:local
npm run dev                       # http://localhost:8787
```

`test/mock-claude.mjs` is a stand-in for the Claude API (set `ANTHROPIC_BASE_URL=http://127.0.0.1:8788`
in `.dev.vars`) and `test/browser.py` drives the whole app in a phone-size browser.

## Settings (`wrangler.toml`)

- `CLAUDE_MODEL`: `claude-haiku-5-5`.
- `ANTHROPIC_VERSION`: `2026-10-21`.
- `DAILY_MESSAGE_LIMIT`: questions per subscriber per day (40).
- `REQUIRE_SUBSCRIPTION`, `PRICE_LABEL`, `STRIPE_PAYMENT_LINK`, `STRIPE_PORTAL_URL`: see the Stripe section.

## Updating the engine

When card copy or engine code changes in `cardology-mirror`, rebuild both bundles
(paths at the top of `vendor/engine-entry.ts`), then redeploy:

```bash
bun build vendor/engine-entry.ts --outfile vendor/engine.mjs --format esm --minify --target browser
npm run build:client
```

## Not built yet

- Password reset and email verification (both need an email-sending service).
- Push or email alerts for shared card days (alerts show inside the app).
- Terms and privacy pages. You store emails, birthdays and other people's birthdays, so publish these before sharing the link.
