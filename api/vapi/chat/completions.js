export const config = {
  runtime: "edge",
};

export default async function handler(req) {
  // Handle CORS Preflight
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
    const messages = body?.messages || [];

    // Direct stream request to Groq OpenAI endpoint
    const groqResponse = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            {
              role: "system",
              content:
                "You are Réne, an elite luxury fashion assistant for Réne Atelier. Keep answers concise, natural, elegant, and conversational for voice. Do not use Markdown formatting like asterisks or bullet points.",
            },
            ...messages,
          ],
          stream: true,
          temperature: 0.7,
          max_tokens: 150,
        }),
      }
    );

    if (!groqResponse.ok) {
      const errText = await groqResponse.text();
      console.error("Groq API Error:", errText);
      return new Response(JSON.stringify({ error: errText }), { status: 500 });
    }

    // Return the stream back to Vapi
    return new Response(groqResponse.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    console.error("Vapi Edge Handler Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}