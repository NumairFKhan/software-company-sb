#!/usr/bin/env bash
# =============================================================================
# scripts/check-bundle-safety.sh
#
# CourtCoach AI – Client-bundle secret leak detector
# ===================================================
#
# Scans the Next.js production build output (.next/static/**) for any
# occurrence of server-only environment variable names or values that must
# never reach the browser.
#
# Secrets checked:
#   • The literal string "ANTHROPIC_API_KEY"   – the variable name itself
#   • The literal string "sk-ant-"             – Anthropic key prefix
#
# Usage:
#   1. Run `npm run build` first (or `next build`).
#   2. Run this script: bash scripts/check-bundle-safety.sh
#
# Exit codes:
#   0 – nothing found; bundle appears safe
#   1 – leak detected or build output missing
# =============================================================================

set -euo pipefail

STATIC_DIR=".next/static"
FOUND=0

echo "╔════════════════════════════════════════════════════════════╗"
echo "║         CourtCoach AI — Bundle Safety Check                ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# ── Pre-flight: build must exist ─────────────────────────────────────────────

if [ ! -d "$STATIC_DIR" ]; then
  echo "❌  Build output not found at $STATIC_DIR"
  echo "    Run 'npm run build' first, then re-run this script."
  exit 1
fi

echo "📦  Scanning: $STATIC_DIR"
echo ""

# ── Check 1: ANTHROPIC_API_KEY variable name ─────────────────────────────────

echo "── Check 1: 'ANTHROPIC_API_KEY' variable name ──────────────────"
if grep -r --include="*.js" -l "ANTHROPIC_API_KEY" "$STATIC_DIR" 2>/dev/null; then
  echo "❌  FAIL: 'ANTHROPIC_API_KEY' found in client JS bundle(s) above!"
  FOUND=1
else
  echo "✅  PASS: 'ANTHROPIC_API_KEY' not found in client JS bundles."
fi
echo ""

# ── Check 2: Anthropic key prefix (sk-ant-) ──────────────────────────────────

echo "── Check 2: Anthropic key prefix 'sk-ant-' ─────────────────────"
if grep -r --include="*.js" -l "sk-ant-" "$STATIC_DIR" 2>/dev/null; then
  echo "❌  FAIL: Anthropic API key prefix 'sk-ant-' found in client JS bundle(s)!"
  FOUND=1
else
  echo "✅  PASS: No Anthropic key prefix detected in client JS bundles."
fi
echo ""

# ── Summary ──────────────────────────────────────────────────────────────────

echo "────────────────────────────────────────────────────────────────"
if [ "$FOUND" -eq 0 ]; then
  echo "✅  ALL CHECKS PASSED — no secret leaks detected in client bundle."
  echo ""
  exit 0
else
  echo "❌  SECURITY ISSUE: Secret(s) found in the client bundle!"
  echo ""
  echo "    Root cause is usually one of:"
  echo "    • A variable prefixed with NEXT_PUBLIC_ that should not be."
  echo "    • A server-only module imported inside a Client Component."
  echo "    • A config file that accidentally passes env vars to the frontend."
  echo ""
  echo "    Fix: ensure ANTHROPIC_API_KEY is only accessed in Server Components,"
  echo "    API routes, and server-side helpers — never in 'use client' files."
  exit 1
fi
