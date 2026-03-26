# Storyboard Audio Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix subtitle formatting, role-based voices, character asset usage in export, and basic audio transition quality for the manga preview/export flow.

**Architecture:** Keep the current MVP structure of database metadata plus storyboard/assets on disk. Extend the storyboard JSON and preview timeline response so the backend can derive richer TTS segments and shot composition without introducing new tables.

**Tech Stack:** FastAPI, SQLAlchemy, Pydantic, React, TypeScript, FFmpeg

---

### Task 1: Extend storyboard/timeline data contracts
- [ ] Add character voice fields and shot character bindings in backend and frontend types.
- [ ] Extend preview timeline schema to carry character overlays and segmented audio metadata.

### Task 2: Generate TTS per segment
- [ ] Build TTS jobs/assets per narration/dialogue segment instead of one clip per shot.
- [ ] Pass per-character voice IDs into TTS provider calls.

### Task 3: Improve render pipeline
- [ ] Remove speaker prefixes from subtitle text.
- [ ] Use shot character assets as overlays in FFmpeg composition.
- [ ] Sequence segmented audio with short pauses/fades and derive shot duration from actual clip lengths when available.

### Task 4: Update editor and export UI
- [ ] Allow editing character voice settings and shot character participation.
- [ ] Reflect segmented audio/character coverage in preview/export panels.

### Task 5: Verify
- [ ] Run frontend lint/build and targeted backend checks.
- [ ] Smoke test preview/export endpoints against the current local environment.
