/**
 * @jest-environment jsdom
 *
 * Tests for ChatBubbles.tsx — verifies that:
 *  - AssistantBubble renders markdown symbols as proper HTML elements
 *    (**bold** → <strong>, _italic_ → <em>, bullet lists → <ul><li>, etc.)
 *  - No raw markdown symbols (**, -, #) appear in the rendered text
 *  - UserBubble renders text verbatim (no markdown parsing)
 *  - Streaming states (typing indicator, cursor) are handled correctly
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

import {
  AssistantBubble,
  UserBubble,
  TypingIndicator,
} from "@/components/ChatBubbles";

// ── AssistantBubble — markdown rendering ──────────────────────────────────────

describe("AssistantBubble — markdown rendering", () => {
  it("renders **bold** text as a <strong> element", () => {
    const { container } = render(
      <AssistantBubble content="This is **bold** text." />
    );
    const strong = container.querySelector("strong");
    expect(strong).toBeInTheDocument();
    expect(strong).toHaveTextContent("bold");
  });

  it("renders _italic_ text as an <em> element", () => {
    const { container } = render(
      <AssistantBubble content="This is _italic_ text." />
    );
    const em = container.querySelector("em");
    expect(em).toBeInTheDocument();
    expect(em).toHaveTextContent("italic");
  });

  it("renders *italic* (asterisk style) text as an <em> element", () => {
    const { container } = render(
      <AssistantBubble content="This is *italic* text." />
    );
    const em = container.querySelector("em");
    expect(em).toBeInTheDocument();
    expect(em).toHaveTextContent("italic");
  });

  it("renders a bullet list as <ul> with <li> children", () => {
    const { container } = render(
      <AssistantBubble
        content={"- First item\n- Second item\n- Third item"}
      />
    );
    expect(container.querySelector("ul")).toBeInTheDocument();
    const items = container.querySelectorAll("li");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("First item");
    expect(items[1]).toHaveTextContent("Second item");
    expect(items[2]).toHaveTextContent("Third item");
  });

  it("renders a numbered list as <ol> with <li> children", () => {
    const { container } = render(
      <AssistantBubble
        content={"1. First step\n2. Second step\n3. Third step"}
      />
    );
    expect(container.querySelector("ol")).toBeInTheDocument();
    const items = container.querySelectorAll("li");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("First step");
  });

  it("does not show raw ** symbols in the rendered output", () => {
    const { container } = render(
      <AssistantBubble content="Here is **important** advice." />
    );
    expect(container.textContent).not.toContain("**");
    expect(container.textContent).toContain("important");
  });

  it("does not show raw - prefix symbols for bullet list items", () => {
    const { container } = render(
      <AssistantBubble content={"- Item one\n- Item two"} />
    );
    expect(container.querySelector("ul")).toBeInTheDocument();
    // Each list item's text content should not begin with "- "
    const items = container.querySelectorAll("li");
    items.forEach((li) => {
      expect(li.textContent?.trim()).not.toMatch(/^- /);
    });
  });

  it("does not show raw # symbol for headings", () => {
    const { container } = render(
      <AssistantBubble content="# Training Plan" />
    );
    const heading = container.querySelector("h1");
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveTextContent("Training Plan");
    expect(container.textContent).not.toContain("#");
  });

  it("renders multiple paragraphs separated by blank lines correctly", () => {
    const { container } = render(
      <AssistantBubble
        content={"First paragraph.\n\nSecond paragraph."}
      />
    );
    const paragraphs = container.querySelectorAll("p");
    expect(paragraphs.length).toBeGreaterThanOrEqual(2);
  });

  it("renders inline code as a <code> element", () => {
    const { container } = render(
      <AssistantBubble content="Use `react-markdown` for this." />
    );
    const code = container.querySelector("code");
    expect(code).toBeInTheDocument();
    expect(code).toHaveTextContent("react-markdown");
  });
});

// ── AssistantBubble — streaming states ────────────────────────────────────────

describe("AssistantBubble — streaming states", () => {
  it("shows the typing indicator when streaming and content is empty", () => {
    render(<AssistantBubble content="" streaming={true} />);
    expect(screen.getByLabelText("Coach is typing")).toBeInTheDocument();
  });

  it("does NOT show the typing indicator when not streaming", () => {
    render(<AssistantBubble content="" streaming={false} />);
    expect(screen.queryByLabelText("Coach is typing")).not.toBeInTheDocument();
  });

  it("shows the streaming cursor when content is present and streaming=true", () => {
    const { container } = render(
      <AssistantBubble content="Partial response..." streaming={true} />
    );
    // Cursor element has the animate-pulse class
    const cursor = container.querySelector(".animate-pulse");
    expect(cursor).toBeInTheDocument();
  });

  it("does NOT show the streaming cursor once streaming is finished", () => {
    const { container } = render(
      <AssistantBubble content="Full response here." streaming={false} />
    );
    const cursor = container.querySelector(".animate-pulse");
    expect(cursor).not.toBeInTheDocument();
  });

  it("renders markdown correctly during streaming (partial content)", () => {
    // Simulates mid-stream: closing ** not yet arrived — raw text is acceptable
    // but once complete, markdown must parse.
    const { container } = render(
      <AssistantBubble content="Here is **bold** advice" streaming={true} />
    );
    // Even during streaming, complete markdown tokens render correctly
    expect(container.querySelector("strong")).toBeInTheDocument();
    expect(container.querySelector("strong")).toHaveTextContent("bold");
  });
});

// ── UserBubble — plain text (no markdown) ─────────────────────────────────────

describe("UserBubble — plain text rendering", () => {
  it("renders the message text verbatim", () => {
    render(<UserBubble content="What should I train today?" />);
    expect(
      screen.getByText("What should I train today?")
    ).toBeInTheDocument();
  });

  it("does NOT parse **bold** markdown — renders raw asterisks instead", () => {
    const { container } = render(
      <UserBubble content="My **serve** is weak." />
    );
    // No <strong> element — plain text only
    expect(container.querySelector("strong")).not.toBeInTheDocument();
    // The raw ** characters are visible
    expect(container.textContent).toContain("**");
  });

  it("does NOT parse bullet list syntax — shows raw text", () => {
    const { container } = render(
      <UserBubble content="- backhand\n- serve" />
    );
    expect(container.querySelector("ul")).not.toBeInTheDocument();
    expect(container.querySelector("li")).not.toBeInTheDocument();
  });
});

// ── TypingIndicator ────────────────────────────────────────────────────────────

describe("TypingIndicator", () => {
  it("renders with the accessible 'Coach is typing' label", () => {
    render(<TypingIndicator />);
    expect(screen.getByLabelText("Coach is typing")).toBeInTheDocument();
  });

  it("renders exactly 3 animated dots", () => {
    const { container } = render(<TypingIndicator />);
    const dots = container.querySelectorAll(".animate-bounce");
    expect(dots).toHaveLength(3);
  });
});
