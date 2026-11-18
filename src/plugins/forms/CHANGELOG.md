# Changelog: Forms

All notable changes to this plugin. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/).

## [1.2.2] - 2026-11-19

### Changed
- Nothing you see has changed. Every message this app sends now lives in one file (`copy.ts`), so wording can be changed without touching how the app works.

## [1.2.1] - 2026-11-17

### Changed
- The product is now called telcurio. This plugin's page title, description and wording use the new name. The page title is a word shorter to fit ("Form Backend on WhatsApp: Submissions as Chats"). Nothing changes in how it works, and addresses like app.whatodo.today stay as they are.

## [1.2.0] - 2026-11-17

### Added
- Replace a form's address when the old one got out and is being misused: `new address contact` in WhatsApp (just `new address` in the form's own group), or "Change address" on the page. The old address stops working at once. Everything the form received stays where it is.

### Data
- No change in shape: the form's `url` is rewritten. New web action `newAddress { key }`.

## [1.1.1] - 2026-11-17

### Fixed
- Marking a submission done from WhatsApp now works with any tick (✅ ✔️ ☑️ ✓) and with 👍 in any skin tone, 👌 or 🆗. Some of these were missed because phones send them with or without an invisible style mark.

### Changed
- When you tick a submission, Forms ticks the message too (✅), so you can see it was marked done. Taking your reaction off removes it and marks the submission not done.

## [1.1.0] - 2026-11-17

### Added
- A form can have its own WhatsApp group. `new form contact in its own group` makes the form and a group named after it; `group contact` gives one to a form you already have. On the page, tick "Give it its own WhatsApp group" when adding a form, or use "Give it its own group" on an existing one.
- A form with its own group is announced there, not in the main Forms group. Until the group exists, its submissions still arrive in the main group.
- In a form's own group, `last`, `address` and `close` are about that form without naming it.
- New permission: `groups` (make extra WhatsApp groups).

### Data
- `forms` rows gain `ownGroup` (true when the form has its own group; the group's key is the form's key). Rows without it behave as before.
- New web action `giveGroup { key }`; `createForm` takes `ownGroup`.

## [1.0.2] - 2026-11-17

### Changed
- Declares the `hooks` permission (receive requests from outside), which SDK 1.6.0 now asks every plugin with a hook to list. Nothing changes in what it does.

## [1.0.1] - 2026-11-17

### Fixed
- Fields are shown in the order your form sent them, in the message and on the page. They were coming out alphabetically.

### Data
- `submissions` rows gain `order` (the field names in the order sent). Rows from 1.0.0 have none and fall back to the stored order.

## [1.0.0] - 2026-11-17

### Added
- First release, unlisted: only people telcurio allows can add it. Lives in its own WhatsApp group ("📬 Forms").
- `new form <name>` makes a form and gives its address. Post a normal HTML form, JSON or a form with files to it.
- Every submission arrives as a message with its fields and file names. ✅ on the message marks it dealt with.
- `forms`, `address <form>`, `last [form]`, `close <form>`.
- A daily number of messages per form (`dailyMessages`, 30): after that it says so once and stays quiet until the next day. Everything is still kept.
- Web page (behind your PIN if you set one): forms and their addresses, every submission with its fields and files, mark done, delete a submission, close or delete a form.

### Data
- `forms`: key form key, `{ name, url, createdDay, created, closed?, count }`, sort created (ms).
- `submissions`: key id, `{ form, at, fields, files, origin, done? }`, sort received (ms).
- `days`: key `<form>:<day>`, number of messages sent that day, sort day.
- Ref on each submission message: `{ kind: "submission", id }`.
- Files are held by telcurio; `submissions.files` keeps `{ id, field, name, type, size }` for each.
