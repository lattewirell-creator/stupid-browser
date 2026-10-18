/* The Stupid Browser for Mac: Buddy (the AI helper) and Rewind (the visual timeline). Same behaviour as
 * src/buddy-main.js and src/rewind-main.js; PROVIDERS, CLAUDE_MODELS, SYSTEM_TEXT, MAX_TURNS, validBase,
 * MAX_ITEMS and SENSITIVE come verbatim from them via core-gen.js. Requests go out through the Mac app
 * (nativeFetch), screenshots of a tab come from the Mac app (host "tabShot"). */
"use strict";

/* ---------------- Buddy ---------------- */
const systemPrompt = () => SYSTEM_TEXT.replace("{NAME}", ((getSettings().buddyLook || {}).name || "Buddy").replace(/[^\p{L}\p{N} ._'-]/gu, "").slice(0, 20) || "Buddy");
const buddyChats = new Map();   // window id -> { provider, model, messages, controller }
// keys: { anthropic: 'k:…', openai: 'k:…', … } (older versions stored a single Claude key as { key })
const keyFile = () => { const k = store.read("buddy-key.json", {}); if (k.key && !k.keys) return { keys: { anthropic: k.key } }; return { keys: Object.assign({}, k.keys || {}) }; };
const getKey = (p) => dec(keyFile().keys[p] || "");
const hasKey = (p) => !!keyFile().keys[p];
const buddyCfg = () => {
  const b = getSettings().buddy || {};
  const provider = PROVIDERS[b.provider] ? b.provider : "anthropic";
  const models = b.models || {};
  const model = models[provider] || (provider === "anthropic" ? (CLAUDE_MODELS[b.model] ? b.model : "claude-opus-5-5") : "");
  const base = provider === "custom" || provider === "ollama" ? (validBase((b.bases || {})[provider] || "") || PROVIDERS[provider].base) : PROVIDERS[provider].base;
  return { enabled: b.enabled !== false, provider, model, base };
};
const buddyStatus = () => {
  const c = buddyCfg(); const P = PROVIDERS[c.provider];
  const has = hasKey(c.provider);
  const ready = c.enabled && (P.key === true ? has : true) && !!c.model && (c.provider !== "custom" || !!c.base);
  const providers = Object.fromEntries(Object.entries(PROVIDERS).map(([k, v]) => [k, { name: v.name, key: v.key, keyUrl: v.keyUrl, base: v.base, hasKey: hasKey(k) }]));
  return { enabled: c.enabled, provider: c.provider, providerName: P.name, model: c.model, base: c.base, hasKey: has, ready, providers, claudeModels: CLAUDE_MODELS,
    modelName: c.provider === "anthropic" ? (CLAUDE_MODELS[c.model] || c.model).replace(/ \(.*\)/, "") : c.model };
};

handle("buddy:status", ANY, () => buddyStatus());
handle("buddy:setKey", ["internal"], async (_e, provider, key) => {
  if (!PROVIDERS[provider]) return { ok: false, error: "Unknown AI provider." };
  key = String(key || "").trim();
  if (key && provider === "anthropic" && !/^sk-ant-[A-Za-z0-9_\-]{20,}$/.test(key)) return { ok: false, error: "That doesn’t look like an Anthropic API key (it starts with sk-ant-)." };
  if (key && !/^[\x21-\x7e]{8,300}$/.test(key)) return { ok: false, error: "That doesn’t look like an API key." };
  const f = keyFile(); f.keys[provider] = key ? await enc(key) : "";
  store.write("buddy-key.json", f);
  return { ok: true, status: buddyStatus() };
});
// Ask the provider which models it offers (so we never hard-code stale model names).
handle("buddy:models", ["internal"], async (_e, provider) => {
  if (provider === "anthropic") return { ok: true, models: Object.keys(CLAUDE_MODELS) };
  const c = buddyCfg(); const P = PROVIDERS[provider]; if (!P) return { ok: false, error: "Unknown provider" };
  const base = provider === c.provider ? c.base : P.base;
  if (!base) return { ok: false, error: "Enter the service’s address first." };
  const key = await getKey(provider);
  if (P.key === true && !key) return { ok: false, error: "Add the API key first." };
  try {
    const r = await nativeFetch(base + "/models", { headers: key ? { Authorization: "Bearer " + key } : {}, timeout: 15 });
    if (r.status === 401 || r.status === 403) return { ok: false, error: "That API key didn’t work." };
    if (r.status < 200 || r.status > 299) return { ok: false, error: `The service answered ${r.status}.` };
    const j = JSON.parse(r.body);
    const ids = (j.data || j.models || []).map((m) => String(m.id || m.name || "").replace(/^models\//, "")).filter(Boolean)
      .filter((id) => !/(embed|whisper|tts|audio|dall-e|image-|moderation|transcribe|realtime|search-preview|similarity|davinci|babbage)/i.test(id));
    return { ok: true, models: [...new Set(ids)].sort().slice(0, 400) };
  } catch (err) {
    return { ok: false, error: provider === "ollama" ? "Ollama isn’t running on this computer (start the Ollama app)." : "Couldn’t reach the service." };
  }
});
handle("buddy:reset", ["shell"], (ctx) => { const c = buddyChats.get(ctx.window); if (c && c.controller) c.controller.abort(); buddyChats.delete(ctx.window); return true; });
handle("buddy:stop", ["shell"], (ctx) => { const c = buddyChats.get(ctx.window); if (c && c.controller) c.controller.abort(); return true; });

// What's on screen: screenshot + title/url/text of a tab in the caller's own window.
async function lookAt(windowId, tab) {
  let info;
  try { info = await host("tabInfo", { window: windowId, tab: +tab }); } catch { return null; }
  if (!info) return null;
  let image = null, text = "";
  try { image = await host("tabShot", { window: windowId, tab: +tab, width: 1400, quality: 0.7 }); } catch {}
  try { text = String(await host("tabEval", { window: windowId, tab: +tab, code: 'document.body ? document.body.innerText : ""' }) || "").slice(0, 15000); } catch {}
  return { image, text: `<current_tab>\nTitle: ${info.title}\nAddress: ${info.url}\nVisible text (may be cut off):\n${text}\n</current_tab>` };
}

// Server-sent events: calls onEvent(eventName, data) for each complete "data:" line.
function sseReader(onEvent) {
  let buf = "", ev = "";
  return (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).replace(/\r$/, ""); buf = buf.slice(i + 1);
      if (line.startsWith("event:")) ev = line.slice(6).trim();
      else if (line.startsWith("data:")) { onEvent(ev, line.slice(5).trim()); }
      else if (!line.trim()) ev = "";
    }
  };
}

/* ---------- Claude (Anthropic Messages API, streamed) ---------- */
async function askClaude(chat, c, key, seen, text, send) {
  const content = [];
  if (seen) { if (seen.image) content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: seen.image } }); content.push({ type: "text", text: seen.text }); }
  content.push({ type: "text", text });
  chat.messages.push({ role: "user", content });
  let out = "", stop = null, streamError = null;
  try {
    const r = await nativeFetch("https://api.anthropic.com/v1/messages", {
      method: "POST", signal: chat.controller.signal,
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-beta": "server-side-fallback-2026-07-01" },
      body: JSON.stringify({
        model: c.model, max_tokens: 4000, stream: true,
        output_config: { effort: "low" },   // a quick helper: answers fast; thinking stays adaptive
        fallbacks: "default",              // if a safety classifier declines, retry on Anthropic's recommended model
        system: systemPrompt(), messages: chat.messages
      })
    }, sseReader((_ev, data) => {
      let j; try { j = JSON.parse(data); } catch { return; }
      if (j.type === "content_block_delta" && j.delta && j.delta.type === "text_delta") { out += j.delta.text; send(j.delta.text); }
      else if (j.type === "message_delta" && j.delta && j.delta.stop_reason) stop = j.delta.stop_reason;
      else if (j.type === "error") streamError = j.error || {};
    }));
    if (r.status !== 200) {
      chat.messages.pop();
      if (r.status === 401 || r.status === 403) return { ok: false, error: "badkey" };
      if (r.status === 429) return { ok: false, error: "ratelimit" };
      let msg = ""; try { msg = JSON.parse(r.body).error.message; } catch { msg = String(r.body || ""); }
      return { ok: false, error: "api", detail: `${r.status} ${String(msg).slice(0, 200)}` };
    }
    if (streamError) { chat.messages.pop(); return { ok: false, error: "api", detail: `${streamError.type || ""} ${String(streamError.message || "").slice(0, 200)}` }; }
    chat.messages.push({ role: "assistant", content: [{ type: "text", text: out || " " }] });
    if (stop === "refusal") return { ok: false, error: "refusal" };
    return { ok: true, truncated: stop === "max_tokens" };
  } catch (err) {
    chat.messages.pop();   // drop the unanswered question so the history stays valid
    if (chat.controller.signal.aborted) return { ok: false, error: "stopped" };
    return { ok: false, error: "offline" };
  }
}

/* ---------- OpenAI-compatible providers (streamed over SSE) ---------- */
async function askCompatible(chat, c, key, seen, text, send) {
  const build = (withImage) => {
    const parts = [];
    if (seen) { if (withImage && seen.image) parts.push({ type: "image_url", image_url: { url: "data:image/jpeg;base64," + seen.image } }); parts.push({ type: "text", text: seen.text }); }
    parts.push({ type: "text", text });
    return { role: "user", content: parts };
  };
  const run = async (userMsg) => {
    let out = "", finish = null;
    const r = await nativeFetch(c.base + "/chat/completions", {
      method: "POST", signal: chat.controller.signal,
      headers: Object.assign({ "Content-Type": "application/json" }, key ? { Authorization: "Bearer " + key } : {},
        c.provider === "openrouter" ? { "HTTP-Referer": "https://github.com/lattewirell-creator/stupid-browser", "X-Title": "The Stupid Browser" } : {}),
      body: JSON.stringify({ model: c.model, stream: true, messages: [{ role: "system", content: systemPrompt() }, ...chat.messages, userMsg] })
    }, sseReader((_ev, data) => {
      if (data === "[DONE]") return;
      try {
        const j = JSON.parse(data); const ch = j.choices && j.choices[0];
        const d = ch && ch.delta && ch.delta.content;
        if (d) { out += d; send(d); }
        if (ch && ch.finish_reason) finish = ch.finish_reason;
      } catch {}
    }));
    if (r.status !== 200) return { status: r.status, body: String(r.body || "").slice(0, 400) };
    return { status: 200, text: out, finish };
  };
  try {
    let userMsg = build(true);
    let res = await run(userMsg);
    let note = "";
    // Text-only models reject images: try again with just the page text.
    if (res.status === 400 && seen && seen.image && /image|vision|multimodal|content.*type|image_url/i.test(res.body)) {
      userMsg = build(false); res = await run(userMsg); note = "textonly";
    }
    if (res.status === 401 || res.status === 403) return { ok: false, error: "badkey" };
    if (res.status === 429) return { ok: false, error: "ratelimit" };
    if (res.status === 404) return { ok: false, error: "model", detail: c.model };
    if (res.status !== 200) return { ok: false, error: "api", detail: `${res.status} ${res.body.replace(/\s+/g, " ").slice(0, 180)}` };
    // Keep only text in history (smaller, and works across text-only models).
    chat.messages.push({ role: "user", content: (seen ? seen.text + "\n\n" : "") + text }, { role: "assistant", content: res.text });
    return { ok: true, truncated: res.finish === "length", note };
  } catch (err) {
    if (chat.controller.signal.aborted) return { ok: false, error: "stopped" };
    return { ok: false, error: c.provider === "ollama" ? "ollama" : "offline" };
  }
}

handle("buddy:ask", ["shell"], async (ctx, { text, look, tabWcId } = {}) => {
  const c = buddyCfg(); const P = PROVIDERS[c.provider];
  if (!c.enabled) return { ok: false, error: "disabled" };
  const key = await getKey(c.provider);
  if (P.key === true && !key) return { ok: false, error: "nokey" };
  if (!c.model) return { ok: false, error: "nomodel" };
  text = String(text || "").trim().slice(0, 4000);
  if (!text) return { ok: false, error: "empty" };
  let chat = buddyChats.get(ctx.window);
  if (!chat || chat.provider !== c.provider || chat.model !== c.model) { chat = { provider: c.provider, model: c.model, messages: [] }; buddyChats.set(ctx.window, chat); }
  if (chat.controller) return { ok: false, error: "busy" };
  if (chat.messages.length > MAX_TURNS * 2) chat.messages.splice(0, chat.messages.length - MAX_TURNS * 2);
  chat.controller = new AbortController();
  try {
    const seen = look && !ctx.incognito && tabWcId ? await lookAt(ctx.window, tabWcId) : null;
    const send = (d) => sendToWindow(ctx.window, "buddy:delta", d);
    return c.provider === "anthropic" ? await askClaude(chat, c, key, seen, text, send) : await askCompatible(chat, c, key, seen, text, send);
  } finally {
    chat.controller = null;
  }
});

/* ---------------- Rewind ---------------- */
// Opt-in. Stores a small JPEG + page text per visit in the data folder's rewind/, never for private
// windows, pages with password fields, sensitive-looking URLs or excluded sites. Keeps 30 days / 3,000 pages.
const REWIND_MAX_AGE = 30 * 864e5;   // SAME_PAGE_WINDOW comes from rewind-main.js (core-gen.js)
const rewindIndex = () => store.read("rewind.json", []);
const rewindWrite = (list) => store.write("rewind.json", list, 1500);
const rewindOn = () => !!getSettings().rewind;
const rewindExcluded = (h) => (getSettings().rewindExclude || []).some((d) => h === d || h.endsWith("." + d));
function rewindPrune(list) {
  const cutoff = Date.now() - REWIND_MAX_AGE;
  const keep = list.filter((x) => x.ts >= cutoff);
  while (keep.length > MAX_ITEMS) keep.shift();
  const alive = new Set(keep.map((x) => x.id));
  const gone = list.filter((x) => !alive.has(x.id)).map((x) => x.id);
  if (gone.length) host("rewindFiles", { act: "delete", ids: gone }).catch(() => {});
  return keep;
}
// Called by the browser UI when a tab finished loading and is on screen.
handle("rewind:capture", ["shell"], async (ctx, tab) => {
  if (!rewindOn() || ctx.incognito) return false;
  let info; try { info = await host("tabInfo", { window: ctx.window, tab: +tab }); } catch { return false; }
  if (!info) return false;
  let u; try { u = new URL(info.url); } catch { return false; }
  if (!/^https?:$/.test(u.protocol) || SENSITIVE.test(u.hostname + u.pathname) || rewindExcluded(u.hostname)) return false;
  let page;
  try { page = await host("tabEval", { window: ctx.window, tab: +tab, code: `(() => ({ pw: !!document.querySelector('input[type=password]'), text: (document.body ? document.body.innerText : '').replace(/\\s+/g, ' ').slice(0, 6000) }))()` }); } catch { return false; }
  if (!page || page.pw) return false;
  const list = rewindIndex();
  const url = info.url, last = [...list].reverse().find((x) => x.url === url);
  if (last && Date.now() - last.ts < SAME_PAGE_WINDOW) return false;
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  try { if (!(await host("tabShot", { window: ctx.window, tab: +tab, width: 640, quality: 0.62, save: id }))) return false; } catch { return false; }
  list.push({ id, url, host: u.hostname.replace(/^www\./, ""), title: (info.title || url).slice(0, 300), text: String(page.text || ""), ts: Date.now() });
  rewindWrite(rewindPrune(list));
  return true;
});
// Search: every word must appear (title, address or page text); newest first.
handle("rewind:search", ["internal"], (_e, q, limit = 300) => {
  const words = String(q || "").toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
  let list = rewindIndex().slice().reverse();
  if (words.length) {
    list = list.map((x) => {
      const hay = (x.title + " " + x.url + " " + x.text).toLowerCase();
      if (!words.every((w) => hay.includes(w))) return null;
      const score = words.reduce((s, w) => s + (x.title.toLowerCase().includes(w) ? 3 : 0) + (x.host.includes(w) ? 2 : 0) + 1, 0);
      const i = x.text.toLowerCase().indexOf(words[0]);
      const snippet = i >= 0 ? (i > 60 ? "…" : "") + x.text.slice(Math.max(0, i - 60), i + 140) + "…" : "";
      return Object.assign({}, x, { score, snippet });
    }).filter(Boolean).sort((a, b) => b.score - a.score || b.ts - a.ts);
  }
  return list.slice(0, Math.min(1000, limit)).map(({ text, ...rest }) => rest);
});
handle("rewind:status", ANY, async () => {
  const bytes = await host("rewindFiles", { act: "size" }).catch(() => 0);
  return { on: rewindOn(), count: rewindIndex().length, bytes, exclude: getSettings().rewindExclude || [] };
});
handle("rewind:delete", ["internal"], (_e, ids) => {
  const set = new Set((ids || []).map(String));
  host("rewindFiles", { act: "delete", ids: [...set] }).catch(() => {});
  rewindWrite(rewindIndex().filter((x) => !set.has(x.id))); return true;
});
handle("rewind:clear", ["internal"], async () => { store.write("rewind.json", []); await host("rewindFiles", { act: "clear" }).catch(() => {}); broadcast("rewind:changed", true); return true; });
