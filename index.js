import express from "express";
import cors from "cors";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors()); 

// 1. Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
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
    .select(`
      id, service_id, weight, price,
      fabric_types ( name ),
      embroidery_types ( name )
    `)
    .eq("service_id", parsedId);

  if (error) return { error: error.message };

  return data.map((v) => ({
    fabric: v.fabric_types?.name || "Standard",
    embroidery: v.embroidery_types?.name || "Standard",
    weight: v.weight,
    price: `PKR ${v.price}`
  }));
}

// 4. Tool Schema Definition
const tools = [
  {
    type: "function",
    function: {
      name: "get_service_variants",
      description: "Retrieves fabric, embroidery, weight, and pricing options for a specific clothing service ID.",
      parameters: {
        type: "object",
        properties: {
          serviceId: {
            type: "integer",
            description: "The numeric service ID to query variants for (e.g., 1)."
          }
        },
        required: ["serviceId"]
      }
    }
  }
];

// 5. Express Route Endpoint
app.post("/chat", async (req, res) => {
  try {
    const { messages: incomingMessages } = req.body;

    if (!incomingMessages || !Array.isArray(incomingMessages) || incomingMessages.length === 0) {
      return res.status(400).json({ error: "Messages array is required." });
    }

    const messages = [
      {
        role: "system",
        content: `You are Réne, an AI assistant for a luxury fashion studio. 
        Use available tools to fetch accurate pricing and variant information before answering pricing queries. 
        Respond in plain, natural spoken language only — no Markdown, no tables, no asterisks or special formatting.
        you can bold the text which is important
        and when listing multiple options, give those options in points form 
        When listing multiple options, describe them conversationally (e.g. 'We have Raw Silk with hand Zardozi work, heavy weight embroidery, at 55,000 PKR...').
        If you are asked about anything other than pricing, variants, or services, respond politely that you are only able to provide information about our services and custom options.`
      },
      ...incomingMessages
    ];

    // First Pass: Model evaluates prompt & determines if a tool is needed
    let response = await groq.chat.completions.create({
      model: "openai/gpt-oss-120b",
      messages: messages,
      tools: tools,
      tool_choice: "auto"
    });

    let responseMessage = response.choices[0].message;

    // Check if model triggered tool calls
    if (responseMessage.tool_calls) {
      console.log("Tool Call Requested:", responseMessage.tool_calls[0].function);
      
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
            content: JSON.stringify(variantsData)
          });
        }
      }

      // Second Pass: Send updated context back to model for final text reply
      response = await groq.chat.completions.create({
        model: "openai/gpt-oss-120b",
        messages: messages
      });
    }

    return res.json({ reply: response.choices[0].message.content });

  } catch (err) {
    console.error("Chat Route Error:", err);
    return res.status(500).json({ error: err.message });
  }
});

app.listen(3000, () => console.log("Server running on http://localhost:3000"));