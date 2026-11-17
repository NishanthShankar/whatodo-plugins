# 🩸 Period Tracker

Keeps track of your periods on WhatsApp. When your period starts, send `period` or `today`. That's all you do. (`LMP`, short for last menstrual period, works too.) If the next one hasn't come when it usually does, it reminds you, reminds you again a week later, and then suggests a home pregnancy test. It learns your usual cycle from the dates you send. Lives in its own WhatsApp group, "🌙 Period Tracker".

Reminders are estimates from your own dates, not medical advice. Follow your doctor.

## Commands

Send these in the Period Tracker group. Dates can be `today`, `yesterday`, `3 days ago`, `9 nov`, `nov 9`, `9th Nov`, `9/11`, `9/11/2026` or `2026-11-09` (day first).

| Message | What happens |
|---|---|
| `period` / `periods` / `today` / `now` / `LMP` / `periods came` / `got my period` | Records today as the day your period started. No date means the day you send it. |
| `yesterday` / `9 nov` / `3 days ago` / `period 9 nov` / `LMP nov 9` / `my lmp was 9 nov` / `came on 4th` | Records that day. A date on its own is enough. Only needed when it didn't start today. |
| `last period` / `when was my last period?` / `last lmp` / `lmp?` | When your last period started, how long ago, and when the next one is (or was) due. |
| `history` | Your last 12 periods, the days between them, and how often they usually come. |
| `undo` | Removes the most recent date. 👍 |
| `delete 9 nov` | Removes the date recorded on that day. 👍 |
| `pregnant` / `I'm pregnant` | Pregnancy mode: the period reminders stop. It replies with when your last period started, about how far along you are and the due date. That date stays what it was. Sending a new period date later (your periods are back) ends pregnancy mode and tracking carries on. In pregnancy mode a bare `period` (or `today`, `now`, `lmp`, or a date on its own) could mean either, so it asks: reply `1` to see your last period or `2` to record that day as the start of a new one. `2` ends pregnancy mode and tracking carries on, which is how a miscarriage, an abortion or the birth is handled without having to say so. |
| `not pregnant` | Ends pregnancy mode; reminders come back. 👍 |
| `moon` / `blood` | Messages are marked with 🩸. Right after your first date it asks once if that's OK: `no` switches to 🌙, and no reply means yes. `moon` and `blood` switch any time. 👍 |
| `reminders off` / `reminders on` | Period reminders off or on. 👍 |
| `reminder time 8am` | The hour reminders arrive. |
| `help` | This list. |

What you get back: the first date you ever send is confirmed in words ("Got it: your period started Mon 9 Nov. From next time you'll just get a 👍."). After that a clear date only gets a 👍. Words come back only when something needs saying: the date changed one already recorded ("Changed: your last period started Thu 12 Nov (it was Mon 9 Nov)", for a date within 10 days of it), the date is older than your latest one, it's in the future or unreadable, or it ended pregnancy mode.

Answering a reminder: `yes` (or reacting ✅ to it) means your period started today; `started 2 days ago` or `14 nov` gives the day; `not yet` is fine too. To the pregnancy test nudge, `yes` or `positive` turns pregnancy mode on and `no` just says OK. You don't have to reply to the message itself: a plain `yes` is read as the answer to the last reminder.

Messages the commands don't cover ("my periods came on 9th nov", "kab tha last period") go to telcurio's intent understanding: a period starting (the date is read from the sentence, today if there isn't one), asking for the last period, history, pregnant, not pregnant, undo and help.

## Schedules

| Id | When | Does |
|---|---|---|
| `daily` | once a day at `reminderHour` | Counted from your latest LMP with your usual cycle C (28 days until learned): on day C "your period is due around now", on day C+7 "has your period come?", on day C+14 "you might be pregnant, a home test (UPT) can tell you". Each is sent once per LMP (within a week of its day, in case a day is missed), nothing is sent after the test nudge, and a new LMP starts over. Nothing is sent in pregnancy mode. |

## Settings

| Key | Default | Meaning |
|---|---|---|
| `reminderHour` | `9` | Local hour (0-23) for reminders. |
| `cycleLength` | `28` | The cycle assumed until yours is learned. |
| `periodReminders` | `true` | The period reminders. |
| `symbol` | `blood` | The mark on its messages: `blood` (🩸) or `moon` (🌙). |

## How the timing is learned

- **Cycle:** the days between two LMPs. Gaps of 15 to 45 days count; a longer gap is a month you didn't send (or a pregnancy), not a cycle.
- **Usual cycle:** the median of your last 6 cycles, kept between 21 and 45 days. Until 3 cycles are known the missing ones count as 28 days, so one late month doesn't move the reminders but two in a row do. If your periods keep coming every 5 weeks, the reminders come at 5 and 6 weeks and the test nudge at 7.
- **Test nudge:** two weeks after your period was due, and never earlier than a week past your longest recent cycle. If you've gone 40 days before, it waits until day 47.
- **Weeks along and due date** (pregnancy mode): weeks are counted from the LMP; due date = LMP + 280 days (Naegele's rule).

## Data

| Collection | Key | Data | Sort |
|---|---|---|---|
| `periods` | LMP day | `{ start }` (2.x rows may also have `end`, ignored) | LMP day |
| `pregnancy` | `current` | `{ since }`: in pregnancy mode since that day. It holds no LMP: the LMP is always your latest in `periods`. (2.x stored `lmp` here; moved into `periods` on upgrade.) | none |
| `pending` | `ask` | `{ day }`: the open "see it or record it?" question and the day you wrote. A plain `1` or `2` answers it for 3 days. | none |
| `pending` | `symbol` | `{ day }`: the open "OK seeing 🩸?" question. A plain `no` or `ok` answers it for 3 days. | none |
| `sent` | `<stage>:<lmp>` (`due`, `again`, `upt`), and `first-lmp` once the first LMP was confirmed in words; 1.x and 2.x keys are left alone | `1` | LMP day |

## Privacy

Reads only the messages you send in its own group, its own stored data, your time zone and your name. Stores only your LMP dates, whether you're in pregnancy mode (and since when), and which reminders it already sent. Nothing leaves telcurio, except that a message the commands don't understand is passed to telcurio's intent model to work out what you meant. This is sensitive health data: on the telcurio website, keep your account behind your PIN.
