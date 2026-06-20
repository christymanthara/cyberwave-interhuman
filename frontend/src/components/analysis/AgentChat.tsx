"use client";

import React, { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Sparkles, Loader2 } from "lucide-react";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface AgentChatProps {
  sessionId?: string;
  onSelectSuggestion?: (question: string) => void;
}

const SUGGESTIONS = [
  "Summarize the social signals detected in this session.",
  "What is the overall conversation quality score?",
  "Did you notice any frustration or tension?",
  "Give me recommendations to improve rapport.",
];

export function AgentChat({ sessionId }: AgentChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "Hello! I am your InterHuman Copilot. Ask me anything about your current conversation analysis, detected social signals, or overall speech quality.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSend = async (textToSend: string) => {
    if (!textToSend.trim() || loading) return;

    const userMessage: ChatMessage = {
      role: "user",
      content: textToSend,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const chatHistory = messages.concat(userMessage);

      const response = await fetch("http://localhost:8000/v1/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: textToSend,
          session_id: sessionId,
          history: chatHistory,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to send message: ${response.statusText}`);
      }

      const data = await response.json();
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.reply || "No reply received.",
        },
      ]);
    } catch (error: unknown) {
      console.error("Chat error:", error); 
      const err = error as { message?: string };
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Sorry, I encountered an error: ${err.message || "Unknown error"}. Make sure the backend server is running.`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[480px] rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden dark:border-zinc-800 dark:bg-zinc-950">
      {/* Chat Header */}
      <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50/50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/50">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-indigo-500/10 p-1.5 dark:bg-indigo-500/20">
            <Bot className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-zinc-900 dark:text-zinc-50">InterHuman Copilot</h3>
            <div className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[9px] text-zinc-500 font-semibold uppercase dark:text-zinc-400">Agent Online</span>
            </div>
          </div>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {messages.map((msg, index) => {
          const isAssistant = msg.role === "assistant";
          return (
            <div
              key={index}
              className={`flex gap-2.5 max-w-[85%] ${
                isAssistant ? "self-start" : "self-end flex-row-reverse"
              }`}
            >
              {/* Avatar Icon */}
              <div
                className={`flex h-7 w-7 shrink-0 select-none items-center justify-center rounded-full border text-[10px] ${
                  isAssistant
                    ? "bg-indigo-50 border-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:border-indigo-900 dark:text-indigo-400"
                    : "bg-zinc-900 border-zinc-950 text-white dark:bg-zinc-100 dark:border-zinc-50 dark:text-zinc-950"
                }`}
              >
                {isAssistant ? <Bot className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
              </div>

              {/* Speech Bubble */}
              <div
                className={`rounded-xl px-3.5 py-2 text-xs leading-relaxed shadow-sm border ${
                  isAssistant
                    ? "bg-zinc-50/50 border-zinc-100 text-zinc-800 dark:bg-zinc-900/30 dark:border-zinc-850 dark:text-zinc-200"
                    : "bg-indigo-600 border-indigo-700 text-white dark:bg-indigo-550 dark:border-indigo-650"
                }`}
              >
                {msg.content}
              </div>
            </div>
          );
        })}

        {/* Loading/Typing Indicator */}
        {loading && (
          <div className="flex gap-2.5 max-w-[85%] self-start">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border bg-indigo-50 border-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:border-indigo-900 dark:text-indigo-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            </div>
            <div className="rounded-xl border border-zinc-100 bg-zinc-50/50 px-3.5 py-2.5 text-xs text-zinc-400 dark:border-zinc-850 dark:bg-zinc-900/30 flex items-center gap-1">
              Copilot is composing a response...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggestion Chips */}
      {messages.length === 1 && (
        <div className="px-4 py-2 bg-zinc-50/20 border-t border-zinc-100 flex flex-col gap-1.5 dark:border-zinc-900">
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide flex items-center gap-1">
            <Sparkles className="h-3 w-3 text-indigo-500" />
            Conversation Starters
          </span>
          <div className="flex flex-wrap gap-1.5 pb-1">
            {SUGGESTIONS.map((suggestion, idx) => (
              <button
                key={idx}
                onClick={() => handleSend(suggestion)}
                className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[10px] font-medium text-zinc-600 hover:border-zinc-350 hover:bg-zinc-50 active:bg-zinc-100 dark:border-zinc-850 dark:bg-zinc-900 dark:text-zinc-350 dark:hover:border-zinc-700 dark:hover:bg-zinc-850"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend(input);
        }}
        className="flex items-center gap-2 border-t border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Copilot about conversational insights..."
          className="flex-1 rounded-lg border border-zinc-200 bg-zinc-50/50 px-3 py-2 text-xs outline-none transition-all focus:border-zinc-950 focus:bg-white dark:border-zinc-800 dark:bg-zinc-900/50 dark:focus:border-zinc-50 dark:focus:bg-zinc-950"
        />
        <button
          type="submit"
          disabled={!input.trim() || loading}
          className="rounded-lg bg-zinc-950 p-2 text-white transition-all hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </form>
    </div>
  );
}

export default AgentChat;
