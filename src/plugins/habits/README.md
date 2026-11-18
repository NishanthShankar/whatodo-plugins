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

Anything else goes to telcurio's intent model, so plain sentences work too: "I want to start going to the gym on mondays and thursdays", "finished my workout", "skipped reading today", "move gym to tuesdays", "check in with me at 8pm instead". Intents: `add_habit`, `log_done`, `missed`, `undo_done`, `remove_habit`, `set_days`, `set_time`, `default_time`, `list`, `help`; targets are the active habits (id to name). If the text doesn't say which habit, days or time, it asks.

Check-ins: at each habit's hour (its own, else the default), on its days, the plugin asks with one poll per habit not yet done that day: "🌱 Did you Read today?  🔥 5" with Yes and No (with simple messages on: "Read  🔥 5"; the streak is always there, 🔥 0 included) (`kit.ask` with `keep`). Streaks skip days a habit isn't due on. Yes logs it; No says you didn't (counts like no answer, but closes the day so it isn't asked again). The first answer gets a 👍 on the poll.

How the poll behaves (the owner's decisions, 2026-11-18):
- The poll is not deleted when answered, and no line is posted. The answer can be changed as often as you like.
- It closes when the same habit's next check-in goes out. The old poll stays in the chat; a change on it is refused.
- With `delete polls on`, the first answer settles it: the poll is deleted and `*Read*: Yes` is posted.
- One person per group (no `members` permission), two options, so the list never runs long.
- Typing `yes`, `no`, `1` or `2` as a reply to the poll answers it too.

Check-in messages from before 2.0.0 still work: reacting ✅ 👍 💪 🔥 or ❌ ✖️ ❎ 👎 🚫 to one, or replying `yes` / `no`, logs that day, and every reaction gets a 👍 back.

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

## Web page

Lockable. `load({ days? })` returns `{ today, timezone, habitHour, quickLog, deletePolls, habits: [{ id, name, hour, days, createdDay, streak, best, total, doneDays }] }`. Actions: `create`, `rename`, `archive`, `setDay`, `setHabitHour`, `setHabitDays`, `setHour`, `setQuickLog { on }`, `setDeletePolls { on }`.

## Privacy

Reads only its own group's messages, its own stored data, the person's time zone and name. Stores habit names and the days they were done. A message it can't read, with its intent descriptions and your habit names, is sent by telcurio to its intent model (jev) to be classified; telcurio keeps only the answer, never the text.
