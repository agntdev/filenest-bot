# Digital File Library Bot — Bot specification

**Archetype:** content

**Voice:** professional and concise — write every user-facing message, button label, error, and empty state in this voice.

A Telegram bot that serves as a structured digital file library with nested menus, search, favorites, and analytics. Admin manages content via a mobile-friendly UI while users browse, stream/download files, and track usage statistics.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- single owner/admin
- general public file consumers

## Success criteria

- Admin can create nested menus and upload files
- Users can navigate menus and search files via inline buttons
- Analytics track file views/downloads and user activity

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Open main menu or 'Continue' from last opened location
- **Home** (button, actor: user, callback: menu:home) — Return to top-level menu structure
- **Search** (button, actor: user, callback: search:init) — Open search interface for files by title
- **Favorites** (button, actor: user, callback: favorites:list) — View and manage personal favorites list
- **/admin** (command, actor: admin, command: /admin) — Open admin control panel for menu/file management

## Flows

### Menu navigation
_Trigger:_ menu:open

1. Display menu items with inline buttons
2. Handle sub-menu navigation
3. Show file previews when selected

_Data touched:_ Menu, File

### File upload
_Trigger:_ /admin

1. Admin selects 'Upload Files'
2. Select target menu
3. Enter metadata
4. Confirm upload

_Data touched:_ File, Menu

### Search
_Trigger:_ search:init

1. Enter search term
2. Display paginated results
3. Select file to view

_Data touched:_ File

### Analytics
_Trigger:_ analytics:summary

1. Admin requests summary
2. Display top files/menus
3. Show recent activity trends

_Data touched:_ History/Analytics

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

- **User** _(retention: persistent)_ — Telegram user with browsing history and preferences
  - fields: id, favorites, last_opened_menu, activity_timestamps
- **Menu** _(retention: persistent)_ — Hierarchical content category with metadata
  - fields: id, parent_id, title, description, emoji, order
- **File** _(retention: persistent)_ — Telegram-stored media with metadata and analytics
  - fields: id, menu_id, telegram_file_id, title, description, file_type, size, duration, pinned, views, uploaded_at
- **History/Analytics** _(retention: persistent)_ — User interaction tracking for reporting
  - fields: user_id, file_id, action, timestamp

## Integrations

- **Telegram** (required) — Bot API messaging and file storage
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- Create/delete menus
- Upload/replace files
- Pin/unpin files
- Broadcast announcements
- View analytics dashboards

## Notifications

- Admin alerts for new uploads
- Analytics summaries on demand
- Broadcast announcements to all users

## Permissions & privacy

- Only admin can manage content
- User favorites stored with consent
- Analytics anonymous by default

## Edge cases

- Invalid menu selections
- File not found errors
- Concurrent menu edits
- Search term edge cases (empty/very long)

## Required tests

- End-to-end menu navigation flow
- File upload with metadata validation
- Search pagination handling
- Analytics tracking accuracy

## Assumptions

- Single admin model as specified
- Telegram file IDs used exclusively
- English UI by default
- Pagination handles large datasets
