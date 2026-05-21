import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return json(405, { error: "Method not allowed" });
    }

    const body = await req.json();
    const topic: string = body.topic;
    const count: number = body.count;
    const customPrompt: string = body.titlePrompt || "";

    if (!topic || !count || count < 1 || count > 200) {
      return json(400, { error: "Provide topic and count (1-200)." });
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return json(500, { error: "ANTHROPIC_API_KEY not configured." });
    }

    const template = customPrompt || `Generate exactly {count} unique, informative article titles about "{topic}".

Requirements:
- No brand or company names
- No product names
- No location names
- Each title must be specific, not generic
- Vary the formats (how-to, question, listicle, etc.)
- For listicle titles, NEVER include numbers (write "Several Ways" not "7 Ways")
- No numbering, no explanation

BANNED WORDS — never use these in any title:
best, buy, top, RTP, random, randomness, random numbers, cost, price, cheap, affordable

Return ONLY a JSON array of strings. Example: ["Title One", "Title Two"]`;

    const prompt = template
      .replace(/\{topic\}/g, topic)
      .replace(/\{count\}/g, String(count));

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4096,
        temperature: 0.9,
        system:
          "You are a content strategist. Return only valid JSON arrays of title strings. No markdown, no explanation, no code fences.",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return json(502, { error: `Claude API error: ${res.status} ${text}` });
    }

    const data = await res.json();
    let raw =
      data.content?.[0]?.type === "text"
        ? data.content[0].text.trim()
        : "[]";

    raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");

    const arrayMatch = raw.match(/\[[\s\S]*\]/);
    if (arrayMatch) raw = arrayMatch[0];

    let titles: string[];
    try {
      titles = JSON.parse(raw);
      if (!Array.isArray(titles)) throw new Error("Not an array");
      titles = titles.filter(
        (t: unknown) => typeof t === "string" && t.length > 0
      );
    } catch {
      return json(502, {
        error: "Failed to parse titles from Claude response.",
        raw,
      });
    }

    return json(200, { titles });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json(500, { error: msg });
  }
});
