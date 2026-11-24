# 🧾 TripExpenses

For a trip, a weekend, or anything you pay for along the way. Send each expense as what it was and the amount, and it is added up. Say `end trip` and you get the list and the total, and the next expense starts a new list. A simple expense tracker. Lives in its own WhatsApp group, "🧾 TripExpenses", and can also take a group you already have. Add your friends to the group and they can send expenses too.

Nothing is split and nobody owes anybody here: it is one sum, with what each person sent beside it.

## Commands

Send these in the TripExpenses group. Anyone in the group can.

| Message | What happens |
|---|---|
| `lunch 450` | Kept. 👍. What it was, then the amount. The very first time, one message explains the group; after that a 👍 is the whole answer. |
| `cab rs 300`, `cab ₹300`, `dinner 20 usd`, `dinner $20` | Kept in that currency, whatever the trip is counted in. |
| `flights 12k`, `villa 1.5 lakh`, `hotel 4,500.50` | Amounts the way people write them. |
| `450 lunch`, `450: lunch`, `450 for lunch`, `rs 450 lunch` | The amount first works too, with or without a mark or "for" after it. The welcome, the help and the note about the format all say so. |
| several lines in one message | Each line is an expense. Lines with no amount are left out, and named back. |
| a message with no amount | Not kept. One message says how to send an expense. |
| `total` (also `sum`, `list`, `summary`, `how much`, `so far`) | The list and the sum so far. |
| `end trip` (also `end it`, `end`, `close trip`, `trip over`) | The list and the total, and the trip is closed. The next expense starts a new one. |
| a new description for the group | A new trip starts, called what you wrote (its first line). The trip that was open is closed and shown first. A new group name does the same, but people are only told about the description. |
| `trips` (also `history`) | Your last 10 trips with their totals. |
| `name goa` | Names this trip. Until then it is "Trip 1", "Trip 2". |
| `currency usd` | Changes what plain amounts are counted in for this trip. `currency` alone says what it is now. |
| `undo` (also `delete last`) | Removes the last expense you sent in this trip. |
| `help` | The command list. |

On an expense you sent:

| You | What happens |
|---|---|
| reply with an amount, like `540` | The amount is corrected. 👍 |
| reply with a whole line, like `brunch 540` | The expense is replaced. 👍 |
| reply `delete` (also `remove`) | Removed. 👍 |

### Currency

- An amount with a currency is kept in that currency. A plain amount is in the trip's currency.
- A trip's currency comes from its first expense when that names one (`lunch rs 450`). Nothing is asked then.
- Otherwise the trip asks once, right after its first expense: "Which currency do I count in?" It is a poll (`kit.ask`) with the person's own currency first, then rupees, US dollars, euros, pounds and dirhams. A typed currency (`sgd`) counts as the answer.
- The question is asked on every new trip (the owner's choice, 2026-11-23), since the next trip may be somewhere else.
- The answer is recorded on the trip and the poll is taken away. Zelfred's own confirm line is off; the plugin posts "Counting in ₹." itself, so it reads the same with one person or several.
- With several people in the group the first answer settles it for everyone, and the plugin closes the question.
- No answer: the first choice stands, and `currency usd` changes it later. Ending the trip fixes it.
- The person's own currency is Zelfred's to keep (`kit.person.currency`). The plugin hands it over with `kit.learn` the first time the person who added the app names a currency or answers the question. Zelfred keeps the first one it is told. A friend's answer sets the trip only.
- A total with more than one currency keeps them apart: `₹750 + $20`. Nothing is converted.

### Groups you already have

It can be chosen for a WhatsApp group the person already had (`onGroup`, the `groups` permission). It says once how it works there. Each group has its own trips, its own "Trip 1, Trip 2" and its own first-time note; nothing sent in one group shows in another. When the group is taken back, its open trip is closed and nothing is said.

### A new trip from the description

Zelfred tells the plugin when someone gave a group a new description or name (`onGroupInfo`). It finds out when the next message arrives there, so the new trip starts just before that message is read. The trip takes the first line as its name, up to 40 characters; an emptied description starts an unnamed trip. Two changes in a row, or a change before any expense, name the same trip and do not start a second one. The description Zelfred itself writes when it makes the group does not count.

### A message with no amount

Alone in the group, the person is told the format every time. Once a friend has written in the group, people also just talk there, so the format is said once and then not again until an expense is kept or something is asked for. In a group the person already had, the note on joining counts as that one time.

Limits: 500 expenses a trip, 20 lines a message, 80 characters for what it was, 40 for a trip's name. A list shows the newest 40.

These choices are the plugin author's and were not confirmed by the owner: no splitting, anyone in the group may end a trip or correct any expense, `undo` removes only your own last one, the quiet rule for chatter above, an amount at the start of a line counting, a closed trip never changing, trips kept apart per group, a changed description closing the open trip and not only renaming it, and the limits.

## Web page

`web.load` gives every group the app runs in (its own first), each with its open trip and that trip's expenses, and the trips that ended (the newest 50) with their totals. `args.trip` adds one trip in full. A trip that was only named and has no expense yet is not shown. One action, `remove`, takes an expense out of the open trip; the page asks first, and a closed trip is refused. Everything else is done in WhatsApp. `lockable`: the page can sit behind the PIN. There is no `loadFor`: a friend in the group sees nothing of it on their own page.

## Data

| Collection | Key | Data | Sort |
|---|---|---|---|
| `trips` | trip id | `{ n, home?, name, currency, asked?, startedAt, endedAt, seq?, count?, sums? }` | started (ms) |
| `expenses` | `<trip id>:<id>` | `{ what, amount, currency, by, name, at }` | its place in the trip |
| `homes` | group key | `{ name }`: a group the person handed over | when (ms) |
| `state` | `open` | `{ trip }`: the trip expenses go to now | none |
| `state` | `n` | how many trips were started | none |
| `state` | `taught` | `1` once the first-expense note was sent | none |
| `state` | `shared` | `1` once someone other than the owner wrote in the group | none |
| `state` | `prompted` | `1` after the format was said, until something is kept | none |

The `state` keys above are the app's own group's. A handed-over group has the same set as `<key>@<group key>`, and its trips carry `home: <group key>`.

An expense's `currency` is null when it was a plain amount: it is in the trip's currency. `by` is the sender's id (not a phone number) and `name` their WhatsApp name when it was sent. A trip's `asked` holds the currencies offered while its question is open. `count` and `sums` (`{ INR: 750 }`) are written when it ends, with its `currency` fixed.

Refs: `{ kind: "expense", trip, ids }` on the person's own expense message (through `kit.mark`), and `{ kind: "currency", trip, codes }` on the currency question.

## Privacy

Permissions: `members`, so friends added to the group can send expenses, and `groups`, so it can be given a group the person already had.

Reads only the messages in its own groups, a new name or description of those groups, its own stored data, the time zone of the person who added it, and the currency Zelfred knows they count in. Stores what each expense was, the amount, and the name of who sent it. Everyone in the group sees everything it posts there, as with any WhatsApp group.

It tells Zelfred one thing about the person who added it: the currency they count in, the first time they say it. Other apps can read that so they don't ask again.

Nothing is sent to a model. Its page shows the person who added the app what is kept, and can sit behind their PIN.
