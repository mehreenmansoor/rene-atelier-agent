import { createClient } from "@supabase/supabase-js";

export const config = {
  runtime: "edge",
};

// Initialize Supabase Client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  try {
    const body = await req.json();

    // 1. Fetch live studio catalog data from Supabase
    const [{ data: variants }, { data: fabrics }, { data: embroidery }] = await Promise.all([
      supabase.from("service_variants").select("*"),
      supabase.from("fabrics").select("*"),
      supabase.from("embroidery").select("*"),
    ]);

    // Format database rows into system context
    const catalogContext = `
    OFFICIAL ATELIER CATALOG & PRICING DATA:
    - Service Categories: ${JSON.stringify(variants || [])}
    - Available Fabrics: ${JSON.stringify(fabrics || [])}
    - Embroidery Options: ${JSON.stringify(embroidery || [])}
    `;

    // 2. Clean incoming Vapi messages
    const sanitizedMessages = (body?.messages || [])
      .filter((m) => m && m.content)
      .map((m) => ({
        role: m.role === "assistant" || m.role === "user" ? m.role : "user",
        content: String(m.content),
      }));

    // 3. Send query to Groq with strictly enforced Supabase catalog rules
    const groqResponse = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openai/gpt-oss-20b",
          messages: [
            {
              role: "system",
              content: `You are Réne, an elite luxury fashion concierge for Réne Atelier.
              Strictly answer questions using ONLY the catalog, pricing, fabric, and embroidery data provided below.
              Do NOT invent default Western pricing (like $1,200 dresses or $900 suits) or generic categories. 
              Always state prices in the exact currency and ranges stored in the database (PKR).
              Keep voice responses short, natural, elegant, and clear. Avoid Markdown formatting.

              ${catalogContext}`,
            },
            ...sanitizedMessages,
          ],
          stream: true,
          temperature: 0.3, // Low temperature to prevent hallucination
          max_tokens: 150,
        }),
      }
    );

    if (!groqResponse.ok) {
      const errText = await groqResponse.text();
      console.error("Groq Error:", errText);
      return new Response(JSON.stringify({ error: errText }), { status: 500 });
    }

    return new Response(groqResponse.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    console.error("Vapi Edge Error:", err);
    return new Response(
      JSON.stringify({ error: "Edge Execution Error", message: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}