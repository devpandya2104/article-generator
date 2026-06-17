import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const body = await req.json();
    const topic: string = body.topic;
    const count: number = body.count;
    const model: string = body.model || "gpt-5.4-mini";
    const language: string = body.language || "English";
    const customPrompt: string = body.titlePrompt || "";

    if (!topic || !count || count < 1 || count > 200) {
      return json(400, { error: "Provide topic and count (1-200)." });
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return json(500, { error: "OPENAI_API_KEY not configured." });

    const template = customPrompt || `Generate exactly {count} unique, informative article titles about "{topic}". Write all titles in {language}.

Requirements:
- All titles MUST be written in {language} — not English unless {language} is English
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

    let prompt = template
      .replace(/\{topic\}/g, topic)
      .replace(/\{count\}/g, String(count))
      .replace(/\{language\}/g, language);

    // Always enforce language at the end so custom prompts without {language} still work
    if (language && language.toLowerCase() !== "english") {
      prompt += `\n\nCRITICAL: Every title MUST be written in ${language}. Do not write any title in English or any other language. All ${count} titles must be in ${language}.`;
    }

    const isReasoningModel = /^o\d/.test(model);
    const systemContent =
      "You are a content strategist. Return only valid JSON arrays of title strings. No markdown, no explanation, no code fences.";

    const messages = isReasoningModel
      ? [{ role: "user", content: `${systemContent}\n\n${prompt}` }]
      : [{ role: "system", content: systemContent }, { role: "user", content: prompt }];

    // max_completion_tokens is required for all modern OpenAI models (GPT-5.x dropped max_tokens)
    const reqBody: Record<string, unknown> = { model, messages, max_completion_tokens: 4096 };
    if (!isReasoningModel) reqBody.temperature = 0.9;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(reqBody),
    });

    if (!res.ok) {
      const text = await res.text();
      return json(502, { error: `OpenAI API error: ${res.status} ${text}` });
    }

    const data = await res.json();
    let raw = data.choices?.[0]?.message?.content?.trim() || "[]";
    raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    const arrayMatch = raw.match(/\[[\s\S]*\]/);
    if (arrayMatch) raw = arrayMatch[0];

    let titles: string[];
    try {
      titles = JSON.parse(raw);
      if (!Array.isArray(titles)) throw new Error("Not an array");
      titles = titles.filter((t: unknown) => typeof t === "string" && t.length > 0);
    } catch {
      return json(502, { error: "Failed to parse titles from OpenAI response.", raw });
    }

    return json(200, { titles });
  } catch (e) {
    return json(500, { error: e instanceof Error ? e.message : String(e) });
  }
});
