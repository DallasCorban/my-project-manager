# Project Specification: Project Manager AI

## Document Status
- Status: Draft (living document)
- Last updated: 2026-02-13
- Intended use: Source of truth for new threads, collaborator onboarding, and implementation alignment.

## Project Name
- Project Manager AI

## Purpose
- Build a robust multi-user project management web app where teams collaborate on shared boards.
- Support core planning workflows in both Main Table and Gantt views.
- Keep schedule and content changes synced across accounts with role-based permissions.

## Non-goals
- Full enterprise portfolio management (cross-program budgeting, resource forecasting, advanced reporting).
- Native mobile app in v1.
- Heavy workflow automation engine in v1.
- Real-time collaborative editing cursors or document-style co-editing.

## Core Concepts
- Workspace: Top-level container used to organize and filter boards.
- Board: Primary collaborative unit (stored as a project record) containing groups, items, and subitems.
- Group: Logical lane/section within a board.
- Item: Main work row on a board (sometimes called task by users).
- Subitem: Child row under an item.
- Member: User attached to a board with a role and status.
- Invite: Email-based invitation to join a board with a specific role.
- Access request: Request created by non-members to ask for board access.
- File access policy: Minimum role required to read/download a file.

## Roles and Permissions (current intent)
- Owner: Full control, including membership and board administration.
- Admin: Membership and access management plus board editing.
- Editor: Can edit board content, but cannot manage members.
- Contributor: Can edit board content and dates.
- Viewer: Read-only board access.
- Contractor: Time-bounded membership with a base role.

## User Flows
- Flow 1 (create): User creates workspace, then creates board in that workspace, and becomes owner of that board.
- Flow 2 (invite): Admin/owner invites by email and role; invite link is generated; email delivery is attempted via mail collection.
- Flow 3 (accept): Invitee opens link, signs in with invited email, membership is created/activated, board becomes visible.
- Flow 4 (collaborate): Member updates items, dates, statuses, files, and updates feed based on role.
- Flow 5 (read-only): Viewer can navigate data but cannot mutate board content.
- Flow 6 (access request): Non-member sees access-required state and can submit access request for admin review.

## Features
### Implemented
- Workspace selector and board list in sidebar.
- Board creation within selected workspace.
- Main Table and Gantt views with date drag/resize.
- Group, item, and subitem structure and editing.
- Status and job type label systems.
- Updates panel with notes/checklists/replies.
- File attachments with per-file minimum role policy.
- Firebase Auth integration (guest + account modes).
- Firestore-backed sync with role-aware listeners.
- Membership management, invites, and access requests.

### Planned (v1)
- Remove remaining user confusion around workspace vs board naming and navigation.
- Harden invite acceptance UX and diagnostics for email mismatch/token mismatch.
- Improve empty-state onboarding for brand-new workspace/board creation.
- Replace remaining fallback-driven flows with explicit permission-aware UI states.
- Add targeted regression test checklist for role-based editing (viewer/editor/admin).

### Later (v2+)
- Notifications and activity history timeline.
- Stronger audit logs and permission event tracking.
- Richer reporting/dashboard capabilities.

## Data Model (conceptual)
- Workspace entity: `id`, `name`, `type`.
- Board entity (project): `id`, `workspaceId`, `workspaceName`, `name`, `status`, `groups[]`, `tasks[]`.
- Group entity: `id`, `name`, `color`.
- Item entity: `id`, `groupId`, `name`, `start`, `duration`, `status`, `jobTypeId`, `assignee`, `subitems[]`.
- Subitem entity: `id`, `name`, `start`, `duration`, `status`, `jobTypeId`, `assignee`.
- Board membership: `projects/{projectId}/members/{uid}` with role/baseRole/status/accessUntil.
- Invite: `projects/{projectId}/invites/{inviteId}` with email, token, role, status.
- Access request: `projects/{projectId}/accessRequests/{uid}`.
- File metadata: `projects/{projectId}/files/{fileId}` with `access.minRole`.
- Board state snapshots: `projects/{projectId}/state/{stateId}`.

## Architecture (high level)
- Frontend: React + Vite single-page app.
- State model: Local React state with persistence hooks and Firestore synchronization.
- Auth: Firebase Authentication.
- Data store: Cloud Firestore.
- File storage: Firebase Storage.
- Email invite queue: Firestore `mail` collection (delivery depends on configured backend/extension).
- Security boundary: Firestore security rules enforce role-based read/write.

## Source of Truth Rules
- Firestore is the authoritative shared data source for collaboration.
- Local storage is a resilience/cache layer and should not be treated as canonical for team data.
- `firestore.rules` defines runtime authorization and must be deployed for behavior to take effect.
- This spec is the product-level source of truth; when code diverges, update either code or this document immediately.

## Constraints
- Multi-user correctness depends on correct Firestore rules deployment and membership documents.
- Viewer must remain strictly read-only in UI and write paths.
- Board editing must be blocked for users below contributor rank.
- Workspace naming consistency depends on synchronized board metadata (`workspaceName` field).
- Current app is JavaScript-heavy and centered in a large `App.jsx`, which increases change risk.
- Managed corporate environments may block npm/network tooling locally; cloud dev may be required.

## Open Questions
- Should "board" remain the primary user-facing term everywhere, or be renamed in selected UI areas?
- Should workspace-level memberships be introduced, or should membership stay board-scoped only?
- Should dashboard entities stay in scope for v1, or be deferred until core collaboration is fully stable?
- Do we enforce one default board per new workspace or allow empty workspace with guided setup?
- What is the minimum QA matrix before each release (roles x views x cross-account sync)?

## Working Agreement for New Threads
- Start each new thread by referencing this file.
- Confirm whether requested work changes product behavior, data model, or permissions.
- If behavior changes, update this spec in the same PR/commit as the code change.
