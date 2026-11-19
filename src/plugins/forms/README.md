# 📬 Forms

A backend for the forms on your own websites. Make a form, paste its address into your site, and every submission arrives as a WhatsApp message in the "📬 Forms" group, with its fields and files kept on app.whatodo.today. No server of your own, no email.

Unlisted for now: it isn't in the store or on the public site, and only people Zelfred allows can add it.

## Using a form on your site

Send `new form contact` in the Forms group. You get an address like `https://.../hook/abc123`. Use it in any of these ways:

```html
<!-- A plain form. Add enctype for files. -->
<form action="THE_ADDRESS" method="POST" enctype="multipart/form-data">
  <input name="name" />
  <input name="email" type="email" />
  <input name="id_proof" type="file" />
  <input name="_gotcha" style="display:none" tabindex="-1" autocomplete="off" />
  <input name="_next" type="hidden" value="https://example.com/thanks" />
  <button>Send</button>
</form>
```

```js
// From a script: JSON, or FormData when there are files.
await fetch("THE_ADDRESS", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, email }) });
await fetch("THE_ADDRESS", { method: "POST", body: new FormData(formElement) });
```

- The answer is `{ "ok": true }`. A plain form with a `_next` field is sent on to that page.
- `_gotcha` is a trap for bots: leave it empty and hidden. A request that fills it is dropped.
- Up to 5 files per submission, 10 MB each. Fields whose names start with `_` are not kept.
- Zelfred caps how many requests a form takes per minute and per day.

## Commands

Send these in the Forms group.

| Message | What happens |
|---|---|
| `new form contact` | Makes a form and replies with its address. Names become keys: "Partner applications" is `partner-applications`. Up to 50 forms. |
| `new form contact in its own group` | Makes the form and a WhatsApp group just for it, named after the form. Its submissions arrive there (in the main group until the new one is ready). |
| `group contact` | Gives a form you already have its own group. |
| `forms` | Your forms, how many submissions each has had, and their addresses. |
| `address contact` | One form's address again. In a form's own group, `address` is enough. |
| `new address contact` | Replaces the form's address, for when the old one got out and is being misused. The old address stops working at once; update your website with the new one. Everything the form received stays. In a form's own group, `new address` is enough. |
| `last` / `last contact` | The latest submission, of any form or of one. In a form's own group, `last` means that form. |
| `close contact` | In a form's own group, `close` is enough. The form stops taking submissions; its address no longer works. What it received stays. `new form contact` opens it again with a new address. 👍 |
| `help` | This list. |

Each submission arrives as one message: the form's name, its fields (the first 12, long values cut short) and the names and sizes of its files. React with a tick (✅ ✔️ ☑️) or 👍 to mark it done. Forms ticks the message back so you can see it registered. Take your reaction off to undo.

## Settings

| Key | Default | Meaning |
|---|---|---|
| `dailyMessages` | `30` | Messages per form per day. After that it says once that it's stopping for the day. Submissions are still kept. |

## Web page

On app.whatodo.today, behind your PIN if you've set one:

- Your forms, their addresses and counts. Make a form (with its own WhatsApp group if you tick the box), give an existing form its own group, close one, or delete one with everything it received.
- Every submission, newest first: when, from which site, its fields, and its files to open or download.
- Mark a submission done, or delete it (its files go with it).

Actions: `createForm { name, ownGroup? }`, `giveGroup { key }`, `newAddress { key }`, `closeForm { key }`, `deleteForm { key }`, `deleteSubmission { id }`, `setDone { id, done }`.

## Data

| Collection | Key | Data | Sort |
|---|---|---|---|
| `forms` | form key | `{ name, url, createdDay, created, closed?, count, ownGroup? }` | created (ms) |
| `submissions` | id | `{ form, at, fields, order, files: [{ id, field, name, type, size }], origin, done? }` (`order`: field names as sent) | received (ms) |
| `days` | `<form>:<day>` | messages sent that day | day |

Files themselves are held by Zelfred, not in these rows.

## Permissions

| Permission | Why |
|---|---|
| `hooks` | To receive what your website's forms post to their addresses, files included. |
| `groups` | To make a WhatsApp group for a form when you ask for one. |

## Privacy

This plugin receives what other people send through your forms: their names, contact details, messages and files. It keeps them only for you, shows them only to you (in your Forms group and on your page), and deletes them when you delete the submission or the form. It reads only the messages you send in its own group and the requests sent to your forms' addresses. Nothing is passed to anyone else. You are responsible for telling the people who fill in your forms what you collect and why. Keep your Zelfred account behind your PIN: these can be sensitive documents.
