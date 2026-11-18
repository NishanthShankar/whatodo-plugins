# 🌱 Habits

Build habits with a daily poll and streaks, every day or only on the days you pick. Lives in its own WhatsApp group, "🌱 Habits".

## Commands

Send these in the Habits group.

| Message | What happens |
|---|---|
| `add meditate` | Starts a habit. 👍 |
| `add read at 10pm` | Starts a habit with its own check-in time. 👍 |
| `add gym on mon wed fri` | Starts a habit for some days only (also `on weekdays`, `on weekends`). 👍 |
| `days gym tue thu` / `days gym every day` | Changes a habit's days. 👍 |
| `habits` | Lists habits with 🔥 streak, ⏰ own time, 📅 days and a 14-day 🟩⬜ grid (▫️ = not one of its days). |
| `done meditate` / `undo meditate` | Logs or un-logs today. ✅ / 👍 |
| `stop meditate` | Stops tracking it (its history is kept). 👍 |
| `time 10pm` / `time off` | Default check-in time, or turn the default off. 👍 |
| `time meditate 7am` / `time meditate default` | One habit's own time, or back to the default. 👍 |
| `simple on` / `simple off` | Simple messages: when on, the check-in is just the habit's name and its streak, and a message that is only a habit's name (`meditate`, `Gym!`) logs it for today. Off by default. `quick log on` / `quick log off` still work. 👍 |
| `delete polls on` / `delete polls off` | Whether a check-in poll is deleted once you answer it (with a line saying what you chose) or stays so you can change it. Off by default. 👍 |
| `help` | This list. |

Anything else goes to telcurio's intent model, so plain sentences work too: "I want to start going to the gym on mondays and thursdays", "finished my workout", "skipped reading today", "move gym to tuesdays", "check in with me at 8pm instead". Intents: `add_habit`, `log_done`, `missed`, `undo_done`, `remove_habit`, `set_days`, `set_time`, `default_time`, `list`, `set_me_up`, `help`; targets are the active habits (id to name). If the text doesn't say which habit, days or time, it asks.

Check-ins: at each habit's hour (its own, else the default), on its days, the plugin asks with one poll per habit not yet done that day: "🌱 Did you Read today?  🔥 5" with Yes and No (with simple messages on: "Read  🔥 5"; the streak is always there, 🔥 0 included) (`kit.ask` with `keep`). Streaks skip days a habit isn't due on. Yes logs it; No says you didn't (counts like no answer, but closes the day so it isn't asked again). The first answer gets a 👍 on the poll.

How the poll behaves (the owner's decisions, 2026-11-18):
- The poll is not deleted when answered, and no line is posted. The answer can be changed as often as you like.
- It closes when the same habit's next check-in goes out. The old poll stays in the chat; a change on it is refused.
- With `delete polls on`, the first answer settles it: the poll is deleted and `*Read*: Yes` is posted.
- One person per group (no `members` permission), two options, so the list never runs long.
- Typing `yes`, `no`, `1` or `2` as a reply to the poll answers it too.

Check-in messages from before 2.0.0 still work: reacting ✅ 👍 💪 🔥 or ❌ ✖️ ❎ 👎 🚫 to one, or replying `yes` / `no`, logs that day, and every reaction gets a 👍 back.

### Pacts

A pact is a habit kept with other people: friends, a study partner, a partner. It lives in its own WhatsApp group, which the person adds the others to.

In your private Habits group:

| Message | What happens |
|---|---|
| `new pact gym buddies` | Makes a WhatsApp group for the pact. Add your people to it. |
| `pacts` | Lists your pacts. |
| `close pact gym buddies` | Ends the pact and closes its group. What was logged is kept. |

In a pact's group, from anyone there:

| Message | What happens |
|---|---|
| `add gym` (also `at 7am`, `on mon wed fri`) | Adds a habit to the pact. You are doing it. 👍 |
| `habits` | Everyone's streak for each habit, and the together streak. |
| `join gym` / `leave gym` | Start or stop doing a habit someone else added. 👍 |
| `done gym` / `undo gym` | Log or un-log your own today. ✅ / 👍 |
| `stop gym`, `time gym 7am`, `days gym mon wed` | Only the person who added the habit or who made the pact. 👍 |
| `set me up` / `hook me up` | Set up my profile and keep my streak (for someone who said Not now). |

How a pact behaves (the owner's decisions, 2026-11-18):
- One poll a day per habit for the whole group, always kept, so the poll shows who did it. Answers can change until that habit's next check-in. Nothing is posted or reacted for an answer.
- The question carries the standings: "🤝 Did you Gym today?  Together 🔥 4 · Asha 🔥 12 · Ravi 🔥 4".
- Each person has their own streak. The together streak counts days everyone doing the habit said Yes; a No or no answer from one person breaks it. A person counts from the day they joined, and stops counting after a week of silence.
- You are doing a habit once you add it, answer its poll or send `join`. So people can watch without taking part.
- Whose answers are kept: the pact's owner and anyone with a telcurio profile. Someone without one gets one poll, on their first answer: "Asha, you've started forming a habit. Want your own telcurio profile, so I can track your streak too? Tap Yes and I'll set you up. Nothing else to do." with Yes and Not now. Yes records their agreement (`kit.signUp`) and counts what they answered. Not now deletes it, answers "No problem. Just ask me to set it up for you later if you change your mind.", and they are never asked again; `set me up` or `hook me up` brings it back. Only the person named can answer their offer.
- Pact habits are apart from the private ones: they don't show in your private list.
- Limits: 10 pacts, 12 habits in a pact.

## Schedules

| Id | When | Does |
|---|---|---|
| `checkin` | hourly | Asks about habits whose check-in hour is now. |

## Settings

| Key | Default | Meaning |
|---|---|---|
| `checkinHour` | `21` | Default check-in hour (0-23), or `null` for off. |
| `quickLog` | `false` | Simple messages: the check-in is just the habit's name and streak, and a message that is only a habit's name logs it for today. |
| `deletePolls` | `false` | Delete each check-in poll once it is answered and post what was chosen. Off: the poll stays and the answer can be changed until the habit's next check-in. |

## Data

| Collection | Key | Data | Sort |
|---|---|---|---|
| `habits` | habit id | `{ name, createdDay, archived, hour?, days? }` (`days`: 0 Sun to 6 Sat, unset/null = every day) | created time (ms) |
| `logs` | `<habitId>:<day>` | `1` | day |
| `missed` | `<habitId>:<day>` | `1` | day |
| `asked` | habit id | the day of its latest check-in | that day |
| `pacts` | group key | `{ name, created, closed? }` | created (ms) |
| `phabits` | habit id | `{ pact, name, createdDay, archived, hour?, days?, by }` | created (ms) |
| `pjoins` | `<habitId>:<personId>` | `{ name, since, last? }`: who is doing a habit | none |
| `plogs` / `pmissed` | `<habitId>:<personId>:<day>` | `1` | day |
| `pwait` | `<personId>:<habitId>` | `1`: answered before deciding on a profile | none |
| `people` | person id | `{ name, asked?, profile? }` | none |
| `pasked` | habit id | the day of its latest pact check-in | that day |

## Web page

Lockable. `load({ days? })` returns `{ today, timezone, habitHour, quickLog, deletePolls, habits: [{ id, name, hour, days, createdDay, streak, best, total, doneDays }] }`. Actions: `create`, `rename`, `archive`, `setDay`, `setHabitHour`, `setHabitDays`, `setHour`, `setQuickLog { on }`, `setDeletePolls { on }`, `createPact { name }`, `closePact { key }`. `load` also returns `pacts: [{ key, name, closed, habits: [{ id, name, hour, days, together, people: [{ id, name, streak, total, doneDays }] }] }]`.

## Privacy

Permissions: `groups` and `members`, both for pacts.

In a pact, everyone in its group is heard and can see everything posted there, including each other's answers on the polls. For each person doing a habit it stores the WhatsApp name they show, the days they said Yes or No, and whether they agreed to a telcurio profile. A person's id here is not a phone number. Someone who says Not now has their answers deleted and nothing further kept.

Your private Habits group is different: it reads only its own group's messages, its own stored data, the person's time zone and name. Stores habit names and the days they were done. A message it can't read, with its intent descriptions and your habit names, is sent by telcurio to its intent model (jev) to be classified; telcurio keeps only the answer, never the text.
