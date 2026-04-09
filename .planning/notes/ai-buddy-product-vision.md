---
title: AI Buddy Product Vision
date: 2026-04-09
context: Exploration session — ideation from Clicky (farzaa/clicky) inspiration
---

# AI Buddy — Product Vision

## One-liner
"Use any software — even if you've never used it before."

## What it is
A cross-platform desktop app that acts as a real-time task-completion guide. You say what you want to do, it sees your screen, and tells you how — step by step.

## What it is NOT
- Not a learning platform
- Not an AI assistant / chatbot
- Not "ChatGPT + screenshot"

## Core Insight
Users don't think "teach me Figma." They think "how do I do this one thing?" Learning is the side effect of task completion.

## Positioning
Real-time guide that teaches you by helping you complete tasks in tools. No integrations needed. Works on any tool. Instant coverage.

## Key Differentiators from Clicky
- **Cross-platform** (Mac + Windows via Tauri v2, not Swift-only)
- **Multi-modal input** — voice, text, highlight, box-select screen regions
- **Learning memory** — granular knowledge graph, derives high-level profile
- **Degrading guidance** — detailed steps first time, shorter second time, hints third time

## Accuracy Philosophy
- Intent accuracy > Flow accuracy > UI precision
- Directional guidance ("top toolbar, look for filter icon") not pixel-perfect ("3rd button from left")
- Success metric: did the user complete the task?

## Key Principle
"A slightly vague guide that gets you to the result is better than a precise system that fails half the time."

## Evolution Path
- **V1:** Directional guidance, intent capture, step-by-step, lightweight memory
- **V2:** Visual grounding, highlight regions, smarter phrasing
- **V3:** App-specific tuning, optional DOM assist (web), partial automation

## Tech Stack
- **Framework:** Tauri v2 (Rust backend, ~15-30MB RAM)
- **AI:** Claude (vision + reasoning)
- **Voice:** Speech-to-text + Text-to-speech (providers TBD)
- **Proxy:** Cloudflare Worker (API key management)

## Why Desktop, Not Browser Extension
A browser extension is limited to tabs. A desktop app can see everything — browser, PDFs, local files, desktop apps. Superset coverage.

## Why Not Mobile
iOS/Android sandbox apps — no screen observation of other apps. Core mechanic doesn't translate. Desktop first; mobile is a future "maybe."
