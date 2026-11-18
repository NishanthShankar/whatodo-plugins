# Changelog: Habits

All notable changes to this plugin. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/).

## [3.6.0] - 2026-11-18

### Added
- A WhatsApp group you already have can become a Habits group. Add telcurio to it and pick Habits for it, in the chat with telcurio or on the web. It keeps its name and its people, and works like any other Habits group. Choosing something else for it later stops the check-ins there; what everyone logged is kept.

## [3.5.3] - 2026-11-18

### Added
- If someone else votes on a person's profile offer, telcurio says once: "I need consent from Asha for this, so only Asha's vote counts here."

## [3.5.2] - 2026-11-18

### Changed
- The profile offer is one poll again, with the person's WhatsApp name and no tag: "Good start Asha. Let me create an account for you, so you can join the streak race too. Just vote Yes and I'll set it all up."

## [3.5.1] - 2026-11-18

### Changed
- The profile offer tags the person and reads: "Good start @Asha. Let me create an account for you, so you can join the streak race too. Just vote *Yes* and I'll set it all up." The poll under it asks "Create your telcurio account?" with Yes and Not now.

## [3.5.0] - 2026-11-18

### Changed
- Stopping a habit other people do stops it for you only. _stop gym_ and _leave gym_ now mean the same, in WhatsApp and with "Stop tracking" on the web: you step out and it goes on for everyone else. A habit is stopped altogether only when the last person doing it steps out. Your own habits in your main group still stop when you stop them.
- Everyone who takes part gets a streak, with or without a telcurio profile. Saying Not now to the profile offer no longer deletes what you answered: your streak stays and shows with everyone's, in the group and on the web.
- The profile offer now reads: "Asha, you've started forming a habit. Want your own telcurio profile, so you can see your streak on the web too? Tap Yes and I'll set you up. Nothing else to do."

### Data
- `pwait` is no longer written. Entries from earlier versions become ordinary `pjoins` rows the next time that person answers the offer or asks to be set up.

## [3.4.0] - 2026-11-18

### Added
- On the web, a habit other people take part in now has your own card: mark today done, fix an earlier day, and see your longer run of days. Below it everyone is listed side by side, you included, to compare. Other people's days are theirs and can't be changed.
- From the page you can take up a habit someone else added, step out of it, and rename, reschedule or stop a habit in your groups (`groupDay`, `groupJoin`, `groupRename`, `groupHour`, `groupDays`, `groupStop`).
- One of your own habits that a friend takes part in shows everyone below your card too.

### Data
- `load`: each group habit gains `createdDay`, `mine: { joined, streak, best, total, doneDays }` and `me` on each person; an own habit with friends gains `together` and `people`. Nothing stored changes shape.

## [3.3.0] - 2026-11-18

### Changed
- "Pacts" are now simply more Habits groups. _new group gym buddies_ makes one, _groups_ lists them, _close group gym buddies_ ends one. A group works the same on your own or with other people. The old words (_new pact_, _pacts_) still work.
- Every Habits group follows one set of rules. Anyone in it can add a habit, do any habit there by answering its poll, and see everyone's streaks with _habits_. A habit can be stopped or rescheduled by whoever added it, or by the person whose group it is.
- Friends can now add habits in your main Habits group too. Theirs are asked every day like yours, and listed after yours. You can take one up (_done yoga_) or stop it.
- When other people take part in a habit, your own answer no longer gets a 👍: the poll already shows who answered what.
- Group names and check-ins use 🌱 everywhere.

### Data
- Habits friends add in the main group are kept in `phabits` with an empty group key. `load` returns `groups` (was `pacts`), with the main group first when friends have added habits to it.

## [3.2.0] - 2026-11-18

### Added
- Friends you add to your own Habits group are heard there too. They take part in any of your habits by answering its poll, with their own streak, and can send _habits_, _done read_, _undo read_, _join read_ and _leave read_. The list stays yours: only you add or change habits there.
- A habit with friends taking part shows everyone in its check-in ("🌱 Did you Read today?  Together 🔥 3 · Asha 🔥 5 · Ravi 🔥 3"), goes out even when you have already answered, and its poll always stays.
- A friend who asks for a group of their own is told to log in at app.whatodo.today and add Habits.
- A friend who logs in to telcurio sees the habits they take part in, with their own days and how everyone stands (`web.loadFor`).

### Data
- Friends in the private group use the same collections as pacts (`pjoins`, `plogs`, `pmissed`, `pwait`, `people`), keyed by the private habit's id. Your own days stay in `logs` and `missed`.

## [3.1.0] - 2026-11-18

### Changed
- In a pact, the way back after "Not now" is _set me up_ or _hook me up_ (also in your own words, like "can you set it up for me now"). _track me_ is gone.
- Saying Not now to the profile offer gets an answer: "No problem. Just ask me to set it up for you later if you change your mind."

### Added
- Intent `set_me_up`, so the request is understood however it is said.

## [3.0.0] - 2026-11-18

### Added
- Pacts: a habit you keep with other people. _new pact gym buddies_ makes a WhatsApp group for it. Add your people there, then tell me a habit in that group. _pacts_ lists yours and _close pact gym buddies_ ends one.
- In a pact anyone can add a habit, and each habit gets one poll a day for the whole group. Everyone sees who tapped Yes and No on the poll itself, so nothing is posted for each answer.
- Each person has their own streak, and each habit has a together streak: the days everyone doing it said Yes. Both are shown in the next day's poll and with _habits_ in the pact's group.
- You take part in a habit by adding it, answering its poll or sending _join gym_. _leave gym_ steps out. Someone silent for a week stops counting toward the together streak.
- A friend who has no telcurio profile is asked once, on their first answer, whether they want one so their streak can be kept. On Yes they are set up with nothing else to do. On Not now what they answered is forgotten and they aren't asked again; _track me_ changes their mind later.

### Changed
- New permissions: `groups` (a pact is its own WhatsApp group) and `members` (everyone in a pact's group is heard). This is why it is a major version. Your private Habits group still hears only you.

### Data
- New collections for pacts, apart from the private ones: `pacts`, `phabits`, `pjoins`, `plogs`, `pmissed`, `pwait`, `people`, `pasked`. Nothing existing changes shape.
- A pact check-in's ref is `{ pact, habitId, day }`; the profile offer's is `{ offer: personId }`.

## [2.1.1] - 2026-11-18

### Changed
- The welcome message says you can name a habit in your own words; _add meditate_ is the quick way, not the only one.
- The description shown in the store and on the site no longer speaks as "I". Messages in WhatsApp still do.

## [2.1.0] - 2026-11-18

### Changed
- Every check-in shows the streak, with simple messages on too: `Read  🔥 5`. A streak of zero is shown as 🔥 0, so the number is always there.

## [2.0.0] - 2026-11-18

### Changed
- The daily check-in is now a poll: one per habit, with Yes and No. Tap Yes if you did it, No if you didn't (No closes the day, as ❌ did). This replaces the message you reacted to. It is a major version because the check-in you answer has changed shape.
- The poll stays in the chat and you can change your answer as often as you like, until that habit's next check-in goes out. After that the earlier poll is closed and a change on it is refused.
- Your first answer gets a 👍 on the poll.
- The question shows your streak (🔥 5). The row of squares is no longer in the check-in; send _habits_ to see it.
- With simple messages on, the poll's question is just the habit's name.

### Added
- _delete polls on_ deletes each check-in poll once you answer it and posts a line with what you chose (`*Read*: Yes`), so it can't be changed. _delete polls off_ (the default) keeps the poll. Also a switch on the web page (`setDeletePolls`).
- Typing _yes_ or _no_ as a reply to the poll, or the number of the option, answers it too.

### Data
- New setting `deletePolls` (default `false`).
- New collection `asked`: per habit, the day of its latest check-in, used to close the one before.
- Check-in messages sent before this version keep working: reacting ✅ or ❌ to them, or replying yes or no, still logs that day.

## [1.6.1] - 2026-11-17

### Fixed
- The check-in starts with 🌱, Habits' own icon, instead of 🌙. The moon belongs to Period Tracker.

## [1.6.0] - 2026-11-17

### Changed
- With simple messages on (the `quickLog` setting), the check-in is just the habit's name and nothing else: no question, no squares, no hint. You react ✅, 👍 or ❌ as before. Sending just a habit's name still logs it.

### Added
- _simple on_ and _simple off_ turn it on and off. _quick log on_ and _quick log off_ still work.

### Data
- No change.

## [1.5.1] - 2026-11-17

### Changed
- The product is now called telcurio. This plugin's page title, description and wording use the new name. Nothing changes in how it works, and addresses like app.whatodo.today stay as they are.

## [1.5.0] - 2026-11-17

### Added
- Quick log, off by default. Turn it on with _quick log on_ (or on the web page), then send just a habit's name, like _meditate_, to log it for today. I react ✅. Only an exact name counts; anything else is read as before. _quick log off_ turns it off.

### Data
- New setting `quickLog` (default `false`). The web page data gains `quickLog`, and there's a `setQuickLog { on }` web action.

## [1.4.1] - 2026-11-16

### Fixed
- Habit names read from sentences drop "also", "just", "really", "kindly" and "and": "can you also track reading every day at 10pm" adds *Reading*, not *Also track reading*.

## [1.4.0] - 2026-11-16

### Added
- Understands messages that aren't exact commands, through telcurio's intent model (SDK 1.4.0): "I want to start going to the gym on mondays and thursdays", "finished my workout", "skipped reading today", "move gym to tuesdays", "check in with me at 8pm instead". Intents: add_habit, log_done, missed, undo_done, remove_habit, set_days, set_time, default_time, list, help. Targets are your habits by name. Names, days and times are read from the text by the plugin.
- When the text doesn't say which habit, days or time, it asks with the exact command.

### Changed
- A message it can't read goes to telcurio's intent model first (`kit.unsure`); "I didn't get that" is only sent when the model isn't sure either.

### Requires
- telcurio with SDK 1.4.0 intent support. On an older runtime nothing changes: unclear messages get "I didn't get that".

## [1.3.0] - 2026-11-16

### Added
- Habits can be for some days only: `add gym on mon wed fri`, `add walk at 7am on weekdays`, `days gym tue thu`, `days gym every day`. Day words: Mon to Sun (short or full), weekdays, weekends, every day / daily.
- The check-in only goes out on a habit's days.
- `habits` shows 📅 with the days for habits that aren't every day.
- Web: `setHabitDays` action (`days`: weekdays 0 Sunday to 6 Saturday, or null for every day), optional `days` on `create`, and `days` on each habit in `load`.

### Changed
- Streaks skip days a habit isn't due on, so a rest day doesn't break them; doing it on a rest day still counts. Best streak follows the same rule.
- The 🟩⬜ grid shows ▫️ for days a habit isn't due on.

### Data
- `habits` rows gain an optional `days` (array of 0-6, or null). Rows without it are every day; nothing to migrate.

## [1.2.0] - 2026-11-16

### Added
- React ❌ (or ✖️ ❎ 👎 🚫) to a check-in to say you didn't do it. It counts the same as no answer for streaks, but closes the day: that habit isn't asked again that day. Removing the ❌ reopens it, and `done read` still logs it later. Replying _no_ to a check-in closes the day the same way.
- Every reaction to a check-in gets a 👍 back, so you know it was recorded. Removing your reaction removes the 👍.

### Changed
- Check-in, welcome and help text mention ❌.

### Data
- New `missed` collection: key `<habitId>:<day>`, data `1`, sort = day. Nothing existing changes.

### Requires
- The telcurio runtime that delivers `kit.react` in `onReaction` (SDK 1.3.0). On an older runtime the 👍 is simply not sent.

## [1.1.2] - 2026-11-16

### Changed
- Marketplace text says "daily check-in at the time you pick" instead of "nightly", matching per-habit check-in times from 1.1.0.
- Adds its public page listing (search title, description and heading) for whatodo.today.

## [1.1.1] - 2026-11-16

### Changed
- Declares its platform cost tier: tier 1 (stores a little data, posts a few messages a day). Nothing changes for people using it.

## [1.1.0] - 2026-11-16

### Added
- Each habit can have its own check-in time: `add read at 10pm`, `time meditate 7am`, `time meditate default`. Habits without one are asked at the default check-in time.
- `habits` shows ⏰ next to habits with their own time.
- Web: `setHabitHour` action and an `hour` field on each habit in `load`.

### Changed
- Check-ins run on an hourly schedule (`checkin`) instead of one nightly schedule (`nightly`), so each habit can be asked at its own hour.
- `time 10pm` now sets the default check-in time; `time off` turns the default off (habits with their own time are still asked).

### Data
- `habits` rows gain an optional `hour` (0-23 or null). Existing rows need no change.

## [1.0.0] - 2026-11-16

### Added
- First release as a plugin, in its own WhatsApp group ("🌱 Habits").
- Commands: `add <habit>`, `habits`, `done <habit>`, `undo <habit>`, `stop <habit>`, `time <hour>`, `time off`, `help`.
- Nightly check-in, one message per habit not yet done that day; reacting ✅ 👍 💪 🔥 logs it, removing the reaction undoes it, replying yes/no works too.
- Streaks (days in a row, today not breaking it until answered), best streak, 🟩⬜ grids.
- Web page (lockable with the person's PIN): 30-day grid per habit, tick any past day, add, rename, stop tracking, check-in time.

### Data
- `habits`: key habit id, `{ name, createdDay, archived }`, sort created time.
- `logs`: key `<habitId>:<day>`, `1`, sort day.
- telcurio copies habits kept in the private chat (before plugins) into these collections on install.
