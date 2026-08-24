import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export const config = {
  runtime: "edge", // Low latency edge execution for streaming
};

export default async function handler(req) {
  // 1. CORS Preflight
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

    // 2. Stream setup from Groq
    const groqStream = await groq.chat.completions.create({
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
    });

    // 3. Transform Groq stream to OpenAI SSE format expected by Vapi
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const id = `chatcmpl-${Date.now()}`;
        
        for await (const chunk of groqStream) {
          const content = chunk.choices[0]?.delta?.content || "";
          
          if (content) {
            const sseData = {
              id: id,
              object: "chat.completion.chunk",
              created: Math.floor(Date.now() / 1000),
              model: "custom-llm",
              choices: [
                {
                  index: 0,
                  delta: { content: content },
                  finish_reason: null,
                },
              ],
            };
            
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(sseData)}\n\n`)
            );
          }
        }

        // Send closing payload
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    console.error("Vapi Edge Stream Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}