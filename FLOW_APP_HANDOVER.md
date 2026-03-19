Flow App — Claude Code Handover Summary
Date: 2026-02-13
Purpose: Bring Claude Code up to speed on the Flow app project, planned features, and architectural direction.

Project Overview
Flow is a multi-user project management web app, similar in concept to Monday.com, but with a strong emphasis on beautiful UI/UX, an innovative Gantt view, AI-powered project intelligence, and a privacy-first time tracking system. The app is already in active development with a working codebase.

Existing Tech Stack

Frontend: React + Vite (single-page app)
Backend/Auth: Firebase Authentication
Database: Cloud Firestore
File Storage: Firebase Storage
Email invites: Firestore mail collection
Security: Firestore security rules (role-based)

The stack is open for reconsideration if a better fit is identified. Priority is robustness and security over familiarity.

What's Already Built

Workspace selector and board list in sidebar
Board creation within workspaces
Main Table and Gantt views with date drag/resize
Group, item, and subitem structure and editing
Status and job type label systems
Updates panel with notes, checklists, and replies
File attachments with per-file minimum role policy
Firebase Auth (guest + account modes)
Firestore-backed sync with role-aware listeners
Membership management, invites, and access requests


Known Technical Debt (Address Before New Features)

App is heavily centralised in a large App.jsx — needs to be broken into modular components to reduce change risk.
UI styling should be separated into dedicated design token/theme files so it can be iterated independently of functionality.
V1 cleanup tasks: harden invite UX, improve empty-state onboarding, replace fallback-driven flows with explicit permission-aware UI states, add regression tests for role-based editing.


Planned Features (in priority order)
1. Enhanced Gantt View

Stackable structure: items with subitems expand into individual rows, each with a timeline bar.
Collapse mode: subitems collapse into the parent row with bars slightly offset so all are visible simultaneously in a single row.
Solves the real estate problem of traditional Gantt charts.
Gantt and Board views are fully linked — changes in one reflect immediately in the other.

2. Item Sidebar

Clicking any item or subitem opens a sidebar panel containing:

Threaded updates feed with @mentions, replies, and real-time notifications
File attachments
Project brief for that item



3. Real-Time Notifications

Users get real-time alerts when tagged in updates or when relevant changes occur.
Notification center accessible from the app header.

4. Time Tracking with Screenshot Timeline

Native apps on each device (Windows, Mac, iOS, Android) capture screenshots every 1–5 minutes.
Screenshots stored locally on each device (privacy-first).
Syncs to a central hub device when on home/office WiFi; only current device accessible when away.
Web app includes a timeline scrubber to view screenshots and drag time blocks to log time against projects.
Cloud storage for screenshots is a future optional feature — not in initial scope.
Recommended tech: React Native (cross-platform, single codebase).

5. AI Project Intelligence (V2+)

AI assistant with full context of each project — tasks, timelines, updates, conversations.
Meeting transcript ingestion with speaker diarization and user-labeled speakers.
Living project brief that the AI maintains and updates as new information arrives.
Email integration via a generated project email address — AI flags when brief/deliverables should be updated and prompts user for approval.


UI/UX Direction

Visually beautiful, clean, simple, and intuitive — a core differentiator for Flow.
Carefully chosen color palette with harmony tools for user-defined label colors.
UI styling/design tokens kept in separate dedicated files from functional logic.
Ben is designing the UI himself — expect frequent iteration on design.


Architecture Principles Going Forward

Move away from monolithic App.jsx toward modular, well-separated components.
Clear separation between UI/styling and functional logic.
Native time tracking apps (React Native) treated as a separate project connecting to the same backend.
This file and PROJECT_SPEC.md are the sources of truth — keep them updated as the codebase evolves.


Working Agreement

Reference this file and PROJECT_SPEC.md at the start of each new Claude Code session.
Before implementing any feature, confirm whether it changes product behaviour, data model, or permissions.
Suggest architectural improvements proactively — don't treat the existing structure as sacred.
Prioritise clean, maintainable code and a beautiful user experience above all else.