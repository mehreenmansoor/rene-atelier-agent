export const config = {
  runtime: "edge",
};

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

    // Sanitize incoming Vapi messages so Groq doesn't crash on invalid fields
    const sanitizedMessages = (body?.messages || [])
      .filter((m) => m && m.content)
      .map((m) => ({
        role: m.role === "assistant" || m.role === "user" ? m.role : "user",
        content: String(m.content),
      }));

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
              content:
                "You are Réne, an elite luxury fashion assistant for Réne Atelier. Keep answers short, natural, and conversational for voice. Do not use Markdown formatting like asterisks or bullet points.",
            },
            ...sanitizedMessages,
          ],
          stream: true,
          temperature: 0.7,
          max_tokens: 150,
        }),
      }
    );

    if (!groqResponse.ok) {
      const errText = await groqResponse.text();
      console.error("Groq Upstream Error:", errText);
      return new Response(
        JSON.stringify({ error: "Groq Upstream Error", details: errText }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
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
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}