# HamsterleyMTB Security Specification (Phase 0)

## 1. Data Invariants
1. **Verified Identity Ownership**: Every user-authored record (`hazardReports`, `difficultyVotes`, `rides`, `users`, `votes`) must bind `authorId` / `userId` / `voterId` strictly to `request.auth.uid` with `request.auth.token.email_verified == true`.
2. **Geographic Containment**: Hazard coordinates (`lat`, `lng`) must fall within the Hamsterley Forest bounding box (`54.60 <= lat <= 54.75`, `-1.98 <= lng <= -1.75`).
3. **Temporal & Immutability Integrity**: All `createdAt` and `updatedAt` fields must equal `request.time`. Author identity, `trailId`, and `createdAt` are immutable after creation.
4. **Atomic Vote Synchronization**: Confirming or resolving a `hazardReport` requires an atomic batch write creating `/hazardReports/{reportId}/votes/{request.auth.uid}` verified via `existsAfter` / `getAfter`.
5. **Terminal State Lock**: Once a `hazardReport` transitions to `status == 'resolved'`, no further updates are permitted.
6. **Zero PII Exposure**: Rider emails, phone numbers, and private `rides` are never exposed on public feeds or `list` queries (`rides` and `users` enforce `resource.data.userId == request.auth.uid` / owner-only `get`).

## 2. Dirty Dozen Attack Payloads (All Must Yield `PERMISSION_DENIED`)
1. **Identity Spoof on Hazard Create**: `{ authorId: "other_uid", ... }` -> Denied (`authorId != request.auth.uid`).
2. **Shadow Field Injection**: `{ ..., isAdmin: true }` -> Denied (`keys().hasOnly(...)`).
3. **Unverified Email Write**: Auth token with `email_verified: false` -> Denied (`isVerifiedSignedIn()`).
4. **Out-of-Bounds Coordinates**: `{ lat: 12.0, lng: 80.0 }` -> Denied (`lat`/`lng` bounds check).
5. **Client-Forged Timestamp**: `{ createdAt: Timestamp.fromMillis(0) }` -> Denied (`createdAt != request.time`).
6. **Counter Inflation Without Vote Doc**: Update `confirmationsCount` by +1 without atomic `/votes/{uid}` write -> Denied (`getAfter` check fails).
7. **Jump Counter by +100**: Update `confirmationsCount: existing + 100` -> Denied (`incoming().confirmationsCount == existing().confirmationsCount + 1`).
8. **Mutate Resolved Hazard**: Update `title` or `status` when `existing().status == 'resolved'` -> Denied (Terminal State Lock).
9. **1MB String Exhaustion**: `description` of 5,000 chars or invalid long `reportId` -> Denied (`.size() <= 400` and `isValidId`).
10. **Cross-User Ride Scraping**: `list` on `/rides` without `where('userId', '==', uid)` -> Denied (`allow list: if resource.data.userId == request.auth.uid`).
11. **User Enumeration**: `list` on `/users` -> Denied (`allow list: if false`).
12. **Mutate Author/TrailId on Update**: Change `trailId` or `authorId` in update -> Denied (`affectedKeys().hasOnly(...)` + immutability checks).
