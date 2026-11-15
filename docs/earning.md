# Earning from plugins

> **Planned, not live.** Every plugin is free today and `price` must be `0`. This page records the direction so plugins are built ready for it. Nothing here is a commitment until it's marked as live; terms will be published before any money moves.

## The goal

Developers publish plugins on whatodo and earn when people pay for them. whatodo handles WhatsApp, the account, storage, the website, payments and payouts; the developer handles what the plugin does.

## What's decided

- **Prices live in the definition.** `price` is in the smallest currency unit (paise for INR). Today it must be 0.
- **No paid feature without a release.** Turning on a price, or changing it, is a plugin release with a CHANGELOG entry, reviewed like any other.
- **Strict quality first.** The review bar ([review-checklist.md](review-checklist.md)), versioning and data-compatibility rules ([releasing.md](releasing.md)) exist now so paid plugins can be trusted later.
- **Data stays put.** Paid or free, a plugin sees only its own group ([data-and-privacy.md](data-and-privacy.md)).

## Not decided yet

These will be settled and published before the first paid plugin:

- One-time vs subscription pricing, trials, and how they appear in the definition (`price` will likely grow a billing period and currency).
- Payment provider and supported regions (India first).
- Revenue share between developers and whatodo, payout schedule, tax handling and invoicing.
- What happens to a paid install when payment stops (likely: the plugin pauses, data is kept).
- Refunds and the developer's support obligations.
- How outside developers sign up, agree to terms, and publish (in this repo under review first; hosted plugins later).

## Build ready for it

- Keep the free/paid line in mind when designing: a plugin should be useful and honest at its price, with no surprise prompts.
- Keep the README's description of what the plugin does exact: it will be what people pay for.
- Keep data compatible across versions: paying users will not accept losing streaks to a release.
