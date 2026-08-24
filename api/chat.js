import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

// 1. Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY,
);

// 2. Initialize OpenAI SDK configured for Groq
const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

// 3. Database query helper function
async function getServiceVariants(serviceId) {
  const parsedId = parseInt(serviceId, 10);
  if (isNaN(parsedId)) return { error: "Invalid service ID" };

  const { data, error } = await supabase
    .from("service_variants")
    .select(
      `
      id, service_id, weight, price,
      fabric_types ( name ),
      embroidery_types ( name )
    `,
    )
    .eq("service_id", parsedId);

  if (error) return { error: error.message };

  return data.map((v) => ({
    fabric: v.fabric_types?.name || "Standard",
    embroidery: v.embroidery_types?.name || "Standard",
    weight: v.weight,
    price: `PKR ${v.price}`,
  }));
}

// 4. Tool Schema Definition
const tools = [
  {
    type: "function",
    function: {
      name: "get_service_variants",
      description:
        "Retrieves fabric, embroidery, weight, and pricing options for a specific clothing service ID.",
      parameters: {
        type: "object",
        properties: {
          serviceId: {
            type: "integer",
            description:
              "The numeric service ID to query variants for (e.g., 1).",
          },
        },
        required: ["serviceId"],
      },
    },
  },
];

// 5. Express Route Endpoint
export default async function handler(req, res) {
  try {
    const { messages: incomingMessages } = req.body;

    if (
      !incomingMessages ||
      !Array.isArray(incomingMessages) ||
      incomingMessages.length === 0
    ) {
      return res.status(400).json({ error: "Messages array is required." });
    }

    const messages = [
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
        - If the user asks about topics outside of Réne Atelier services, politely explain that you are dedicated exclusively to studio services and custom couture design.`
      },
      ...incomingMessages,
    ];

    // First Pass: Model evaluates prompt & determines if a tool is needed
    let response = await groq.chat.completions.create({
      model: "openai/gpt-oss-120b",
      messages: messages,
      tools: tools,
      tool_choice: "auto",
    });

    let responseMessage = response.choices[0].message;

    // Check if model triggered tool calls
    if (responseMessage.tool_calls) {
      console.log(
        "Tool Call Requested:",
        responseMessage.tool_calls[0].function,
      );

      // Append assistant's tool-call request message to conversation memory
      messages.push(responseMessage);

      for (const toolCall of responseMessage.tool_calls) {
        if (toolCall.function.name === "get_service_variants") {
          const args = JSON.parse(toolCall.function.arguments);

          // Execute Supabase lookup
          const variantsData = await getServiceVariants(args.serviceId);
          console.log("\nSupabase Data Fetched:", variantsData);

          // Append tool execution response to conversation memory
          messages.push({
            tool_call_id: toolCall.id,
            role: "tool",
            name: "get_service_variants",
            content: JSON.stringify(variantsData),
          });
        }
      }

      // Second Pass: Send updated context back to model for final text reply
      response = await groq.chat.completions.create({
        model: "openai/gpt-oss-120b",
        messages: messages,
        tools: tools,
        tool_choice: "auto",
      });
    }

    return res.json({ reply: response.choices[0].message.content });
  } catch (err) {
    console.error("Chat Route Error:", err);
    return res.status(500).json({ error: err.message });
  }
}

export default async function handler(req, res) {
  // 1. Enable CORS for web and Vapi requests
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    let userMessage = "";

    // 2. Extract transcript if payload comes from Vapi
    if (req.body?.message?.type === "transcript" && req.body?.message?.transcriptType === "final") {
      userMessage = req.body.message.transcript;
    } else if (req.body?.message) {
      userMessage = typeof req.body.message === "string" ? req.body.message : req.body.message.content;
    } else if (req.body?.inputMessage) {
      userMessage = req.body.inputMessage;
    }

    // Acknowledge Vapi status/ping events without throwing an error
    if (!userMessage && req.body?.message?.type !== "function-call") {
      return res.status(200).json({ acknowledged: true });
    }

    // 3. RUN YOUR EXISTING GROQ & SUPABASE LOGIC HERE
    // Example: const replyText = await getGroqResponse(userMessage);
    const replyText = "Welcome to Réne Atelier. How can I assist you with our custom formal or bridal couture services today?";

    // 4. Return response formatted for both Vapi and standard web chat
    return res.status(200).json({
      results: [
        {
          toolCallId: req.body?.message?.toolCalls?.[0]?.id,
          result: replyText
        }
      ],
      response: replyText,
      reply: replyText
    });

  } catch (error) {
    console.error("Vapi/Chat Error:", error);
    return res.status(500).json({ error: error.message });
  }
}