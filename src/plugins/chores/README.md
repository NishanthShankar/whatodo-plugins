# 🧹 Chores

A shared home's jobs, taken in turns. Each job has a rhythm and a rota. Every morning the day's jobs arrive as one list to tick. Whoever ticks a job did it, and the turn moves on to the next person. Lives in its own WhatsApp group, "🧹 Chores", where the person adds the people they live with, and can also take the group the home already has. Nobody else in the home installs anything.

What sets it apart from a repeating todo: the next person in the rota gets the job, whoever does it gets the credit, someone away is skipped, and what was done by whom is kept and shown when asked.

The design is `docs/chores-brief.md` in the `whatodo` repo.

## First five minutes

Written to `docs/plugin-onboarding.md` in the `whatodo` repo. The lines are the author's and wait for the owner's pick. A home learns the app by doing one thing at a time; nothing is listed up front.

| Field | For Chores |
|---|---|
| The promise | "Your home's jobs, taken in turns." |
| The aside | "I remember whose turn it is, so nobody has to." |
| The first thing to send | `bins every day, Ravi Asha Kiran` |
| The first time line | When the first tick lands: "*Bins*: done by Ravi. Next time it is Asha's. That is all there is to it. Each morning at 8am I send the day's jobs here as one list. Whoever ticks a job did it, and the turn moves on. From now on I answer a tick with ✅ and say nothing more." |
| The moment it clicks | Minutes in: the first job is due today, and a 👍 on Zelfred's answer ticks it. Then the first morning list, at 8am the next day. |
| The setup steps | None beyond adding the app. |
| What to learn | Which name in the first rota is the person who sent it. Taken from their WhatsApp name; asked once as a poll only when the name doesn't say. |

What a new home meets, in order. Each is said once per home and never again.

1. **The welcome** asks for nothing and names one thing to send.
2. **The first job** is answered with what was understood and, in the same message, the one thing to do next: "It is due today. React 👍 to this message once it's done." That message is the day's list, so the morning list doesn't also go out that day. A first job that falls on a later day is told its first day and hour; one with no fixed day is told how to say it is needed.
3. **Who are you**, only when it can't be told: "Which of these is you?" with the rota's names and "None of them". Only the person asked can answer, a typed `I'm Nish` counts, and step 2's "try it now" waits for the answer. No answer: nothing breaks, the morning list still comes.
4. **The first tick**, by a reaction or by words, is answered with the first time line. In the app's own group, when names in the rotas have not been seen there, one more paragraph says to add them: "They install nothing."
5. **The usual jobs**, offered once as a tick list ("Which other jobs does your home have?") right after the first tick (or with the first job, when that isn't due today), leaving out what the home already has. Silence adds nothing.
6. **The first morning list** opens with one line on how it works, unless step 4 already said it.
7. **The first time someone does another person's job:** one line on who got the credit and where the turn went, with the message that changes the rule.

8. **The page**, mentioned once, with the first list after the home's first real day: "There is a page for this home too, with the week ahead and who did what", and its address.

**Starting on the page instead.** A home with no jobs opens on a three step setup (who takes turns, which jobs, when the list goes out; `web.actions.setup`). The first name given is the person themselves, so "which of these is you" is never asked. One message in the group then says what was set up, and today's list follows at once when something is due. The usual jobs are not offered again.

**The welcome card.** Zelfred sends the welcome as the caption of a picture card (drawn in the `whatodo` repo, `scripts/onboarding-cards.mjs`): the promise as its headline, the aside under it, and the first thing to send. The caption works alone when the picture can't go.

Later firsts explain themselves in the message they need anyway: the first missed job ("Not ticked yesterday"), the first away (the day back).

Owed, because a plugin can't do them yet (`docs/plugin-onboarding.md`): a link that signs the person in to the page (the address is sent plain), and counting each step with `track`. Today the steps show only as the usual app events.

## Commands

Send these in the home's group. Anyone in the group can, except where it says otherwise.

| Message | What happens |
|---|---|
| `bins every day, Ravi Asha Kiran` | The job is kept, and one line says what was understood: "*Bins*, every day. Ravi, Asha and Kiran take turns, Ravi first." The first job in a home starts the first five minutes above. |
| `bins every day @Ravi @Asha` | People tagged with an @ are the rota, in place of typed names, and are known in the group from then on. `bins rota @Ravi @Asha` works the same. |
| `bathroom every Sunday, take turns` | The rota is everyone known in the home so far. With fewer than two known, the job is kept for anyone and the line asks who takes turns. |
| `dishes every mon, wed and fri`, `plants on weekdays`, `mopping weekly`, `sweeping every 3 days`, `sheets every other week` | Other rhythms. A list of weekdays needs "every", so "see you on Sunday" is not a job. |
| `society bill monthly on the 5th`, `rent on the 1st of every month` | Monthly. A date the month doesn't have falls on its last day. |
| `gas when needed` | A job with no fixed day. No name after the rhythm means anyone can do it. |
| a job line whose name is a job already kept | That job gets the new rhythm (and the new rota when one is given). No second job. |
| `bins rota Ravi Asha` | A new rota. The turn starts with the first name. |
| `rename bins to trash`, `remove bins` | 👍 |
| `jobs` (also `chores`, `rota`) | Every job with its rhythm, whose turn is next and the rota. |
| `today` | What is due today and whose turn, and what was ticked already. |
| `whose turn is bins`, `bins?` | Whose turn, and when it is next due. |
| `bins done` (also `did the bins`, `gas booked`, `help paid`) | Ticks the job for the sender. ✅. The first tick in a home is answered in words, once. A job that isn't on today's list is said to be so, with its next day. |
| `bins not done` (also `undo bins`) | Takes your own tick back. 👍 |
| `gas needed` (also `gas finished`, `book the gas`) | A job with no fixed day joins the list, and one line says whose turn it is. |
| `who did what` (also `count`, `who did what last month`) | How many jobs each person ticked this month, or last. |
| `Ravi away till the 12th`, `I'm away for 3 days`, `Asha away until friday`, `Kiran away` | Skipped in every rota until that day, or until `Kiran back`. One line says the day back. |
| `Ravi back`, `I'm back` | 👍 |
| `swap bins with Asha` | Your next turn at bins and hers change places, once. `swap bins Ravi with Asha` does it for two others. |
| `I'm Ravi` | Says which name in the rotas the sender is, when their WhatsApp name didn't match. What they ticked before moves over. 👍 |
| `remove Asha` | Takes a person out of the home and every rota. What they did stays counted. 👍 |
| `ideas` | A tick list of jobs to pick from (below). |
| `help` | The command list. |

For the person who added the app only. Anyone else is told who can change it.

| Message | What happens |
|---|---|
| `list at 7am` | The hour the day's list goes out. 8am for a new home. |
| `turns stay`, `turns move on` | The rule for when someone else does your job (below). The change is said in the group. `turns` alone says the rule now, to anyone. |
| `weekly count on`, `weekly count off` | Send the count for the week before every Monday. Off for a new home. |
| `Mia is a child`, `Mia is not a child` | Nothing is counted for a child (below). 👍 |

### The morning list

At the home's hour, the jobs due that day go out as one tick list (`kit.ask` with `multiple`), each option a job with whose turn it is: "Bins (Ravi)". More than twelve jobs are split evenly over two or three lists.

- **Whoever ticks a job did it.** The first tick stands; a second person ticking the same job changes nothing.
- **Unticking takes it back,** for the person who ticked, until the job comes due again.
- **A day with one job** has no list (a poll needs two options). It goes out as a line: "Today: *Bins* (Ravi). React 👍 when it's done." A 👍, ✅, 👌, 💪 or 🙌 ticks it for whoever reacted, and Zelfred answers with a ✅. Taking the reaction away takes the tick back.
- **A day with nothing due** gets no message.
- **A job nobody ticked** is on the next day's list again, with the same person, and that list opens with one line: "Not ticked yesterday: Bins."
- **The list of the day before** stops taking ticks when the new one goes out.
- **If the hour was missed** (Zelfred was down), the list goes out at the next hour of the same day.
- The first list in a home opens with one line saying how it works.

### Turns

- The turn belongs to a place in the rota. Someone who is away is skipped, and the turn goes to the next person who is there.
- **"Turn moves on"** (what a new home gets; the owner's decision, 2026-11-23): when a job is ticked the turn goes to the next person, whoever ticked it.
- **"Turn stays"**: the turn only moves when the person whose turn it was ticks it. Someone else doing it gets the credit, and the job comes back to the same person next time.
- A swap changes who does one turn each for two people. The rota itself stays as it was.
- "Every 3 days" counts from the day the job was last ticked.

### People

A plugin is never given a group's members. A person is known by the name put in a rota. When someone writes a message Chores understands, ticks or reacts, their WhatsApp name (the whole of it, or its first word) is matched to such a name and the two are joined. A name that matches nobody becomes a new person with that first name. `I'm Ravi` joins them by hand.

A person the home marks as a child stays in rotas by name. When they tick a job, the turn moves on and the job is recorded as done with nobody named. They never appear in the count.

### Ideas

`ideas` sends a tick list: Bins, Dishes (every day), Bathroom, Sweeping (every Sunday), Water can, Book the gas (when needed), Pay the help (monthly on the 1st), Society bill (monthly on the 5th), Water filter (every 90 days). Each one ticked is added for anyone to do; a line above the list says how to give it a rota. Unticking takes the job back while it has no rota and was never ticked.

### Groups the home already has

It can be chosen for a WhatsApp group the person already had (`onGroup`, the `groups` permission). It says once how it works there. Each group is its own home: its own jobs, people, hour, rule for turns and count. When the group is taken back, nothing more is sent there and what was kept stays, in case it comes back.

### A message it can't read

Alone with the person in the app's own group, every unreadable message goes to `kit.unsure`. Once anyone else has written there, and always in a group the home already had, people also just talk: a message gets an answer only when it is one of the messages above, or names a job or the word "chores". A ready-made message about a job only acts when that job exists, so "ok done" does nothing.

Limits: 30 jobs and 20 people a home, 12 people in a rota, 40 characters and 5 words for a job's name.

These choices are the plugin author's and were not confirmed by the owner: the count on request only, one hour for the whole home, the list of ideas and their rhythms, that `ideas` is a tick list sent on request and not with the welcome, a child being in a rota with nothing counted, one line of words for every job added or changed, anyone in the group being able to add, change and remove jobs and people, the first tick standing, a single job going out as a line to react to, every line and the order of the first five minutes, asking which name is yours only when the WhatsApp name doesn't say, the quiet rule above, a missed list going out later the same day, and the limits.

## Schedules

| Id | When | What it does |
|---|---|---|
| `day` | every hour | For each home whose hour has come and whose list hasn't gone out today: closes yesterday's list, puts what came due on today's, and sends it. On Mondays it first sends the count for the week before, to a home that asked for it. |

Hourly because each home picks its own hour.

## Settings

Kept per home, in its `homes` record, not in the install's settings: `hour` (0 to 23, default 8), `turns` (`"move"` or `"stay"`, default `"move"`) and `weekly` (default off). Each has a message above and a page action below. Only the person who added the app can change them, in WhatsApp and on the page.

## Web page

`web.load` gives `{ today, month, homes, ideas, me }`: `ideas` are the usual jobs (`{ id, name, rhythm }`) for the setup, `me` the person's first name. Each home: `key` (null for the app's own group), `name`, `hour`, `turns`, `weekly`, and

- `today`: the jobs due today, `{ id, name, who }`, and the ones ticked today, `{ id, name, who: null, done: { by } }`
- `week`: the next 6 days, each `{ day, jobs: [{ id, name, who }] }`, with whose turn each job would be if every turn before it is taken
- `jobs`: `{ id, name, rhythm, rota: [{ id, name }], next, nextDay }`
- `people`: `{ id, name, linked, back, away, child }`
- `count`: `{ month, rows: [{ name, n }], total }` for `args.month` ("YYYY-MM", this month when left out), and `since`, the month of the first tick

Actions. Each takes `home` (the group's key, null for the app's own group) and throws a plain sentence when it can't.

| Action | Arguments | Does |
|---|---|---|
| `setup` | `people` (first names, the person's own first), `jobs` (`{ name, rhythm, turns }`), `hour` | Sets up a home that has no jobs, in one go. Jobs with `turns` get everyone as their rota, each starting one person further on. Said once in the group; today's list follows when something is due. |
| `addJob` | `name`, `rhythm`, `rota` (names) | A new job. Returns `{ id }`. |
| `setJob` | `id`, any of `name`, `rhythm`, `rota` (names, in order) | Changes a job. A reordered rota keeps the turn with the person whose it was. |
| `removeJob` | `id` | Takes a job away. The page asks first. |
| `tick`, `untick` | `id` | Ticks a job as the person who added the app, or takes their own tick back. |
| `need` | `id` | Puts a job with no fixed day on the list. |
| `addPerson` | `name` | Returns `{ id }`. |
| `removePerson` | `id` | Out of the home and every rota. The page asks first. |
| `setAway` | `id`, `back` (a day after today, `"open"` or null) | |
| `setChild` | `id`, `child` | |
| `setHour` | `hour` | |
| `setTurns` | `turns` | A change is said once in the home's group. |
| `setWeekly` | `on` | |

A rhythm is `{ kind: "daily" }`, `{ kind: "weekdays", days: [0..6] }` (0 Sunday), `{ kind: "every", n, from? }` (2 to 365 days), `{ kind: "monthly", date }` or `{ kind: "asked" }`.

Not built: what a friend who logged in to Zelfred sees (`web.loadFor`).

## Data

Every key starts with the home: `main` for the app's own group, or the key of a group that was handed over.

| Collection | Key | Data | Sort |
|---|---|---|---|
| `homes` | home | `{ name, hour, turns, weekly, sent?, last?, taught?, taughtList?, taughtDone?, taughtCover?, toldPeople?, offered?, firstTick?, toldPage?, asking?, shared?, left?, made }` | first kept (ms) |
| `jobs` | `<home>:<id>` | `{ name, rhythm, rota, at, over, open, last, made, idea? }` | made (ms) |
| `people` | `<home>:<id>` | `{ name, sender, back, child?, made }` | first known (ms) |
| `done` | `<home>:<id>` | `{ job, name, occ, by, who, turn, at }` | the day it was ticked |

- A job's `rota` holds people's ids, `at` is whose turn is next, `over` the swaps still owed, `open` the day it came due and wasn't ticked yet. `last` is the last tick (`{ key, day, occ, by, sender, was }`), kept so it can be taken back.
- A person's `sender` is their `sender.id` once it is known (not a phone number), `back` the day they are back or `"open"`.
- A `done` record's `by` is a person's id (null for a child), `who` their name then, `turn` whose turn it was, `occ` the day the job had come due.
- A home's `sent` is the day its list last went out, `last` the refs of that day's lists.

Refs: `{ kind: "day", home, day, part, ids }` on a morning list, `{ kind: "one", home, day, job }` on a single job's line and on the first job's answer, `{ kind: "ideas", home, ids }` on the ideas list, `{ kind: "me", home, sender }` on "Which of these is you?".

A home's `taught*`, `toldPeople` and `offered` record what was already said once. `asking` holds the open "which is you" question: who was asked, about which job, and the people offered.

## Privacy

Permissions: `members`, so everyone in the home's group can tick, take turns and be counted, and `groups`, so it can be given the group the home already has.

Reads only the messages in its own groups, its own stored data, and the name and time zone of the person who added it. In a group where people also talk, every message there reaches the plugin; it keeps nothing from a message it doesn't act on.

Stores each job, the first names put in rotas, the WhatsApp first name and id of a person who ticked or wrote to it, who is away until when, and for each tick the job, the day and who did it. It keeps no phone numbers.

The count of who did what is a record about people who didn't install the app. It is shown in the group when someone there asks, on the page to the person who added the app, and sent weekly only when that person switched it on. For someone marked as a child, a tick is kept with no name and never counted.

Everyone in the group sees everything it posts there, as with any WhatsApp group. A message it can't read, and that names a job, goes to Zelfred's intent model to be classified; nothing else is sent to a model.
