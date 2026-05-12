// ============================================================
// MOTRACKER CAPTURE — Supabase Edge Function
// ============================================================
// Receives free-text capture, parses via Claude Haiku,
// writes to Supabase tables, returns human-readable summary.
//
// ⚠️ HAIKU ONLY — DO NOT CHANGE THE MODEL
// This is a structured extraction task. Opus/Sonnet would
// waste money. Hard cap also set in Anthropic console ($10/mo).
// ============================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MODEL = "claude-haiku-4-5-20251001"; // DO NOT CHANGE
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SYSTEM_PROMPT = `You are Motracker's capture parser. Motsa types free-text logs of his day. Parse them into structured rows for these Supabase tables:

- entries (capture log, always log raw text here): { raw_text, captured_at }
- tasks: { title, due_date?, deadline?, tags? }
- shopping: { item, tags? }
- notes: { title, body, tags? }
- reminders: { text, remind_at, tags? }
- metrics (LONG format): { type, value, unit, tags? }
    common types: spend (HUF), calories (kcal), tobacco (count), cleanliness_bathroom (%), cleanliness_dishes (%), etc.

ALWAYS write one row to "entries" with the raw text.
THEN write to other tables based on what Motsa logged.

Examples:
"coffee 800" → entries + metrics{type:spend, value:800, unit:HUF}
"smoked 3" → entries + metrics{type:tobacco, value:3, unit:count}
"ran 5km, ate 600 cal" → entries + metrics{type:calories, value:600, unit:kcal}
"buy detergent" → entries + shopping{item:detergent}
"call dentist tomorrow" → entries + tasks{title:call dentist, due_date:<tomorrow YYYY-MM-DD>}
"cleaned bathroom" → entries + metrics{type:cleanliness_bathroom, value:100, unit:percent}

Today's date is provided in the user message. Use Budapest timezone (GMT+2).

Respond ONLY with JSON, no markdown, no preamble:
{
  "writes": {
    "entries": [...],
    "tasks": [...],
    "shopping": [...],
    "notes": [...],
    "reminders": [...],
    "metrics": [...]
  },
  "summary": "Human-readable one-liner with emojis, e.g. '☕ 800 HUF logged + 🛒 detergent added'"
}

Omit table keys with empty arrays. Be concise in summary. Use emojis sparingly but helpfully.`;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const { text } = await req.json();
    if (!text || typeof text !== "string") {
      return json({ error: "Missing 'text' in body" }, 400);
    }

    // ---- Call Claude Haiku ----
    const today = new Date().toISOString().slice(0, 10);
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 800,
        system: SYSTEM_PROMPT,
        messages: [
          { role: "user", content: `Today: ${today}\n\nCapture: ${text}` },
        ],
      }),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      return json({ error: "Claude API error", detail: err }, 502);
    }

    const claudeData = await claudeRes.json();
    const rawOutput = claudeData.content?.[0]?.text ?? "";

    // ---- Parse Claude's JSON response ----
    let parsed;
    try {
      parsed = JSON.parse(rawOutput.trim().replace(/^```json\s*|```$/g, ""));
    } catch (e) {
      return json({
        error: "Failed to parse Claude response",
        raw: rawOutput,
      }, 500);
    }

    const writes = parsed.writes ?? {};
    const summary = parsed.summary ?? "Logged.";

    // ---- Write to Supabase ----
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const writeResults: Record<string, number> = {};

    for (const [table, rows] of Object.entries(writes)) {
      if (!Array.isArray(rows) || rows.length === 0) continue;
      const { error, count } = await supabase
        .from(table)
        .insert(rows, { count: "exact" });
      if (error) {
        return json({
          error: `Insert into ${table} failed`,
          detail: error.message,
          partial_writes: writeResults,
        }, 500);
      }
      writeResults[table] = count ?? rows.length;
    }

    return json({
      ok: true,
      summary,
      writes: writeResults,
      tokens: {
        input: claudeData.usage?.input_tokens,
        output: claudeData.usage?.output_tokens,
      },
    });
  } catch (e) {
    return json({ error: "Unexpected error", detail: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
