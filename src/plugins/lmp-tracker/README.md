# 🌸 LMP Tracker

Track your period or your pregnancy on WhatsApp. Log the day your period starts and it predicts the next one and your fertile window, and reminds you ahead of time. Pregnant? Send your LMP (the first day of your last menstrual period) and it tells you how many weeks pregnant you are, your due date, and sends a short update every week. Lives in its own WhatsApp group, "🌸 LMP Tracker".

Predictions are estimates from your own dates, not medical advice. Follow your doctor.

## Commands

Send these in the LMP Tracker group. Dates can be `today`, `yesterday`, `3 days ago`, `12 nov`, `nov 12`, `12/11`, `12/11/2026` or `2026-11-12` (day first).

| Message | What happens |
|---|---|
| `period started` / `period today` / `period started 12 nov` | Logs the first day of a period. A start within 10 days of one already logged moves it instead of adding another. 👍 |
| `period ended` / `period ended 16 nov` | Logs the last day of the current period (used for average period length). 👍 |
| `cycle` / `next` / `status` | Next period (date and days away, or days late), fertile window, likely ovulation day, average cycle and period length. |
| `history` | The last 12 period starts with each cycle's length. |
| `undo` | Removes the most recent period start. 👍 |
| `delete 12 nov` | Removes the period that started on that day. 👍 |
| `cycle length 30` | Cycle length to use until two cycles are logged (21-45 days). 👍 |
| `reminders off` / `reminders on` | Period reminders off or on. 👍 |
| `fertile reminders on` / `fertile reminders off` | A message when the fertile window starts (off by default). 👍 |
| `reminder time 8am` | When reminders and weekly updates arrive. 👍 |
| `pregnant lmp 3 oct` / `lmp 3 oct` | Starts pregnancy tracking from that LMP and answers with weeks pregnant, the month, the trimester and the due date (with a note if it's under 2 weeks or 42 weeks or more). |
| `due date 10 jul` | Starts pregnancy tracking from a due date (LMP is 280 days earlier). |
| `week` / `status` (while pregnant) | Weeks and days, trimester, due date and days to go. |
| `not pregnant` / `stop pregnancy` | Stops pregnancy tracking and goes back to period tracking. 👍 |
| `help` | This list. |

Replying `started` (or `yes`) to a "your period may start soon" or "your period is late" message logs today as the start.

## Schedules

| Id | When | Does |
|---|---|---|
| `daily` | once a day at `reminderHour` | Period mode: "may start in about 2 days" (2 days before the predicted start), "fertile window starts today" (if fertile reminders are on), and one "it's 3 days late, did it start?" nudge. Pregnancy mode: a short update on each new week (the LMP's weekday). Each message is sent once. |

## Settings

| Key | Default | Meaning |
|---|---|---|
| `reminderHour` | `9` | Local hour (0-23) for reminders and weekly updates. |
| `cycleLength` | `28` | Cycle length used until two cycles are logged. |
| `periodReminders` | `true` | "May start soon" and "late" messages. |
| `fertileReminders` | `false` | "Fertile window starts today" messages. |

## How predictions work

- **Average cycle:** the mean of the last 6 cycles between logged starts (cycles of 15-60 days count; others are treated as a missed log). With fewer than one usable cycle, `cycleLength` is used.
- **Next period:** last start + average cycle.
- **Ovulation:** about 14 days before the next period. **Fertile window:** the 5 days before ovulation and the day of ovulation.
- **Pregnancy:** due date = LMP + 280 days (Naegele's rule). Weeks pregnant = days since LMP ÷ 7. Trimesters: first up to 13 weeks 6 days, second 14 weeks to 27 weeks 6 days, third from 28 weeks (ACOG). Month (approximate, as commonly counted in India): 1st weeks 0-4, 2nd 5-8, 3rd 9-13, 4th 14-17, 5th 18-22, 6th 23-27, 7th 28-31, 8th 32-35, 9th from 36.

## Data

| Collection | Key | Data | Sort |
|---|---|---|---|
| `periods` | start day | `{ start, end? }` | start day |
| `pregnancy` | `current` | `{ lmp, since }` | none |
| `sent` | `<kind>:<day>` | `1` | day |

## Privacy

Reads only the messages you send in its own group, its own stored data, your time zone and your name. Stores only the dates you give it (period starts and ends, your LMP) and which reminders it already sent. Nothing leaves whatodo. Stopping pregnancy tracking deletes the stored LMP. This is sensitive health data: on the whatodo website, keep your account behind your PIN.
