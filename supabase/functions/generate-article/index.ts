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

interface Anchor {
  text: string;
  url: string;
}

const DEFAULT_SYSTEM = `You are a professional SEO content writer. You write high-quality, informative, educational articles. You output clean HTML using ONLY h2, h3, p, and a tags. Do NOT include h1 tags — the title is added separately. No tables, no bullet points, no extra blank lines, no em dashes. Every heading has its first letter of each main word capitalized. Do NOT wrap output in markdown code fences. Do NOT include <!DOCTYPE>, <html>, <head>, or <body> tags. Just the content tags.`;

function buildAnchorInstructions(anchors: Anchor[]): string {
  if (anchors.length === 0) return "";
  const anchorList = anchors
    .map((a) => `- Anchor text: "${a.text}" -> URL: ${a.url}`)
    .join("\n");
  return `You MUST naturally embed the following anchor links within the article body text. Each anchor should appear exactly once, placed where it fits naturally in context. Use HTML <a> tags with the exact anchor text and URL provided. Do NOT group them together; spread them across different sections of the article.
${anchorList}`;
}

const DEFAULT_ARTICLE_TEMPLATE = `You are an expert content writer. Write a high-quality, SEO-friendly article in {language} on the title: "{title}"

CONTENT REQUIREMENTS:
- Word count: STRICTLY between {minWordCount} and {maxWordCount} words — not less, not more
- Tone: casual, human, conversational — like a knowledgeable friend explaining something
- Writing style: clear, direct, confident — no fluff, no filler
- Purpose: informative and educational, never promotional
- Keep everything positive and factual
- No brand names or company names anywhere

STRUCTURE RULES:
- NO H1 tag (title is added separately)
- Start with exactly 2-3 <p> intro paragraphs BEFORE the first <h2>
- First sentence of the intro must be a reader-focused question
- After every <h2>, write one short intro sentence before any <h3>
- Use <h2> and <h3> headings only
- Capitalize the first letter of each main word in all headings
- Paragraphs should flow naturally with no extra blank lines

FORMATTING RULES:
- Output ONLY valid HTML
- Use <h2>, <h3> for headings
- Use <p> for all paragraphs
- Use <a> for anchor links only
- No tables
- No bullet points or lists
- No extra blank lines between elements
- First element MUST be a <p> tag
- NEVER use em dash (—)

{anchors}

ANCHOR LINK RULES (CRITICAL):
- Spread anchor links evenly throughout the entire article
- Minimum 2-3 sections (H2 blocks) of gap between any two anchor links
- NEVER place more than 1 anchor link in the same paragraph
- NEVER place two anchor links in the same section (between two H2s)
- Each anchor link must appear in its own separate paragraph, naturally within the flow
- Anchor text must fit the sentence so naturally that it doesn't feel inserted
- Do not force anchors — only place them where they make genuine contextual sense
- If an anchor cannot be placed naturally, skip it rather than force it

BANNED WORDS — never use these anywhere in the article:
wondering, wondered, this guide, diving, dive, embark, discover, engage, engaging, world, treasure, trove, seeds, sprout, harnessing, power, game-changer, emerge, ladder, plethora, enthusiast, seamless, emphasized, tenure, journey, realm, nuances, versatility, sophisticated, landscape, in the ever-evolving, seeking, shed, merely, embrace, presence, handy, super, notable, lies, delve, versatile, enhance, great, whether, embraced, designed, robust, revolutionize, cutting-edge, groundbreaking, transformative, leverage, holistic, synergy, unpack, demystify, navigating, unlock, crucial, vital, essential, it's worth noting, at the end of the day, in today's world, in conclusion, to summarize

WORD COUNT RULE (CRITICAL):
- You MUST write between {minWordCount} and {maxWordCount} words
- Before finishing, count your words mentally and adjust
- If you are below {minWordCount}, expand existing sections with more detail
- If you are above {maxWordCount}, trim sentences and remove filler
- Do NOT submit the article if it falls outside this range

QUALITY CHECKLIST (apply before finishing):
- Is the word count strictly between {minWordCount} and {maxWordCount}?
- Does the intro open with a question that pulls the reader in?
- Does every section add real value, not just filler?
- Does it read like a human wrote it, not an AI?
- Are all headings properly capitalized?
- Is the first HTML element a <p> tag?
- Are all banned words avoided?
- Is the tone consistent throughout?`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return json(405, { error: "Method not allowed" });
    }

    const body = await req.json();
    const title: string = body.title;
    const minWords: number = body.minWordCount || body.wordCount || 1000;
    const maxWords: number = body.maxWordCount || minWords + 300;
    const anchors: Anchor[] = Array.isArray(body.anchors) ? body.anchors : [];
    const customPrompt: string = body.articlePrompt || "";
    const language: string = body.language || "English";

    if (!title) {
      return json(400, { error: "Provide a title." });
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return json(500, { error: "ANTHROPIC_API_KEY not configured." });
    }

    const template = customPrompt || DEFAULT_ARTICLE_TEMPLATE;
    const userPrompt = template
      .replace(/\{title\}/g, title)
      .replace(/\{wordCount\}/g, `${minWords}-${maxWords}`)
      .replace(/\{minWordCount\}/g, String(minWords))
      .replace(/\{maxWordCount\}/g, String(maxWords))
      .replace(/\{language\}/g, language)
      .replace(/\{anchors\}/g, buildAnchorInstructions(anchors));

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 8192,
        temperature: 0.7,
        system: DEFAULT_SYSTEM,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return json(502, {
        error: `Claude API error: ${res.status} ${text}`,
      });
    }

    const data = await res.json();
    let html =
      data.content?.[0]?.type === "text"
        ? data.content[0].text.trim()
        : "";

    html = html.replace(/^```html?\s*/i, "").replace(/\s*```$/i, "");
    html = html.replace(/<h1[^>]*>[\s\S]*?<\/h1>\s*/gi, "");

    return json(200, { html });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json(500, { error: msg });
  }
});
