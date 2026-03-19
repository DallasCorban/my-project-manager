# Flow — Product Spec

> Living document. Describes how every feature is meant to behave.
> If you have this document and no code, you should be able to infer how everything works and plan implementation for any new feature.

**Last updated:** 2026-03-19

---

## App Overview

Flow is a multi-user project management app (think Monday.com) with a Main Table view, Gantt view, real-time sync, and team collaboration. The UI is dark-mode-first, clean, and minimal.

**Stack:** React + Vite SPA, Firebase Auth, Cloud Firestore, Firebase Storage.

---

## Core Concepts

| Concept | Description |
|---------|-------------|
| **Context** | Top-level scope — either "Personal" (user's own boards) or a **Team** (shared org) |
| **Team (Org)** | A shared organization. Has members, workspaces, and boards visible to all members |
| **Workspace** | A folder that groups boards. Every context has one or more workspaces |
| **Board** | The main working unit. Contains groups, items (tasks), and subitems |
| **Group** | A section/lane within a board (e.g. "To Do", "In Progress") |
| **Item** | A task row on a board. Has name, dates, status, assignee, job type |
| **Subitem** | A child row under an item. Same fields as an item |
| **Member** | A user attached to a board or org with a specific role |

---

## Layout

The app has three main areas:

1. **Sidebar** (left) — Navigation: context switcher, workspace selector, board list, settings
2. **Header** (top) — Board name, view tabs (Main Table / Gantt), board-level actions
3. **Content** (center) — The active board view

The sidebar can be **collapsed** to a narrow icon strip (48px) by clicking the chevron in the header. In collapsed mode, boards show as initial-letter circles and are still clickable. Chevron-right expands it back.

The sidebar is hidden on screens smaller than `md` breakpoint.

---

## Sidebar Features

### Context Switcher

**Location:** Top of sidebar.

**What the user sees:**
- A button showing "My Boards" (personal, emerald icon) or the team name (blue icon with first letter)
- Chevron rotates when dropdown is open

**Behavior:**
- Click to toggle the dropdown
- Dropdown lists "My Boards" at the top, then all teams the user belongs to, then a "Create Team" option at the bottom
- Selecting a context switches the entire sidebar — workspaces, boards, and all content update to reflect that context
- Active context is highlighted (emerald for personal, blue for team)
- Archived teams are filtered out of the list

### Team Three-Dot Menu (in Context Dropdown)

**Location:** Each team row in the context dropdown. Appears on hover.

**Options:**
- **Rename** — Inline text input replaces the team name. Text is pre-selected. Enter or blur to save, Escape to cancel. Empty names are discarded. Updates the org name in Firestore and regenerates the slug.
- **Archive** — Soft-deletes the team (sets `archivedAt` timestamp). Team disappears from dropdown. If the archived team was the active context, switches to Personal.

**Menu positioning:** Uses `position: fixed` anchored to the button's bounding rect so it escapes all overflow containers.

---

### Workspace Selector

**Location:** Below the context switcher.

**What the user sees:**
- Active workspace name with a chevron
- Click to open dropdown showing all workspaces in the current context

**Personal context:** Each workspace row has a three-dot menu on hover.
**Org context:** Each workspace row has a three-dot menu on hover (same behavior).

**Workspace Three-Dot Menu Options:**
- **Rename** — Inline text input, same pattern as team rename (Enter/blur to save, Escape to cancel, empty discarded)
- **Archive** — Only visible if there are 2+ workspaces. Archives the workspace and all its boards. Sidebar switches to the first remaining workspace. If the active board was in the archived workspace, it's deselected.

**"New Workspace" option** at the bottom of the dropdown creates a new workspace in the current context.

---

### Board List

**Location:** Main body of the sidebar, below workspace selector.

**What the user sees:**
- Section header "BOARDS"
- Each board row: grid icon, board name, three-dot menu (on hover)
- Active board highlighted in blue
- "New Board" button at bottom (if user has permission)
- Empty state message if no boards

**Clicking a board** selects it and loads it in the content area.

**Board Three-Dot Menu Options:**
- **Rename** — Inline text input, same interaction pattern as all other renames
- **Archive** — Archives the board. If it was the active board, it's deselected. Board moves to the Archive view in Settings.

**"New Board" button:**
- Creates a new board in the current workspace
- Board is automatically selected and becomes active
- Default name is "New Board"
- In org context: board gets `ownerType: 'org'` metadata and is registered in org workspace board refs

**Menu positioning:** Same fixed-position pattern as team menus — escapes overflow containers.

---

### Settings (Gear Icon)

**Location:** Sidebar footer, next to theme toggle.

**Behavior:**
- Click gear icon to enter Settings view (replaces sidebar content)
- Back arrow at top returns to normal navigation
- Currently one option: **Archive**
- Archive shows a badge with total count of archived items

### Archive View

**Accessed from:** Settings > Archive

**Three sections:**

**0. Archived Teams** (only visible in Personal context)
- Only shown to users with `owner` or `admin` role in the archived team
- Each row: team icon, team name (clickable for preview), Restore button, Delete button
- **Restore:** Unarchives the team. It reappears in the context dropdown for ALL members.
- **Delete:** Confirmation prompt, then permanently deletes the team.
- Clicking the team name opens a **read-only preview** (see Archive Preview below)

**1. Archived Workspaces**
- Each row: chevron toggle, workspace name (clickable for preview), Restore button (green), Delete button (red)
- Expand chevron to see the boards that were archived with that workspace
- **Restore:** Unarchives the workspace AND all its boards. They reappear in normal navigation.
- **Delete:** Confirmation prompt, then permanently deletes workspace + all its boards from Firestore.
- Clicking the workspace name opens a **read-only preview** of its boards

**2. Individually Archived Boards**
- Boards archived on their own (their workspace is still active)
- Each row: grid icon, board name (clickable for preview), Restore button, Delete button
- **Restore:** Board reappears in its workspace's board list
- **Delete:** Confirmation prompt, then permanently deletes the board.
- Clicking the board name opens a **read-only preview** of the board

### Archive Preview (Read-Only Mode)

**Triggered by:** Clicking any archived item name in the archive view.

**Behavior:**
- Content area shows an **amber banner** at the top: "Viewing archived content (read-only)" with an "Exit preview" button
- All editing is disabled: no inline editing, no drag-and-drop, no "Add Group" button, no status changes
- Navigation works normally — you can view data but not modify it

**Drill-down for teams:**
1. Click archived team → content area shows the team's workspaces as a list
2. Click a workspace → shows boards within that workspace
3. Click a board → renders the full board in read-only mode (Main Table or Gantt, respecting active tab)
4. Back button at each level returns to the previous level

**Drill-down for workspaces:**
1. Click archived workspace → shows its boards as a list
2. Click a board → renders the board read-only

**Direct board preview:**
- Click an archived board → renders the board immediately in read-only mode

**Exit:** Click "Exit preview" in the amber banner or navigate away. Returns to normal view.

**Empty state:** "No archived items" if nothing is archived.

---

### Theme Toggle

**Location:** Sidebar footer (and in collapsed sidebar view).

**Behavior:**
- Moon icon = currently in dark mode (click to switch to light)
- Sun icon = currently in light mode (click to switch to dark)
- Persists across sessions
- Default for new users: dark mode

**Color scheme:**
- Dark: navy/deep blue backgrounds (#111322, #1c213e), light gray text
- Light: light blue-gray backgrounds (#f7f7f9, #eceff8), dark text
- Accent: blue highlights for active elements in both modes

---

### Sidebar Collapse

- Chevron-left in the header collapses to icon-only mode (48px wide)
- Collapsed view shows: expand button, board initial circles (clickable), theme toggle
- Active board circle is highlighted blue
- Chevron-right expands back to full width

---

## Board Header

**Location:** Top of the content area.

**What the user sees:**
- Board name (editable — click to rename inline)
- View tabs: Main Table | Gantt
- Board-level action buttons

**Board rename:** Same inline input pattern. Click the name, it becomes an input, Enter/blur to save.

---

## Main Table View

The primary board view. A spreadsheet-like table grouped by sections.

### Groups

- Each group has a colored header bar with the group name
- Groups can be collapsed/expanded
- Group name is editable inline
- Groups can be reordered (drag)
- New group can be added

### Items (Task Rows)

Each row displays columns:
- **Checkbox** (selection)
- **Item name** (editable inline)
- **Assignee**
- **Status** (dropdown with color-coded labels)
- **Job Type** (dropdown with color-coded labels)
- **Start Date** (date picker)
- **Duration** (editable, affects end date)
- **End Date** (calculated from start + duration)

**Subitems:** Expand an item to see its subitems. Each subitem has the same column structure. Subitems can be added, edited, and deleted.

**Selection:** Checkbox selects items. Multi-select shows a selection tray at the bottom with bulk actions.

### Updates Panel

- Click an item to open the Updates panel (right side drawer)
- Shows threaded conversation: notes, checklists, replies
- File attachments per update
- Real-time sync across users

---

## Gantt View

Timeline visualization of all items and subitems.

**Behavior:**
- Each item is a horizontal bar positioned by start date and duration
- Subitems shown as bars within/below their parent item
- Drag bar edges to resize (changes duration/dates)
- Drag bar body to move (changes start date)
- Changes sync bidirectionally with Main Table view
- Timeline header shows date scale with zoom levels

**Stackable subitems:** When an item is expanded, subitems get their own rows. When collapsed, subitem bars stack within the parent row with slight vertical offsets so all bars remain visible.

---

## Team / Org System

### Creating a Team

- "Create Team" at the bottom of the context dropdown
- Opens a modal prompting for team name
- Creates the org in Firestore with the user as owner
- Auto-creates a "General" workspace
- Team appears in context dropdown immediately

### Org Members

- "Manage Members" button appears at sidebar bottom when in org context
- Opens modal to view/manage team members
- Roles: owner, admin, member, guest

### Org Workspaces

- Workspaces within an org are shared across all org members
- Boards in org workspaces are visible to all members (subject to role permissions)

---

## Authentication

- Firebase Auth with email/password
- Guest mode available (limited functionality)
- Onboarding modal for new users (name, preferences)

---

## Roles & Permissions

| Role | Capabilities |
|------|-------------|
| **Owner** | Full control including membership and board admin |
| **Admin** | Membership management + board editing |
| **Editor** | Edit board content, cannot manage members |
| **Contributor** | Edit content and dates |
| **Viewer** | Read-only |
| **Guest** | Limited access (org-level) |

---

## Real-Time Sync

- All board data syncs via Firestore listeners
- Changes by any user appear immediately for all connected users
- Offline edits persist in local state and sync when reconnected

---

## Inline Editing Pattern (Global)

All rename/edit interactions across the app follow the same pattern:
1. Click triggers edit mode — text input replaces the display text
2. Current value is pre-populated and auto-selected
3. **Enter** or **blur** commits the change
4. **Escape** cancels without saving
5. Empty values are discarded (reverts to previous name)
6. Input has a blue bottom border to indicate edit mode

---

## Three-Dot Menu Pattern (Global)

All three-dot menus follow the same pattern:
1. Menu icon appears on row hover (opacity transition)
2. Click toggles the menu open/closed
3. Menu uses `position: fixed` with coordinates from `getBoundingClientRect()` so it never gets clipped by overflow containers
4. Menu aligns right-edge to the button, appears below it
5. Clicking outside the menu closes it
6. Selecting an option closes the menu and performs the action

---

## Data Model (Firestore)

```
/orgs/{orgId}                          — Organization doc (name, slug, plan, createdBy, archivedAt)
/orgs/{orgId}/members/{uid}            — Org membership (email, orgRole, joinedAt)
/orgs/{orgId}/workspaces/{wsId}        — Org workspace (name)
/orgs/{orgId}/workspaces/{wsId}/boardRefs/{boardId} — Pointer to a board

/projects/{projectId}                  — Board doc (name, workspaceId, groups[], tasks[], etc.)
/projects/{projectId}/members/{uid}    — Board membership (role, status)
/projects/{projectId}/invites/{id}     — Email invite (email, token, role, status)
/projects/{projectId}/accessRequests/{uid}
/projects/{projectId}/files/{fileId}   — File metadata with access.minRole
/projects/{projectId}/state/{stateId}  — Board state snapshots
```

---

## Deployment

- Hosted via existing hosting setup (auto-deploys from `main` branch)
- Firestore rules deployed separately
- Firebase project: `project-managment-app-53a4a`
