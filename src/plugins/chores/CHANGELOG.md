# Changelog: Chores

## [1.0.0] - 2026-11-25

### Added
- A home's jobs, each with a rhythm (every day, some weekdays, every so many days, monthly on a date, or when needed) and a rota. Said in one line: `bins every day, Ravi Asha Kiran`.
- Each morning, at the home's hour, the day's jobs as one tick list with whose turn each is. Whoever ticks a job gets the credit. A day with one job is a line to react to.
- The turn moves on to the next person whoever did the job. A home can switch to the other rule, where the turn stays with you until you do it (`turns stay`); only the person who added the app can, and the change is said in the group.
- A job nobody ticked stays with the same person and is on the next day's list, with one line saying so.
- `today`, `jobs`, `whose turn is bins`, `bins done`, `bins not done`, `gas needed`, `who did what`.
- `Ravi away till the 12th` and `Ravi back`, `swap bins with Asha`, `I'm Ravi`, `Mia is a child`.
- `ideas`: a tick list of usual jobs to pick from.
- It can be chosen for a WhatsApp group the home already has. Each group is its own home.
- A page: today, the week ahead, the jobs, the people and the count by month, with actions for all of them.
- Unlisted while it is being tried.

### Data
- Collections `homes`, `jobs`, `people` and `done`. Refs `{ kind: "day", home, day, part, ids }`, `{ kind: "one", home, day, job }` and `{ kind: "ideas", home }`.
