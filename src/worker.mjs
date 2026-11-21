// Card Blueprint Daily: API Worker.
// Accounts (email + password), per-user storage in D1, and a chat endpoint that
// builds each answer's context with the Card Blueprints engine and streams it
// from Claude Haiku. Static files in /public are served by the assets binding.

import { CardBlueprints as CB } from "../vendor/engine.mjs";
import { makeBrain } from "../shared/brain.mjs";

const SESSION_DAYS = 30;
const COOKIE = "cb_session";
const PBKDF2_ITERATIONS = 100000; // the Workers runtime maximum
const MAX_PEOPLE = 24;
const MAX_TOOL_ROUNDS = 4;

// --- small helpers -------------------------------------------------------------

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const unhex = (s) => new Uint8Array(s.match(/.{2}/g).map((h) => parseInt(h, 16)));
const randomHex = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));
const nowIso = () => new Date().toISOString();
const nowSec = () => Math.floor(Date.now() / 1000);
const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z")) && new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s;

class HttpError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });
}

async function readJson(request) {
  if (!(request.headers.get("content-type") || "").includes("application/json")) throw new HttpError(415, "Send JSON.");
  const text = await request.text();
  if (text.length > 20000) throw new HttpError(413, "That request is too large.");
  try { const v = JSON.parse(text); if (v && typeof v === "object") return v; } catch {}
  throw new HttpError(400, "That request wasn't valid JSON.");
}

async function sha256(text) { return hex(await crypto.subtle.digest("SHA-256", enc.encode(text))); }

async function hashPassword(password, saltHex) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: unhex(saltHex), iterations: PBKDF2_ITERATIONS }, key, 256);
  return hex(bits);
}

function sameString(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** The user's local calendar date, accepted only within a day of the server's UTC date. */
function clientDay(value) {
  const utc = nowIso().slice(0, 10);
  if (!isDate(value)) return utc;
  const off = Math.abs(Date.parse(value + "T00:00:00Z") - Date.parse(utc + "T00:00:00Z"));
  return off <= 86400000 ? value : utc;
}

function ageOn(birthdate, day) {
  const [by, bm, bd] = birthdate.split("-").map(Number), [y, m, d] = day.split("-").map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

/** Throws a friendly error when the engine has no cards for a birthday. */
function checkBirthdate(birthdate, label) {
  if (!isDate(birthdate) || birthdate < "1900-01-01" || birthdate > nowIso().slice(0, 10)) throw new HttpError(400, `${label} needs a real date.`);
  if (birthdate.slice(5) === "12-31") throw new HttpError(400, "December 31 is the Joker. The Card Blueprints engine has no cards for that birthday yet.", "joker");
  try { CB.buildCardApp(birthdate, nowIso().slice(0, 10)); } catch (e) { throw new HttpError(400, `The engine couldn't read that birthday: ${e.message}`); }
}

// --- throttling ----------------------------------------------------------------

async function throttle(env, key, limit, windowSec) {
  const window = Math.floor(nowSec() / windowSec) * windowSec; // window start, unix seconds
  const row = await env.DB.prepare("INSERT INTO auth_attempts (key, window, count) VALUES (?, ?, 1) ON CONFLICT(key, window) DO UPDATE SET count = count + 1 RETURNING count").bind(key, window).first();
  if (row && row.count > limit) throw new HttpError(429, "Too many attempts. Wait a few minutes and try again.");
}

// --- sessions ------------------------------------------------------------------

function cookieHeader(token, maxAge, request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

async function startSession(env, userId, request) {
  const token = randomHex(32);
  await env.DB.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").bind(await sha256(token), userId, nowSec() + SESSION_DAYS * 86400).run();
  return cookieHeader(token, SESSION_DAYS * 86400, request);
}

function sessionToken(request) {
  const m = (request.headers.get("cookie") || "").match(new RegExp("(?:^|;\\s*)" + COOKIE + "=([a-f0-9]{64})"));
  return m ? m[1] : null;
}

async function currentUser(env, request) {
  const token = sessionToken(request);
  if (!token) return null;
  return env.DB.prepare("SELECT u.id, u.email, u.name, u.birthdate, u.sub_status, u.sub_period_end, u.subscription_id FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?").bind(await sha256(token), nowSec()).first();
}

async function requireUser(env, request) {
  const user = await currentUser(env, request);
  if (!user) throw new HttpError(401, "Please sign in.");
  return user;
}

// --- subscription ----------------------------------------------------------------

const paywallOn = (env) => env.REQUIRE_SUBSCRIPTION !== "false";
const isSubscribed = (env, u) => !paywallOn(env) || u.sub_status === "active" || u.sub_status === "trialing";

function billing(env, u) {
  const link = env.STRIPE_PAYMENT_LINK || "";
  return {
    required: paywallOn(env),
    price: env.PRICE_LABEL || "$20 a month",
    dailyLimit: Number(env.DAILY_MESSAGE_LIMIT || 40),
    // client_reference_id ties the Stripe checkout back to this account in the webhook.
    payUrl: link ? `${link}${link.includes("?") ? "&" : "?"}client_reference_id=${u.id}&prefilled_email=${encodeURIComponent(u.email)}` : "",
    portalUrl: env.STRIPE_PORTAL_URL ? `${env.STRIPE_PORTAL_URL}${env.STRIPE_PORTAL_URL.includes("?") ? "&" : "?"}prefilled_email=${encodeURIComponent(u.email)}` : "",
  };
}

const publicUser = (env, u) => ({ name: u.name, email: u.email, birthdate: u.birthdate, subscribed: isSubscribed(env, u), status: u.sub_status || "none", renews: u.sub_period_end || null, billing: billing(env, u) });

/** Verifies Stripe's signature: HMAC-SHA256 of "<timestamp>.<raw body>" with the endpoint secret. */
async function verifyStripe(env, request, raw) {
  const header = request.headers.get("stripe-signature") || "";
  const t = (header.match(/(?:^|,)t=(\d+)/) || [])[1];
  const sigs = [...header.matchAll(/(?:^|,)v1=([a-f0-9]{64})/g)].map((m) => m[1]);
  if (!env.STRIPE_WEBHOOK_SECRET || !t || !sigs.length) return false;
  if (Math.abs(nowSec() - Number(t)) > 300) return false;
  const key = await crypto.subtle.importKey("raw", enc.encode(env.STRIPE_WEBHOOK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = hex(await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${raw}`)));
  return sigs.some((sig) => sameString(sig, expected));
}

async function stripeWebhook(env, request) {
  const raw = await request.text();
  if (!(await verifyStripe(env, request, raw))) return json({ error: "bad signature" }, 400);
  let event; try { event = JSON.parse(raw); } catch { return json({ error: "bad json" }, 400); }
  const o = (event.data && event.data.object) || {};

  if (event.type === "checkout.session.completed" && o.mode === "subscription") {
    const paid = o.payment_status === "paid" || o.payment_status === "no_payment_required";
    const email = String((o.customer_details && o.customer_details.email) || o.customer_email || "").toLowerCase();
    const ref = /^[a-f0-9]{32}$/.test(String(o.client_reference_id || "")) ? o.client_reference_id : null;
    const user = (ref && (await env.DB.prepare("SELECT id FROM users WHERE id = ?").bind(ref).first())) || (email && (await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first()));
    if (!user) { console.error("stripe checkout with no matching account", o.id); return json({ received: true, matched: false }); }
    await env.DB.prepare("UPDATE users SET stripe_customer_id = ?, subscription_id = ?, sub_status = CASE WHEN ? THEN 'active' ELSE sub_status END WHERE id = ?").bind(o.customer || null, o.subscription || null, paid ? 1 : 0, user.id).run();
  } else if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted" || event.type === "customer.subscription.created") {
    const status = event.type === "customer.subscription.deleted" ? "canceled" : String(o.status || "none");
    const end = o.current_period_end || (o.items && o.items.data && o.items.data[0] && o.items.data[0].current_period_end) || null;
    await env.DB.prepare("UPDATE users SET sub_status = ?, sub_period_end = ?, subscription_id = ? WHERE stripe_customer_id = ? AND (subscription_id IS NULL OR subscription_id = ? OR ? IN ('active', 'trialing'))").bind(status, end, o.id, o.customer || "", o.id, status).run();
  }
  return json({ received: true });
}

/** Stops billing before an account is deleted. Returns false when it could not be confirmed. */
async function cancelSubscription(env, subscriptionId) {
  if (!env.STRIPE_SECRET_KEY) return false;
  const res = await fetch(`${env.STRIPE_API_BASE || "https://api.stripe.com"}/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, { method: "DELETE", headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}` } });
  if (!res.ok) console.error("stripe cancel failed", res.status, (await res.text().catch(() => "")).slice(0, 200));
  return res.ok || res.status === 404;
}

// --- accounts ------------------------------------------------------------------

async function signup(env, request) {
  const ip = request.headers.get("cf-connecting-ip") || "local";
  await throttle(env, "signup-ip:" + ip, 10, 3600);
  const b = await readJson(request);
  const email = String(b.email || "").trim().toLowerCase();
  const name = String(b.name || "").trim().slice(0, 40);
  const password = String(b.password || "");
  const birthdate = String(b.birthdate || "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) throw new HttpError(400, "Enter a valid email address.");
  if (!name) throw new HttpError(400, "Enter your first name.");
  if (password.length < 10 || password.length > 200) throw new HttpError(400, "Use a password of at least 10 characters.");
  checkBirthdate(birthdate, "Your birthday");
  if (ageOn(birthdate, nowIso().slice(0, 10)) < 18) throw new HttpError(400, "You need to be 18 or older to use this app.");

  const salt = randomHex(16), id = randomHex(16);
  const hash = await hashPassword(password, salt);
  try {
    await env.DB.prepare("INSERT INTO users (id, email, pass_hash, pass_salt, name, birthdate, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(id, email, hash, salt, name, birthdate, nowIso()).run();
  } catch (e) {
    if (/UNIQUE/i.test(String(e && e.message))) throw new HttpError(409, "There's already an account with that email. Sign in instead.");
    throw e;
  }
  return json({ user: publicUser(env, { id, name, email, birthdate, sub_status: "none" }) }, 201, { "set-cookie": await startSession(env, id, request) });
}

async function login(env, request) {
  const ip = request.headers.get("cf-connecting-ip") || "local";
  const b = await readJson(request);
  const email = String(b.email || "").trim().toLowerCase();
  const password = String(b.password || "");
  await throttle(env, "login-ip:" + ip, 30, 900);
  await throttle(env, "login:" + email, 8, 900);
  const user = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
  // Hash even when the account doesn't exist so the response time doesn't reveal it.
  const hash = await hashPassword(password, user ? user.pass_salt : "00000000000000000000000000000000");
  if (!user || !sameString(hash, user.pass_hash)) throw new HttpError(401, "That email and password don't match.");
  return json({ user: publicUser(env, user) }, 200, { "set-cookie": await startSession(env, user.id, request) });
}

async function logout(env, request) {
  const token = sessionToken(request);
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
  return json({ ok: true }, 200, { "set-cookie": cookieHeader("", 0, request) });
}

async function deleteAccount(env, request, user) {
  const b = await readJson(request);
  const row = await env.DB.prepare("SELECT pass_hash, pass_salt FROM users WHERE id = ?").bind(user.id).first();
  if (!row || !sameString(await hashPassword(String(b.password || ""), row.pass_salt), row.pass_hash)) throw new HttpError(401, "That password isn't right.");
  if (user.subscription_id && (user.sub_status === "active" || user.sub_status === "trialing" || user.sub_status === "past_due")) {
    if (!(await cancelSubscription(env, user.subscription_id))) throw new HttpError(409, "You still have an active subscription. Cancel it first under Manage subscription, then delete your account.");
  }
  await env.DB.batch(["messages", "people", "usage", "sessions"].map((t) => env.DB.prepare(`DELETE FROM ${t} WHERE user_id = ?`).bind(user.id)).concat(env.DB.prepare("DELETE FROM users WHERE id = ?").bind(user.id)));
  return json({ ok: true }, 200, { "set-cookie": cookieHeader("", 0, request) });
}

// --- people --------------------------------------------------------------------

const listPeople = async (env, userId) => (await env.DB.prepare("SELECT id, name, birthdate, relation FROM people WHERE user_id = ? ORDER BY created_at, id").bind(userId).all()).results;

async function addPerson(env, request, user) {
  const b = await readJson(request);
  const name = String(b.name || "").trim().slice(0, 40);
  const relation = String(b.relation || "").trim().slice(0, 40);
  const birthdate = String(b.birthdate || "");
  if (!name) throw new HttpError(400, "Enter a name.");
  checkBirthdate(birthdate, "Their birthday");
  const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM people WHERE user_id = ?").bind(user.id).first();
  if (count.n >= MAX_PEOPLE) throw new HttpError(400, `The list holds ${MAX_PEOPLE} people. Remove someone first.`);
  await env.DB.prepare("INSERT INTO people (id, user_id, name, birthdate, relation, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(randomHex(8), user.id, name, birthdate, relation, nowIso()).run();
  return json({ people: await listPeople(env, user.id) }, 201);
}

// --- chat ----------------------------------------------------------------------

const sse = (event, data) => enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

/** One streamed call to the Messages API. Forwards text as it arrives; resolves the full assistant turn. */
async function callClaude(env, body, onText) {
  const res = await fetch((env.ANTHROPIC_BASE_URL || "https://api.anthropic.com") + "/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": env.ANTHROPIC_VERSION || "2026-10-21" },
    body: JSON.stringify({ ...body, stream: true }),
  });
  if (!res.ok || !res.body) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    console.error("anthropic error", res.status, detail);
    throw new HttpError(res.status === 429 || res.status === 529 ? 503 : 502, res.status === 429 || res.status === 529 ? "Claude is busy right now. Try again in a minute." : "Claude couldn't answer just now. Try again.");
  }
  const blocks = [];
  let stopReason = null, buffer = "";
  const reader = res.body.getReader(), dec = new TextDecoder();
  const handle = (ev) => {
    if (ev.type === "content_block_start") {
      const cb = ev.content_block;
      blocks[ev.index] = cb.type === "tool_use" ? { type: "tool_use", id: cb.id, name: cb.name, json: "" } : cb.type === "text" ? { type: "text", text: cb.text || "" } : { type: cb.type, skip: true };
    } else if (ev.type === "content_block_delta") {
      const blk = blocks[ev.index];
      if (!blk) return;
      if (ev.delta.type === "text_delta") { blk.text += ev.delta.text; onText(ev.delta.text); }
      else if (ev.delta.type === "input_json_delta") blk.json += ev.delta.partial_json;
    } else if (ev.type === "message_delta") {
      if (ev.delta && ev.delta.stop_reason) stopReason = ev.delta.stop_reason;
    } else if (ev.type === "error") {
      throw new HttpError(502, "Claude couldn't finish that answer. Try again.");
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += dec.decode(value, { stream: true });
    let cut;
    while ((cut = buffer.indexOf("\n\n")) >= 0) {
      const chunk = buffer.slice(0, cut); buffer = buffer.slice(cut + 2);
      const data = chunk.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("");
      if (!data) continue;
      let ev; try { ev = JSON.parse(data); } catch { continue; }
      handle(ev);
    }
  }
  const content = blocks.filter((b) => b && !b.skip).map((b) => {
    if (b.type !== "tool_use") return { type: "text", text: b.text };
    let input = {}; try { input = b.json ? JSON.parse(b.json) : {}; } catch {}
    return { type: "tool_use", id: b.id, name: b.name, input };
  }).filter((b) => b.type !== "text" || b.text);
  return { content, stopReason };
}

async function chat(env, request, user, ctx) {
  if (!isSubscribed(env, user)) throw new HttpError(402, "Asking questions is part of the subscription.", "subscribe");
  if (!env.ANTHROPIC_API_KEY) throw new HttpError(503, "The Claude API key isn't set up on the server yet.");
  const b = await readJson(request);
  const message = String(b.message || "").trim();
  if (!message) throw new HttpError(400, "Type a question first.");
  if (message.length > 2000) throw new HttpError(400, "Keep questions under 2,000 characters.");
  const day = clientDay(b.today);

  const limit = Number(env.DAILY_MESSAGE_LIMIT || 40);
  const used = await env.DB.prepare("INSERT INTO usage (user_id, day, count) VALUES (?, ?, 1) ON CONFLICT(user_id, day) DO UPDATE SET count = count + 1 RETURNING count").bind(user.id, day).first();
  if (used.count > limit) throw new HttpError(429, `You've asked ${limit} questions today, which is the daily limit. Your cards will be here tomorrow.`);

  // Everything Claude knows is computed here, on the server, from the engine.
  const brain = makeBrain(CB, user.birthdate, user.name);
  const state = brain.build(day);
  const ppl = await brain.people(state.app, await listPeople(env, user.id), day);
  const tools = brain.tools(ppl);

  const prior = (await env.DB.prepare("SELECT role, content FROM (SELECT id, role, content FROM messages WHERE user_id = ? AND day = ? ORDER BY id DESC LIMIT 16) ORDER BY id").bind(user.id, day).all()).results;
  const messages = [];
  for (const m of [...prior, { role: "user", content: message }]) {
    const last = messages[messages.length - 1];
    if (last && last.role === m.role) last.content += "\n\n" + m.content; else messages.push({ role: m.role, content: m.content });
  }
  while (messages.length && messages[0].role !== "user") messages.shift();
  await env.DB.prepare("INSERT INTO messages (user_id, day, role, content, created_at) VALUES (?, ?, 'user', ?, ?)").bind(user.id, day, message, nowIso()).run();

  const base = {
    model: env.CLAUDE_MODEL || "claude-haiku-5-5",
    max_tokens: 1024,
    system: [{ type: "text", text: brain.systemText(state, ppl), cache_control: { type: "ephemeral" } }],
    tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema })),
  };

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const send = (event, data) => writer.write(sse(event, data)).catch(() => {});

  const work = (async () => {
    let full = "";
    try {
      for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
        const turn = await callClaude(env, { ...base, messages }, (t) => { full += t; send("text", { delta: t }); });
        const calls = turn.content.filter((c) => c.type === "tool_use");
        if (turn.stopReason !== "tool_use" || !calls.length || round === MAX_TOOL_ROUNDS) break;
        messages.push({ role: "assistant", content: turn.content });
        messages.push({
          role: "user",
          content: calls.map((c) => {
            const tool = tools.find((t) => t.name === c.name);
            try {
              if (!tool) throw new Error("unknown tool");
              return { type: "tool_result", tool_use_id: c.id, content: JSON.stringify(tool.execute(c.input || {})).slice(0, 12000) };
            } catch (e) {
              return { type: "tool_result", tool_use_id: c.id, is_error: true, content: String((e && e.message) || e).slice(0, 500) };
            }
          }),
        });
        if (full && !/\s$/.test(full)) { full += "\n\n"; send("text", { delta: "\n\n" }); }
      }
      if (!full.trim()) throw new HttpError(502, "Claude didn't return an answer. Try again.");
      await env.DB.prepare("INSERT INTO messages (user_id, day, role, content, created_at) VALUES (?, ?, 'assistant', ?, ?)").bind(user.id, day, full.trim(), nowIso()).run();
      send("done", { remaining: Math.max(0, limit - used.count) });
    } catch (e) {
      if (!(e instanceof HttpError)) console.error("chat failed", e);
      // Keep any partial answer so the next question still has it as context.
      if (full.trim()) await env.DB.prepare("INSERT INTO messages (user_id, day, role, content, created_at) VALUES (?, ?, 'assistant', ?, ?)").bind(user.id, day, full.trim(), nowIso()).run().catch(() => {});
      send("error", { message: e instanceof HttpError ? e.message : "Something went wrong answering that. Try again." });
    } finally {
      writer.close().catch(() => {});
    }
  })();
  ctx.waitUntil(work);
  return new Response(readable, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
}

// --- router --------------------------------------------------------------------

async function api(request, env, ctx, url) {
  const path = url.pathname, method = request.method;
  if (path === "/api/stripe/webhook" && method === "POST") return stripeWebhook(env, request);
  // Browsers send Origin on cross-site writes; refuse any that isn't this site.
  if (method !== "GET") {
    const origin = request.headers.get("origin");
    if (origin && origin !== url.origin) throw new HttpError(403, "Cross-site requests aren't allowed.");
  }

  if (path === "/api/signup" && method === "POST") return signup(env, request);
  if (path === "/api/login" && method === "POST") return login(env, request);
  if (path === "/api/logout" && method === "POST") return logout(env, request);
  if (path === "/api/me" && method === "GET") {
    const u = await currentUser(env, request);
    return json({ user: u ? publicUser(env, u) : null });
  }

  const user = await requireUser(env, request);
  if (path === "/api/account" && method === "DELETE") return deleteAccount(env, request, user);
  if (path === "/api/people" && method === "GET") return json({ people: await listPeople(env, user.id) });
  if (path === "/api/people" && method === "POST") return addPerson(env, request, user);
  const pm = path.match(/^\/api\/people\/([a-f0-9]{16})$/);
  if (pm && method === "DELETE") {
    await env.DB.prepare("DELETE FROM people WHERE id = ? AND user_id = ?").bind(pm[1], user.id).run();
    return json({ people: await listPeople(env, user.id) });
  }
  if (path === "/api/messages" && method === "GET") {
    const rows = (await env.DB.prepare("SELECT role, content, day FROM (SELECT id, role, content, day FROM messages WHERE user_id = ? ORDER BY id DESC LIMIT 60) ORDER BY id").bind(user.id).all()).results;
    return json({ messages: rows });
  }
  if (path === "/api/messages" && method === "DELETE") {
    await env.DB.prepare("DELETE FROM messages WHERE user_id = ?").bind(user.id).run();
    return json({ ok: true });
  }
  if (path === "/api/chat" && method === "POST") return chat(env, request, user, ctx);
  throw new HttpError(404, "Not found.");
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    try {
      return await api(request, env, ctx, url);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message, code: e.code }, e.status);
      console.error("unhandled", e);
      return json({ error: "Something went wrong on the server." }, 500);
    }
  },

  // Daily cleanup of expired sessions and old throttle rows.
  async scheduled(_event, env) {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(nowSec()),
      env.DB.prepare("DELETE FROM auth_attempts WHERE window < ?").bind(nowSec() - 2 * 3600),
      env.DB.prepare("DELETE FROM usage WHERE day < ?").bind(new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)),
    ]);
  },
};
