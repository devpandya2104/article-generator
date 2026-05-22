import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const { url, method = "GET", body } = await req.json();

    if (!url || typeof url !== "string") {
      return json(400, { error: "url is required" });
    }

    // Only allow Google Apps Script URLs for security
    if (!url.startsWith("https://script.google.com/")) {
      return json(400, { error: "Only script.google.com URLs are allowed" });
    }

    const fetchOptions: RequestInit = {
      method,
      redirect: "follow",
    };

    if (method === "POST" && body !== undefined) {
      fetchOptions.headers = { "Content-Type": "application/json" };
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(url, fetchOptions);
    const text = await response.text();

    return new Response(text, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return json(500, { error: String(err) });
  }
});
