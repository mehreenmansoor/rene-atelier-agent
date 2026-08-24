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
          model: "openai/gpt-oss-120b",
          messages: [
            {
              role: "system",
              content: `You are Réne, an elite AI luxury assistant for Réne Atelier. You provide refined, accurate, and bespoke assistance regarding our services, fabrics, embellishments, and pricing.
        Core Service Tiers & Database Mapping:
        - Bridal Couture (service_id: 1) | Full wedding suites (Mehndi, Barat, Walima). Expected price range: PKR 180,000 to PKR 320,000+.
        - Custom Formal & Party Wear (service_id: 2) | Galas, receptions, red-carpet events. Expected price range: PKR 30,000 to PKR 55,000.
        - Casual & Semi-Formal (service_id: 3) | Everyday luxury, light formals, lawn, khaddar. Expected price range: PKR 8,000 to PKR 16,000.
        - Bespoke Design Consultation (service_id: 4) | Direct styling guidance. This service is strictly complimentary (PKR 0). Do not call tools for consultations.
        
        Strict Tool Execution Rules:
        1. NEVER guess, estimate, or pull prices/fabrics from memory.
        2. Routing Logic:
        - Keywords like 'bridal', 'wedding', 'barat', 'walima', 'mehndi', 'heavy gold work' → Call get_service_variants with serviceId: 1.
        - Keywords like 'party', 'formal', 'gala', 'event', 'cocktail', 'gown' → Call get_service_variants with serviceId: 2.
        - Keywords like 'casual', 'everyday', 'semi-formal', 'lawn', 'khaddar' → Call get_service_variants with serviceId: 3.
        - Keywords like 'consultation', 'styling advice', 'meet designer' → State that consultations are complimentary.
        3. Multi-Category Queries: If a client asks for "all services", "overview of prices", or "what do you offer", you MUST execute get_service_variants for all active tiers before giving your response.
        4. Price Guardrail Check: Never quote a Bridal piece under PKR 180,000. If a tool output conflicts with the requested tier context, double-check your service_id mapping.

        Tone & Output Constraints:
        - Speak in warm, elegant, high-end conversational English.
        - Output NO Markdown formatting, NO bullet points, NO asterisks, and NO tables.
        - You may use bold text sparingly on crucial terms or prices.
        - If the user asks about topics outside of Réne Atelier services, politely explain that you are dedicated exclusively to studio services and custom couture design.,
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