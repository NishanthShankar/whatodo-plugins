# 🌱 Habits

Build habits with a check-in and streaks, every day or only on the days you pick. Lives in its own WhatsApp group, "🌱 Habits".

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
| `help` | This list. |

Check-ins: at each habit's hour (its own, else the default), on its days, the plugin posts one message per habit not yet done that day. Streaks skip days a habit isn't due on. Reacting ✅ 👍 💪 🔥 logs it; reacting ❌ ✖️ ❎ 👎 🚫 says you didn't (counts like no answer, but closes the day so it isn't asked again); removing the reaction undoes either. Every reaction gets a 👍 back, removed again with yours. Replying `yes` / `no` also works.

## Schedules

| Id | When | Does |
|---|---|---|
| `checkin` | hourly | Asks about habits whose check-in hour is now. |

## Settings

| Key | Default | Meaning |
|---|---|---|
| `checkinHour` | `21` | Default check-in hour (0-23), or `null` for off. |

## Data

| Collection | Key | Data | Sort |
|---|---|---|---|
| `habits` | habit id | `{ name, createdDay, archived, hour?, days? }` (`days`: 0 Sun to 6 Sat, unset/null = every day) | created time (ms) |
| `logs` | `<habitId>:<day>` | `1` | day |
| `missed` | `<habitId>:<day>` | `1` | day |

## Web page

Lockable. `load({ days? })` returns `{ today, timezone, habitHour, habits: [{ id, name, hour, days, createdDay, streak, best, total, doneDays }] }`. Actions: `create`, `rename`, `archive`, `setDay`, `setHabitHour`, `setHabitDays`, `setHour`.

## Privacy

Reads only its own group's messages, its own stored data, the person's time zone and name. Stores habit names and the days they were done. Nothing leaves whatodo.
