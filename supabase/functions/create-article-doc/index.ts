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

interface OwnerTokens {
  access_token: string;
}

async function refreshOwnerAccessToken(): Promise<OwnerTokens> {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  const refreshToken = Deno.env.get("GOOGLE_REFRESH_TOKEN");
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Owner Google credentials not configured.");
  }
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token refresh failed: ${res.status} ${text}`);
  }
  return (await res.json()) as OwnerTokens;
}

async function makeAnyoneEditor(
  accessToken: string,
  fileId: string
): Promise<void> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
      fileId
    )}/permissions?sendNotificationEmail=false&supportsAllDrives=true`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        role: "writer",
        type: "anyone",
        allowFileDiscovery: false,
      }),
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Permission update failed: ${res.status} ${text}`);
  }
}

async function getDocStructure(
  accessToken: string,
  docId: string
): Promise<Record<string, unknown> | null> {
  const res = await fetch(
    `https://docs.googleapis.com/v1/documents/${docId}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok) return null;
  return await res.json();
}

function buildTableBorderRequests(doc: Record<string, unknown>): unknown[] {
  const requests: unknown[] = [];
  const body = doc.body as { content?: unknown[] } | undefined;
  if (!body?.content) return requests;

  const black = { color: { rgbColor: { red: 0.0, green: 0.0, blue: 0.0 } } };
  const border = { dashStyle: "SOLID", width: { magnitude: 1, unit: "PT" }, color: black };

  for (const el of body.content as Record<string, unknown>[]) {
    if (!el.table) continue;
    const table = el.table as {
      rows: number;
      columns: number;
      tableRows: { tableCells: { content: { startIndex: number }[] }[] }[];
    };
    const startIdx = (el as { startIndex: number }).startIndex;

    for (let r = 0; r < table.rows; r++) {
      for (let c = 0; c < table.columns; c++) {
        requests.push({
          updateTableCellStyle: {
            tableRange: {
              tableCellLocation: { tableStartLocation: { index: startIdx }, rowIndex: r, columnIndex: c },
              rowSpan: 1,
              columnSpan: 1,
            },
            tableCellStyle: {
              borderTop: border,
              borderBottom: border,
              borderLeft: border,
              borderRight: border,
            },
            fields: "borderTop,borderBottom,borderLeft,borderRight",
          },
        });
      }
    }
  }
  return requests;
}

async function setPageless(
  accessToken: string,
  docId: string
): Promise<string | null> {
  const res = await fetch(
    `https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          {
            updateDocumentStyle: {
              documentStyle: {
                documentFormat: { documentMode: "PAGELESS" },
              },
              fields: "documentFormat.documentMode",
            },
          },
        ],
      }),
    }
  );
  if (!res.ok) {
    const text = await res.text();
    return `Pageless failed: ${res.status} ${text}`;
  }
  return null;
}

async function forceOutfitFontAndBoldHeadings(
  accessToken: string,
  docId: string
): Promise<void> {
  const doc = await getDocStructure(accessToken, docId);
  if (!doc) return;

  interface DocParagraph {
    startIndex: number;
    endIndex: number;
    paragraph?: {
      paragraphStyle?: { namedStyleType?: string };
      elements?: { startIndex: number; endIndex: number }[];
    };
  }

  const body = (doc as { body?: { content?: DocParagraph[] } }).body;
  if (!body?.content) return;

  const lastEl = body.content.at(-1);
  const endIndex = lastEl?.endIndex;
  if (!endIndex || endIndex <= 2) return;

  const requests: unknown[] = [
    {
      updateTextStyle: {
        range: { startIndex: 1, endIndex },
        textStyle: {
          weightedFontFamily: { fontFamily: "Outfit" },
        },
        fields: "weightedFontFamily",
      },
    },
  ];

  const headingStyles = new Set([
    "HEADING_1",
    "HEADING_2",
    "HEADING_3",
  ]);

  for (const el of body.content) {
    const style = el.paragraph?.paragraphStyle?.namedStyleType;
    if (!style || !headingStyles.has(style)) continue;
    const pStart = el.paragraph!.elements?.[0]?.startIndex ?? el.startIndex;
    const pEnd = el.paragraph!.elements?.at(-1)?.endIndex ?? el.endIndex;
    if (pStart >= pEnd) continue;
    requests.push({
      updateTextStyle: {
        range: { startIndex: pStart, endIndex: pEnd },
        textStyle: { bold: true },
        fields: "bold",
      },
    });
  }

  await fetch(
    `https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ requests }),
    }
  );
}

async function fixTableBorders(
  accessToken: string,
  docId: string
): Promise<void> {
  const doc = await getDocStructure(accessToken, docId);
  if (!doc) return;
  const requests = buildTableBorderRequests(doc);
  if (requests.length === 0) return;

  await fetch(
    `https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ requests }),
    }
  );
}

async function fetchPexelsImage(query: string): Promise<string | null> {
  const apiKey = Deno.env.get("PEXELS_API_KEY") || "Rz8iC6kgvstMBuPEtAfpoJFUJHOvi28mLo1sblEIsnuwAsiTmBYzBR1Z";
  if (!apiKey) return null;
  try {
    const page = Math.floor(Math.random() * 5) + 1;
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=15&page=${page}&orientation=landscape`,
      { headers: { Authorization: apiKey } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const photos = data.photos;
    if (!photos || photos.length === 0) return null;
    const photo = photos[Math.floor(Math.random() * photos.length)];
    return photo.src?.landscape || photo.src?.large || null;
  } catch {
    return null;
  }
}

const FONT = "Outfit";
const BODY_SIZE = "14pt";

function applyFontToAnchors(html: string, fontStyle: string): string {
  return html.replace(/<a\s([^>]*)>([\s\S]*?)<\/a>/gi, (_m, attrs, txt) =>
    `<a ${attrs}><span style="${fontStyle}">${txt}</span></a>`
  );
}

function wrapTextInSpans(html: string): string {
  const hFont = `font-family:'${FONT}';font-weight:700;color:#000`;
  const pFont = `font-family:'${FONT}';font-size:${BODY_SIZE};font-weight:400;color:#000`;
  const cellBoldFont = `font-family:'${FONT}';font-size:${BODY_SIZE};font-weight:700;color:#000`;
  const cellFont = `font-family:'${FONT}';font-size:${BODY_SIZE};font-weight:400;color:#000`;

  const hSpan = `<span style="${hFont}">`;
  const pSpan = `<span style="${pFont}">`;
  const cellBold = `<span style="${cellBoldFont}">`;
  const cellNormal = `<span style="${cellFont}">`;

  return html
    .replace(/<\/?thead[^>]*>/gi, "")
    .replace(/<\/?tbody[^>]*>/gi, "")
    .replace(/<table[^>]*>/gi, `<table style="border-collapse:collapse;width:100%">`)
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_m, txt) => {
      const inner = applyFontToAnchors(txt, hFont);
      return `<h2 style="text-align:justify">${hSpan}${inner}</span></h2>`;
    })
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_m, txt) => {
      const inner = applyFontToAnchors(txt, hFont);
      return `<h3 style="text-align:justify">${hSpan}${inner}</span></h3>`;
    })
    .replace(/<p>([\s\S]*?)<\/p>/gi, (_m, txt) => {
      const inner = applyFontToAnchors(txt, pFont);
      return `<p style="text-align:justify">${pSpan}${inner}</span></p>`;
    })
    .replace(/<li>([\s\S]*?)<\/li>/gi, (_m, txt) => {
      const inner = applyFontToAnchors(txt, pFont);
      return `<li style="text-align:justify">${pSpan}${inner}</span></li>`;
    })
    .replace(/<th[^>]*>([\s\S]*?)<\/th>/gi, (_m, txt) => {
      const inner = applyFontToAnchors(txt, cellBoldFont);
      return `<td style="border:1px solid #000;padding:4pt 6pt">${cellBold}${inner}</span></td>`;
    })
    .replace(/<td>([\s\S]*?)<\/td>/gi, (_m, txt) => {
      const inner = applyFontToAnchors(txt, cellFont);
      return `<td style="border:1px solid #000;padding:4pt 6pt">${cellNormal}${inner}</span></td>`;
    });
}

function buildFullHtml(title: string, bodyHtml: string, imageUrl: string | null): string {
  const wrapped = wrapTextInSpans(bodyHtml);
  const titleSpan = `<span style="font-family:'${FONT}';font-size:23pt;font-weight:700;color:#000">`;

  const afterTitle = imageUrl
    ? `<p style="padding-top:12pt;padding-bottom:12pt;margin:0;text-align:center"><img src="${imageUrl}" width="680" style="width:680px;max-width:100%;border-radius:8px" /></p>`
    : `<p class="spacer"><span style="font-family:'${FONT}';font-size:${BODY_SIZE};color:#000"></span></p>`;

  return `<html><head><meta charset="utf-8"><title>${title}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;700&display=swap');
  body{font-family:'${FONT}',sans-serif;background-color:#fff;color:#000;font-size:${BODY_SIZE}}
  h1{padding-top:24pt;padding-bottom:6pt;line-height:1.15;text-align:justify;margin:0}
  h2{padding-top:18pt;padding-bottom:4pt;line-height:1.15;text-align:justify;margin:0}
  h3{padding-top:14pt;padding-bottom:4pt;line-height:1.15;text-align:justify;margin:0}
  p{padding-top:6pt;padding-bottom:6pt;line-height:1.5;text-align:justify;margin:0}
  ul,ol{font-family:'${FONT}',sans-serif;font-size:${BODY_SIZE};color:#000;margin:6pt 0;padding-left:24pt}
  li{font-family:'${FONT}',sans-serif;font-size:${BODY_SIZE};color:#000;line-height:1.5;padding:2pt 0;text-align:justify}
  table{border-collapse:collapse;width:100%;margin:12pt 0;font-family:'${FONT}',sans-serif;font-size:${BODY_SIZE};border:1px solid #000}
  td{padding:4pt 6pt;border:1px solid #000;font-size:${BODY_SIZE};text-align:justify}
  .spacer{padding:0;line-height:1.15;margin:0}
</style></head><body>
<h1 style="text-align:justify">${titleSpan}${title}</span></h1>
${afterTitle}
${wrapped}
</body></html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return json(405, { error: "Method not allowed" });
    }

    const { title, bodyHtml, topic } = await req.json();
    if (!title || !bodyHtml) {
      return json(400, { error: "Provide title and bodyHtml." });
    }

    const imageUrl = await fetchPexelsImage(topic || title);
    const fullHtml = buildFullHtml(title, bodyHtml, imageUrl);
    const htmlBytes = new TextEncoder().encode(fullHtml);

    const tokens = await refreshOwnerAccessToken();
    const accessToken = tokens.access_token;

    const boundary = "----ArticleDocBoundary" + crypto.randomUUID();
    const metadata = {
      name: title,
      mimeType: "application/vnd.google-apps.document",
    };
    const enc = new TextEncoder();
    const head = enc.encode(
      `--${boundary}\r\n` +
        `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
        JSON.stringify(metadata) +
        `\r\n--${boundary}\r\n` +
        `Content-Type: text/html\r\n\r\n`
    );
    const tail = enc.encode(`\r\n--${boundary}--`);
    const body = new Uint8Array(
      head.byteLength + htmlBytes.byteLength + tail.byteLength
    );
    body.set(head, 0);
    body.set(htmlBytes, head.byteLength);
    body.set(tail, head.byteLength + htmlBytes.byteLength);

    const uploadRes = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body,
      }
    );

    if (!uploadRes.ok) {
      const text = await uploadRes.text();
      return json(502, {
        error: `Drive upload failed: ${uploadRes.status} ${text}`,
      });
    }

    const uploaded = await uploadRes.json();

    const pagelessWarning = await setPageless(accessToken, uploaded.id);

    await fixTableBorders(accessToken, uploaded.id);
    await forceOutfitFontAndBoldHeadings(accessToken, uploaded.id);

    let shareWarning: string | null = null;
    try {
      await makeAnyoneEditor(accessToken, uploaded.id);
    } catch (e) {
      shareWarning = e instanceof Error ? e.message : String(e);
    }

    return json(200, {
      googleDocId: uploaded.id,
      googleDocUrl: uploaded.webViewLink,
      shareWarning,
      pagelessWarning,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json(500, { error: msg });
  }
});
