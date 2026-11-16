# Changelog: Forms

All notable changes to this plugin. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/).

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
- First release, unlisted: only people whatodo allows can add it. Lives in its own WhatsApp group ("📬 Forms").
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
- Files are held by whatodo; `submissions.files` keeps `{ id, field, name, type, size }` for each.
