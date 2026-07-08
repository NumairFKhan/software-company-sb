import type { Metadata } from "next";
import HistoryClient from "./HistoryClient";

export const metadata: Metadata = {
  title: "Training History | CourtCoach AI",
  description: "Browse your training sessions, filter by type and view your 14-day performance summary.",
};

export default function HistoryPage() {
  return <HistoryClient />;
}
