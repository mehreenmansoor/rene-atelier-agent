import React, { useState, useRef, useEffect } from "react";
import { Send, Sparkles, User, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";

export default function ReneChat() {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "Hello! I am Réne, your luxury fashion assistant. How can I help you with our services and custom options today?",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef(null);

  // Auto-scroll to bottom of conversation
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userText = input.trim();
    setInput("");

    // Build updated conversation array
    const updatedMessages = [...messages, { role: "user", content: userText }];
    setMessages(updatedMessages);
    setLoading(true);

    try {
      // Send full conversation history instead of single message
      const response = await fetch("http://localhost:3000/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: updatedMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      const data = await response.json();

      if (data.reply) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.reply },
        ]);
      } else {
        throw new Error(data.error || "Failed to receive response");
      }
    } catch (err) {
      console.error("Chat Error:", err);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, I ran into an error connecting to the server.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[640px] w-full max-w-2xl mx-auto rounded-3xl shadow-2xl overflow-hidden font-sans bg-[#F7F3EC]">
      <style>{`
        @keyframes rene-in {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .rene-msg { animation: rene-in 0.28s ease-out; }
        @keyframes rene-pulse {
          0%, 100% { opacity: 0.35; }
          50% { opacity: 1; }
        }
        .rene-dot { animation: rene-pulse 1.4s ease-in-out infinite; }
        .rene-dot:nth-child(2) { animation-delay: 0.15s; }
        .rene-dot:nth-child(3) { animation-delay: 0.3s; }
        @media (prefers-reduced-motion: reduce) {
          .rene-msg { animation: none; }
          .rene-dot { animation: none; }
        }
      `}</style>

      {/* Header */}
      <div className="relative bg-gradient-to-r from-[#2A2420] to-[#3D332B] text-stone-100 px-6 py-5 flex items-center gap-3 border-b border-black/20">
        <div className="p-2.5 bg-black/20 rounded-full border border-amber-200/30">
          <Sparkles className="w-4 h-4 text-amber-200" />
        </div>
        <div className="flex-1">
          <h2 className="font-serif tracking-wide text-lg font-medium">Réne</h2>
          <p className="text-[11px] uppercase tracking-[0.15em] text-amber-200/60">
            Atelier Concierge
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-stone-300/70">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          Online
        </div>
      </div>

      {/* Messages Feed */}
      <div className="flex-1 p-6 overflow-y-auto space-y-4">
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`rene-msg flex items-start gap-3 ${
              msg.role === "user" ? "flex-row-reverse" : "flex-row"
            }`}
          >
            <div
              className={`p-2 rounded-full shrink-0 ${
                msg.role === "user"
                  ? "bg-[#2A2420] text-stone-100"
                  : "bg-amber-100 text-amber-900 border border-amber-200"
              }`}
            >
              {msg.role === "user" ? (
                <User className="w-4 h-4" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
            </div>

            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-[#2A2420] text-stone-100 rounded-tr-sm shadow-md"
                  : "bg-white text-stone-800 border border-stone-200/80 shadow-sm rounded-tl-sm whitespace-pre-wrap"
              }`}
            >
              <ReactMarkdown
                components={{
                  p: ({ children }) => (<p className="mb-2 last:mb-0">{children}</p>),
                  ul: ({ children }) => (<ul className="list-disc pl-4 space-y-1 my-2">{children}</ul>),
                  strong: ({ children }) => (<strong className="font-semibold text-stone-900">{children}</strong>),
                }}
              >
                {msg.content}
              </ReactMarkdown>
            </div>
          </div>
        ))}

        {loading && (
          <div className="rene-msg flex items-center gap-3">
            <div className="p-2 rounded-full bg-amber-100 text-amber-900 border border-amber-200">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="bg-white border border-stone-200/80 shadow-sm px-4 py-3 rounded-2xl rounded-tl-sm flex items-center gap-2 text-sm text-stone-500">
              <span className="flex gap-1">
                <span className="rene-dot w-1.5 h-1.5 rounded-full bg-amber-600" />
                <span className="rene-dot w-1.5 h-1.5 rounded-full bg-amber-600" />
                <span className="rene-dot w-1.5 h-1.5 rounded-full bg-amber-600" />
              </span>
              Checking studio variants & pricing
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input Area */}
      <form
        onSubmit={handleSendMessage}
        className="p-4 bg-white/70 backdrop-blur border-t border-stone-200/80 flex gap-2 items-center"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about custom formals, pricing, fabrics..."
          className="flex-1 border border-stone-300 rounded-full px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#2A2420]/40 focus:border-transparent transition-all bg-white"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="bg-[#2A2420] text-stone-100 hover:bg-[#3D332B] disabled:opacity-40 disabled:cursor-not-allowed w-10 h-10 rounded-full transition-all flex items-center justify-center shrink-0"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </button>
      </form>
    </div>
  );
}
