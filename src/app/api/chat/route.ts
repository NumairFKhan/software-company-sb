/**
 * POST /api/chat
 *
 * Streaming AI coach chat endpoint.
 *
 * Request body:
 *   {
 *     message:   string        – the user's new message
 *     sessionId: string        – opaque browser-session ID (UUID)
 *     history:   Array<{role: "user"|"assistant", content: string}>
 *                              – current session's conversation so far (optional)
 *   }
 *
 * Response (on success):
 *   text/plain stream of assistant tokens as they arrive from Claude.
 *
 * Error responses:
 *   401 – unauthenticated
 *   400 – missing / invalid body fields
 *   429 – rate limit exceeded (30 user messages per hour)
 *   500 – upstream error
 *
 * Security:
 *   - Auth-gated via Supabase SSR session cookie.
 *   - ANTHROPIC_API_KEY is server-only (never exposed to the client).
 *   - Supabase RLS ensures users can only read/write their own rows.
 */

import { createClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt } from "@/lib/chat-context";
import { checkChatRateLimit } from "@/lib/rate-limit";
import type { PlayerProfile, SessionLog } from "@/types/database";

// Initialise the Anthropic client once per Lambda cold-start.
// ANTHROPIC_API_KEY must be set in the server environment only.
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const CLAUDE_MODEL = "claude-sonnet-4-5";
const MAX_TOKENS = 1024;
// Keep at most the last N conversation turns in context to avoid runaway costs.
const MAX_HISTORY_MESSAGES = 20;

type MessageParam = {
  role: "user" | "assistant";
  content: string;
};

// ── POST handler ──────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  // ── Auth guard ─────────────────────────────────────────────────────────────
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── Rate limit ─────────────────────────────────────────────────────────────
  const rateLimit = await checkChatRateLimit(supabase, user.id);

  if (!rateLimit.allowed) {
    const resetTime = rateLimit.resetAt.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    });

    return new Response(
      JSON.stringify({
        error: `You've sent 30 messages this hour. Your limit resets around ${resetTime} — hang tight and come back soon!`,
        code: "RATE_LIMITED",
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "X-RateLimit-Limit": "30",
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": rateLimit.resetAt.toISOString(),
        },
      }
    );
  }

  // ── Parse & validate body ──────────────────────────────────────────────────
  let body: { message?: unknown; sessionId?: unknown; history?: unknown };
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const { message, sessionId, history = [] } = body;

  if (typeof message !== "string" || message.trim().length === 0) {
    return new Response(
      JSON.stringify({ error: "message must be a non-empty string" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  if (typeof sessionId !== "string" || sessionId.trim().length === 0) {
    return new Response(
      JSON.stringify({ error: "sessionId must be a non-empty string" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!Array.isArray(history)) {
    return new Response(
      JSON.stringify({ error: "history must be an array" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const trimmedMessage = message.trim();

  // ── Fetch player context (profile + last-30-day sessions) ──────────────────
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().slice(0, 10);

  const [profileResult, sessionsResult] = await Promise.all([
    supabase
      .from("player_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("session_logs")
      .select("*")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .gte("log_date", thirtyDaysAgoStr)
      .order("log_date", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  if (profileResult.error) {
    console.error("[POST /api/chat] profile fetch error:", profileResult.error);
  }
  if (sessionsResult.error) {
    console.error("[POST /api/chat] sessions fetch error:", sessionsResult.error);
  }

  const profile = (profileResult.data as PlayerProfile | null) ?? null;
  const recentSessions = (sessionsResult.data as SessionLog[]) ?? [];

  // ── Build system prompt ────────────────────────────────────────────────────
  const systemPrompt = buildSystemPrompt(profile, recentSessions);

  // ── Persist user message before streaming ──────────────────────────────────
  const { error: insertError } = await supabase.from("chat_messages").insert({
    user_id: user.id,
    session_id: sessionId,
    role: "user",
    content: trimmedMessage,
  });

  if (insertError) {
    console.error("[POST /api/chat] failed to save user message:", insertError);
    // Non-fatal: continue streaming even if storage fails
  }

  // ── Build conversation history for Claude ──────────────────────────────────
  // Use only the current browser-session messages, capped to avoid context bloat.
  const validHistory: MessageParam[] = (history as Array<unknown>)
    .filter(
      (m): m is MessageParam =>
        typeof m === "object" &&
        m !== null &&
        "role" in m &&
        "content" in m &&
        (m as MessageParam).role !== undefined &&
        typeof (m as MessageParam).content === "string"
    )
    .slice(-MAX_HISTORY_MESSAGES);

  const messages: MessageParam[] = [
    ...validHistory,
    { role: "user", content: trimmedMessage },
  ];

  // ── Stream Claude response ─────────────────────────────────────────────────
  const encoder = new TextEncoder();
  let assistantContent = "";

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const claudeStream = anthropic.messages.stream({
          model: CLAUDE_MODEL,
          max_tokens: MAX_TOKENS,
          system: systemPrompt,
          messages,
        });

        for await (const chunk of claudeStream) {
          if (
            chunk.type === "content_block_delta" &&
            chunk.delta.type === "text_delta"
          ) {
            const text = chunk.delta.text;
            assistantContent += text;
            controller.enqueue(encoder.encode(text));
          }
        }

        // Persist the full assistant reply after streaming completes
        if (assistantContent.length > 0) {
          const { error: assistantInsertError } = await supabase
            .from("chat_messages")
            .insert({
              user_id: user.id,
              session_id: sessionId,
              role: "assistant",
              content: assistantContent,
            });

          if (assistantInsertError) {
            console.error(
              "[POST /api/chat] failed to save assistant message:",
              assistantInsertError
            );
          }
        }

        controller.close();
      } catch (err) {
        console.error("[POST /api/chat] streaming error:", err);
        controller.error(err);
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Content-Type-Options": "nosniff",
      "X-RateLimit-Limit": "30",
      "X-RateLimit-Remaining": String(rateLimit.remaining - 1),
    },
  });
}
