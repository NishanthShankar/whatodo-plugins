# 📦 ShipmentTracker

Send a FedEx or UPS tracking link or number, and the parcel is watched: the carrier is asked every hour, and a message comes only when the status changes. Send `updates` to hear where everything is now. Lives in its own WhatsApp group, "📦 Shipments".

The app never reaches a carrier itself. It hands what the person sent to Zelfred (the `"parcels"` permission), which works out the carrier, asks it, and answers in `onParcel`. Which carriers can be tracked is Zelfred's to change; today they are FedEx and UPS. Unlisted until the owner has tried it with real parcels.

## Commands

| Message | What happens |
|---|---|
| a tracking link, or a tracking number (`880154928525`, `1Z999AA10123456784`, also written in groups) | 🕐 on the message while the carrier is asked. Then the first status in words, and the 🕐 comes off. The first time in a group, two more lines say how the app works. |
| the same with words around it (`880154928525 new shoes`) | The words are the parcel's name. A leading `track`, `watch`, `follow` or `add` is dropped. |
| two links or numbers in one message | The first is taken. "One at a time. I took the first one." |
| something already watched | "I'm already watching ..." with its status. Also when the same parcel arrives once as a link and once as a number. |
| `updates` (`update`, `status`, `list`, `packages`, `parcels`, `any updates`, `where is it`) | Everything watched, numbered, with its status, place and expected day, and how long ago the carrier was asked. What was delivered stays in the list for 3 days. The carrier is asked again when the last answer is older than 10 minutes; a change found that way is said as a change. |
| `remove 2`, `remove shoes`, `stop watching shoes` (`stop`, `delete`, `drop`, `forget`) | Stops watching it. 👍 |
| `remove` as a reply to a message about one parcel | The same. 👍 |
| `name 2 new shoes` (`rename`, `call`) | Names it. 👍 |
| any other words as a reply to a message about one parcel | The words become its name. 👍 |
| `help` | What the app can do. |
| anything else | Handed to Zelfred's intent model (`updates`, `remove`, `rename`); when that is not sure, "I didn't get that. Send me a tracking link or number, or updates. help has the rest." |

What the first answer can be:

| The answer | What is said | Kept |
|---|---|---|
| a status | "Watching *FedEx 880154928525*." with the status, place and expected day | yes |
| already delivered | "... is already delivered." with the status | no |
| Zelfred can't track it (`unsupported`) | "I can't track USPS parcels. FedEx and UPS are the ones I can." or, with no carrier, "I can't track that. ..." | no |
| the carrier doesn't know the number (`unknown`) | "... the carrier doesn't know that number. Check it and send it again." | no |
| the carrier couldn't be asked (`unavailable`) | "I couldn't reach FedEx just now. I've kept it and will look again within the hour." Said once. After 24 tries with no answer: "I can't track ... I tried for a day and never got an answer, so I've stopped." | yes, for a day |

## Schedules

| Id | When | What it does |
|---|---|---|
| `look` | every hour | Asks Zelfred about every watched parcel. Says nothing itself, except: a parcel with nothing new for 30 days is said to be dropped, and stops being watched. Forgets what ended more than 30 days ago. |

What an hourly answer does:

- The same status, place and expected day as last time: nothing is said.
- Anything different: one message with the new status.
- Delivered: said, and the parcel is no longer asked about.
- No status (any reason) for a watched parcel: nothing is said. After 24 in a row, once: "I haven't been able to reach FedEx about ... for a day. I'm still trying."

At most 20 parcels are watched at once.

## Data

| Collection | Key | Data | Sort |
|---|---|---|---|
| `parcels` | id | `Pack`: `what` (the link or number as sent), `carrier`, `carrierName`, `number`, `name`, the last known `stage`, `status`, `place`, `at`, `due`, `added`, `checked`, `changed`, `fails`, `told`, and `silent`, `over`, `overAt` when set | when it was added (ms) |
| `state` | `taught` | `1` once the first status in this group was said | none |

Refs: every message about one parcel, and the person's message that added it, carry `{ p: id }`.

## Privacy

It reads only the messages in its own group. It keeps the tracking link or number that was sent, the name the person gave it, and the carrier's latest status, place and dates. A tracking link can carry more than the number (FedEx links carry a second code); the whole link is kept, up to 500 characters, because that is what Zelfred is asked about. The link or number is sent to the carrier it belongs to, by Zelfred, to ask for the status. Nothing else leaves. Removing a parcel deletes its record at once; one that was delivered or dropped is deleted 30 days later.

## Not built

- No page on the web. The chat shows everything there is.
- No quiet hours: a change found at 3am is said at 3am.
- Carriers other than FedEx and UPS.
- A carrier's whole scan history. Only the latest status is kept.
