export const DEFAULT_TITLE_PROMPT = `Generate exactly {count} unique, informative article titles about "{topic}".

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

export const DEFAULT_ARTICLE_PROMPT = `You are an expert content writer. Write a high-quality, SEO-friendly article in {language} on the title: "{title}"

CONTENT REQUIREMENTS:
- Word count: STRICTLY between {minWordCount} and {maxWordCount} words — not less, not more
- Tone: casual, human, conversational — like a knowledgeable friend explaining something
- Writing style: clear, direct, confident — no fluff, no filler
- Purpose: informative and educational, never promotional
- Keep everything positive and factual
- No brand names or company names anywhere
- Every sentence must carry a specific, useful point — no sentence exists just to fill space
- Stay strictly on the topic stated in the title — do not drift into loosely related areas
- Never repeat a point that was already made in an earlier section
- No meta-commentary ("in this article", "we will look at", "as mentioned above", "let's explore")

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
- Use <h2>, <h3> for headings; <p> for paragraphs; <a> for anchor links only
- No tables, no bullet points or lists; No extra blank lines; First element MUST be <p>
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

FILLER PHRASES TO AVOID — never use these sentence starters or transitions:
"It is important to note", "One thing to keep in mind", "There are many factors", "When it comes to", "Having said that", "With that in mind", "It goes without saying", "Needless to say", "In other words", "Simply put", "At its core", "First and foremost", "Last but not least", "All in all", "As we can see"

WORD COUNT RULE (CRITICAL):
- You MUST write between {minWordCount} and {maxWordCount} words
- Before finishing, count your words mentally and adjust
- If below word count: add a new section with fresh, specific information — do NOT pad existing paragraphs with repetition

QUALITY CHECKLIST:
- Is the word count strictly between {minWordCount} and {maxWordCount}?
- Does the intro open with a question that pulls the reader in?
- Does every section add real value, not just filler?
- Does it read like a human wrote it, not an AI?
- Are all headings properly capitalized?
- Is the first HTML element a <p> tag? Are all banned words avoided?
- Does every sentence contribute something new and specific?
- Does the article stay focused on the exact title — no tangents?`;
