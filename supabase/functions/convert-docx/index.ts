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

interface OwnerTokens {
  access_token: string;
  expires_in: number;
}

async function refreshOwnerAccessToken(): Promise<OwnerTokens> {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  const refreshToken = Deno.env.get("GOOGLE_REFRESH_TOKEN");
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Owner Google credentials not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN as Supabase Edge Function secrets."
    );
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

async function uploadToDrive(
  accessToken: string,
  file: { name: string; mime: string; bytes: ArrayBuffer }
): Promise<{ id: string; webViewLink: string }> {
  const boundary = "----DocBridgeBoundary" + crypto.randomUUID();
  const metadata = {
    name: file.name.replace(/\.docx?$/i, ""),
    mimeType: "application/vnd.google-apps.document",
  };
  const enc = new TextEncoder();
  const head = enc.encode(
    `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify(metadata) +
      `\r\n--${boundary}\r\n` +
      `Content-Type: ${file.mime}\r\n\r\n`
  );
  const tail = enc.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(head.byteLength + file.bytes.byteLength + tail.byteLength);
  body.set(head, 0);
  body.set(new Uint8Array(file.bytes), head.byteLength);
  body.set(tail, head.byteLength + file.bytes.byteLength);

  const res = await fetch(
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

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive upload failed: ${res.status} ${text}`);
  }
  return await res.json();
}

async function makeAnyoneEditor(accessToken: string, fileId: string): Promise<void> {
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
    throw new Error(`Drive permission update failed: ${res.status} ${text}`);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method === "GET") {
      const ok =
        !!Deno.env.get("GOOGLE_CLIENT_ID") &&
        !!Deno.env.get("GOOGLE_CLIENT_SECRET") &&
        !!Deno.env.get("GOOGLE_REFRESH_TOKEN");
      return json(200, { configured: ok });
    }

    if (req.method !== "POST") {
      return json(405, { error: "Method not allowed" });
    }

    const form = await req.formData();
    const f = form.get("file");
    if (!(f instanceof File)) {
      return json(400, { error: "Missing file." });
    }
    const name = f.name || "document.docx";
    const mime =
      f.type ||
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const bytes = await f.arrayBuffer();

    const tokens = await refreshOwnerAccessToken();
    const uploaded = await uploadToDrive(tokens.access_token, {
      name,
      mime,
      bytes,
    });

    let shareWarning: string | null = null;
    try {
      await makeAnyoneEditor(tokens.access_token, uploaded.id);
    } catch (e) {
      shareWarning = e instanceof Error ? e.message : String(e);
    }

    return json(200, {
      googleDocId: uploaded.id,
      googleDocUrl: uploaded.webViewLink,
      shareWarning,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json(500, { error: msg });
  }
});
