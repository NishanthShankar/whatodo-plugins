# 🔁 SubscriptionTracker

Keeps two kinds of thing: what you pay for again and again (Netflix, a gym, cloud storage) and what runs out on a date unless you act (a passport, car insurance, a PUC certificate). You tell it, or forward the message your bank sent. It says what renews each week and again the day before, asks whether you still use the ones you could drop, and says where to cancel when you don't.

It lives in its own WhatsApp group, "🔁 Subscriptions". Other people can be in the group: anyone there can add, forward and answer.

It never sees a bank account, a mailbox or a statement. It knows what people tell it. This is step 1 of `docs/subscription-tracker-brief.md` in the Zelfred repo, with renewals in it.

## Commands

Send these in the group. Your own words work too: what the app can't read goes to Zelfred's intent model.

| Message | What happens |
|---|---|
| `Netflix 649 monthly on the 5th` | Kept. 👍. A name with an amount or a date; how often, the date and how it is paid are optional. The very first time, one message says what happens from now on; after that the 👍 is the whole answer. |
| `netflix rs 649`, `Google One ₹1,300 yearly 14 March`, `gym 2500 a quarter` | The same, in other words. An amount with a currency is kept in that currency. |
| `Netflix 649` (no date) | Kept, with the next date taken as one period from today, and said back in words so it can be corrected. No 👍 then: one receipt, never two. |
| `hotstar 299 monthly by upi autopay`, `... on card`, `... play store` | How it is paid is kept, so the cancel line names the right place. |
| `Spotify trial ends 5 Dec 119` | A free trial: told two days before it ends and the day before. |
| `car insurance 14 Feb`, `passport expires 3 March 2031`, `PUC valid till 12/05/2027` | Something that runs out. No amount needed. |
| a forwarded bank message | The name, the amount, the date and the account's last four digits are read; the rest is left. Kept as monthly, next one a month after the debit, and said back in words. When the name can't be read, the app asks what it is for. |
| the same name again | Changes the one already kept. 👍 |
| `list` (also `subscriptions`, `show`) | Everything kept: what you pay for, with the sum by month and by year, then what expires. |
| `this week` (also `week`, `upcoming`) | What renews or runs out in the next 7 days. |
| `remove netflix` (also `delete`, `cancelled`) | Off the list. 👍 |
| `done car insurance` (also `renewed`, `car insurance done`) | Something that ran out is renewed: the app asks until when. |
| `don't ask netflix`, `ask netflix` | Turns the usage question off or on for one subscription, for everyone in the group. 👍 |
| `kind netflix` | Asks again how to treat it. The person's choice wins over the built-in list. |
| `currency usd`, `currency` | Changes, or says, what plain amounts are counted in. |
| `help` | The command list. |
| anything else | "I need a name with an amount or a date..." (through `kit.unsure`). Once a friend has written in the group, this is said once and then not again until something is understood, since people also just talk there. |

Replying to one of the app's messages about a thing, or to your own message that added it:

| Reply | What happens |
|---|---|
| an amount, `219` | The amount is corrected. 👍 |
| a date, `3 jan`, `on the 5th` | The next date is set, and its notices start over. 👍 |
| `yearly`, `monthly`... | How often is changed. 👍 |
| `remove` | Off the list. 👍 |
| `done` (also `renewed`) | For something that expires: the "until when" question. |
| `don't ask`, `ask` | The usage question off or on. 👍 |

### The four kinds

Every record answers one question: does it renew by itself?

| Kind | Examples | What the app does |
|---|---|---|
| Use it or lose it | Netflix, a gym | Asks before each renewal whether it was used; says where to cancel after two "Not at all" in a row |
| Keeps things running | iCloud, a phone plan | Says the date and the amount. Never a word about cancelling |
| Trial | Any free trial | Says so before it starts charging. After that it is treated as a subscription |
| Expires | A passport, insurance paid by hand | Says the date early, again the day before, and after the date until it is marked done |

A kind comes from the built-in lists in `lists.ts` (well-known services; things that run out with their usual length and how early to speak). Otherwise the app asks once with a poll, "How do I treat X?", and the answer is the receipt. Insurance and a domain can be either, so those are asked unless the words say ("yearly", "expires"). The first answer settles it for the group.

### Questions (`kit.ask`)

| Question | Options | Closes | Confirm line |
|---|---|---|---|
| How do I treat X? | 2 to 4 of the kinds | On the first answer | Off; the app says what it will do |
| Which currency do I count plain amounts in? | The person's own first, then ₹ $ € £ AED | On the first answer, or `currency usd` | Off; "Counting in ₹." |
| X renews Friday, ₹649. Did you use it this month? | A lot / A little / Not at all | The day before the renewal, by the app | The kit's default when one person is in the group |
| Is X done, or did you mean okay? | Done / Just okay | When the person whose 👍 it was answers | Off; "Got it. From now on..." |
| Until 14 February 2028? | Yes / Another date / It's not renewed again | On the first answer | Off |

With several people in the group the usage poll stays where everyone can see it. The highest answer wins: one "A lot" means it was used. Nobody's silence counts; a poll nobody answered changes nothing.

### What a 👍 means

A 👍 on a notice about something that expires is not assumed to mean done. The first time a person does it the app asks once (Done / Just okay), says what it learnt, and takes that person's 👍 that way from then on. It is kept per person. A ✅ always means done, and so does the word `done`.

### Currency

Plain amounts are counted in what Zelfred knows the person counts in (`kit.person.currency`). When Zelfred doesn't know, the first message that names a currency settles it; otherwise the app asks once. What the person who added the app says is handed to Zelfred with `kit.learn`; a friend's answer is not. Totals keep currencies apart and nothing is converted.

## Schedules

| Id | When | What it sends |
|---|---|---|
| `notices` | 9am every day | Everything due that morning, one message per thing |
| `weekly` | The hour in `weeklyHour`, on the weekday in `weeklyDay` | "This week:" with what renews or runs out in the next 7 days. Nothing when there is nothing |

What `notices` sends, and how late each is still worth sending. Every notice is worked out from the dates, not from the slot, and ticked off on the record, so a morning that was missed is made up the next morning and nothing is said twice.

| Notice | Due | If its morning was missed |
|---|---|---|
| The usage question | 3 days before a renewal (7 before a yearly one) | Asked on a later morning, up to 2 days before. Not after that: the day-before message goes instead |
| A week's notice of a yearly renewal with no question | 7 days before | Sent on a later morning, up to 2 days before |
| A trial ending | 2 days before | Sent the day before instead |
| The day before a renewal | 1 day before | Sent on the day itself ("renews today"). After the day it is not sent: the money has gone, and the record moves to the next date |
| An early word about something that expires | By the formula below | Sent on any later morning up to 2 days before, with how near it really is |
| The day before it expires | 1 day before | Sent on the day itself |
| After it expired | The day after, then 8, 15, 22 and 29 days after | The latest one due is sent, once. Nothing after 5 weeks |
| The weekly message | Its evening | Sent the next morning with the `notices` slot. Not later than that |

A renewal or a date a day late still helps, so those are sent late. A usage question on the last day has no time left to act on, so it is dropped.

How early the first word about something that expires goes (the owner, 2026-11-23): 1.5 x the square root of the days between the day it was entered and the date, rounded to something a person would say, and never later than the time the thing takes (nine months for a passport). When that first notice is more than a month ahead, a second goes at a third of it. Entered ten days ahead it is 5 days; a year ahead, a month; ten years ahead, three months. When the time the thing takes has already gone on the day it is entered, the receipt says so.

## Settings

| Setting | Default | Meaning |
|---|---|---|
| `weeklyDay` | `0` | The weekday of the weekly message: 0 Sunday to 6 Saturday |
| `weeklyHour` | `19` | Its hour. `null` turns the weekly message off |

Both are changed on the page (`setWeekly`).

## Data

| Collection | Key | Data | Sort |
|---|---|---|---|
| `subs` | id | `{ name, amount, currency, every, dom, next, kind, via, account, from, by, added, ask, misses, answers, sent, first, middle, months, done? }` | next date |
| `thumbs` | sender id | `"done"` or `"okay"`: what that person's 👍 on a notice means | none |
| `state` | `taught` | `1` once the first receipt in words was sent | none |
| `state` | `currency` | what plain amounts are counted in, `"INR"` | none |
| `state` | `asked` | `1` once the currency question was asked | none |
| `state` | `weekly` | the day the weekly message was last due and handled | none |
| `state` | `shared` | `1` once someone other than the owner wrote in the group | none |
| `state` | `prompted` | `1` after the "I couldn't read that" answer, until something is understood | none |

`every` is weekly, monthly, quarterly, yearly or once. `kind` is use, keeps, trial, expires, or null while its question is open. `via` is upi, card, store or unknown. `account` is written like "HDFC xx4321". `from` is typed or forwarded. `by` is the sender's id, not a phone number. `answers` holds the open usage question's answers by sender id. `sent` holds the notices already sent, each with the date it was about. `first`, `middle` and `months` are only set for things that expire.

Refs: `{ kind: "sub", id }` on a receipt and on the person's own message (through `kit.mark`), `{ kind: "notice", id }` on every scheduled notice, `{ kind: "use", id, next }`, `{ kind: "kind", id, kinds }`, `{ kind: "thumb", id, who }`, `{ kind: "next", id, day? }`, `{ kind: "currency", codes }` on the questions, and `{ kind: "bank", amount, currency, day, via, account }` on the question about a bank message with no name.

## Web page

`lockable`. `load` returns `{ subscriptions, expires, perMonth, perYear, currency, weeklyDay, weeklyHour, thumb }`. Each row is `{ id, name, amount, every, next, kind, via, account, ask, misses, done }`, with `amount` already written ("₹649") or null. `perMonth` and `perYear` count only subscriptions with an amount, each currency on its own. `thumb` is what the signed-in owner's 👍 means, or null.

| Action | Arguments | Does |
|---|---|---|
| `remove` | `{ id }` | Takes one off the list. The page asks first |
| `setAsk` | `{ id, ask }` | Turns the usage question on or off for one |
| `setWeekly` | `{ day, hour }` | The weekly message's weekday (0 to 6) and hour (0 to 23, or `null` for off) |
| `setThumb` | `{ means }` | `"done"` or `"okay"`: what the owner's 👍 on a notice means |

The page itself is not built yet in the Zelfred repo. It needs two sections, "What you pay for" and "Expires", and Settings for the weekly message and the 👍.

## Privacy

Permission: `members`, so the people the person adds to the group can add, forward and answer. Everyone in the group sees everything the app posts there.

Reads only the messages in its own group, its own stored data, the person's time zone and the currency Zelfred knows they count in. It never reaches a bank, a mailbox or a statement.

From a forwarded bank message it keeps the name, the amount, the date and the last four digits of the account. The balance, the reference number and everything else in the message is not stored. No document number is kept for a passport or a policy, and no photos are taken.

It tells Zelfred one thing about the person who added it: the currency they count in, the first time they say it.

A message the app can't read goes to Zelfred's intent model to be classified, and is not stored there. The app states dates the person gave it. It never states a rule, a fine or a grace period.

## Not built

Mail (step 2) and statements (step 3) of the brief. The shared list of kinds learnt from many people. Photos of papers. The web page's React side.

These choices are the plugin author's and were not confirmed by the owner: the group's icon 🔁; 9am for the daily notices; a guessed next date when none is given; a forwarded debit taken as monthly; one poll that asks the kind and whether it runs out together; no usage question for a weekly subscription; a trial becoming "use it or lose it" when it ends unless the list says otherwise; `remove` in the chat acting at once with a 👍; a ✅ always meaning done; staying quiet about unreadable messages in a group with friends after saying it once; the limits (200 things, 60 characters for a name).
