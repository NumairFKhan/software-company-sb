/**
 * /chat – AI Coach Chat page (server component wrapper).
 *
 * Auth is handled by the parent (app) layout — any unauthenticated request is
 * redirected to /login before this page renders. This server component simply
 * mounts the client-side ChatClient which owns all interactive state.
 */

import type { Metadata } from "next";
import ChatClient from "./ChatClient";

export const metadata: Metadata = {
  title: "Ask Coach · CourtCoach AI",
  description: "Chat with your AI tennis coach for personalised advice.",
};

export default function ChatPage() {
  return <ChatClient />;
}
