# Changelog: ShipmentTracker

All notable changes to this plugin. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-11-24

### Added
- Send a FedEx or UPS tracking link or number and it is watched. The first status is said in words.
- The carrier is asked every hour. A message comes only when the status, the place or the expected day changes.
- `updates` says where every parcel is now.
- A name for a parcel: written after the link or number, with `name 2 new shoes`, or as a reply.
- `remove 2`, or `remove` as a reply, stops watching one.
- Delivered is said, and the looking stops. So does it after 30 days with nothing new.
- A parcel that can't be tracked is said to be so, and is not kept.

### Data
- Collections `parcels` and `state`. Refs of the shape `{ p: id }`. Needs the `"parcels"` permission (SDK 1.31.0).
