# Comprehensive Implementation Plan: Sync Controls, Video Rewards & Account Ban Lifecycle

This plan implements the full suite of enhancements requested:
1. **Role-Based Global Sync**: Admin broadcast to all staff Client-Agents; Staff sync only runs on their machine.
2. **Stop / Cancel Sync**: Web UI button to immediately stop active sync jobs; Client-Agent aborts sweeps cleanly.
3. **Single-Profile Targeted Sync**: Clicking sync on a specific account only sweeps that 1 GPM profile.
4. **Creator Rewards Program Ban Detection**:
   - Check TikTok Studio Monetization page for Creator Rewards Program tab.
   - If absent: auto-update status to `BANNED`, record `bannedReason: "Bị ngừng chương trình TikTok Beta (Creator Rewards Program)"` and store extra info in `metadata`.
   - On hover over `BANNED` status (table, cards, account detail): show tooltip `"Bị ngừng chương trình TikTok Beta"`.
   - Account detail page: display `bannedReason` and structured `metadata` viewer.
5. **"Phần thưởng mỗi bài đăng" (Video Rewards Extraction & Display)**:
   - Extract title, cover thumbnail, post date, program name, estimated reward ($/£/€/₫), and views from TikTok Studio Monetization.
   - Store in `AccountAnalytics.postRewards`.
   - Update `accounts/[id]` with a dedicated **Phần Thưởng Bài Đăng** tab and overview widget showing video cards matching TikTok Studio's design.
6. **Checklist Exclusion for Banned / Restricted Accounts**:
   - If an account becomes `BANNED` or `RESTRICTED` within that day, exclude it from today's checklist scoring (staff is not penalized).
   - Subsequent dates: exclude restricted/banned accounts from new checklists.

---

## User Review Required

> [!IMPORTANT]
> - `AccountAnalytics.postRewards`, `TiktokAccount.bannedReason`, and `TiktokAccount.metadata` have been added to [prisma/schema.prisma](file:///c:/Users/datng/tiktok-automation/prisma/schema.prisma) and Prisma Client generated.
> - When applying to the database, you can run `npx prisma db push` whenever you are ready.

---

## Proposed Changes

### Component 1: Sync Controls & Queue

#### [MODIFY] [route.ts](file:///c:/Users/datng/tiktok-automation/src/app/api/gpm/sync/route.ts)
- Add `{ action: "stop" }` to cancel `PENDING` / `PROCESSING` jobs in `SyncQueue`.
- Admin broadcast: enqueue for all active staff Client-Agents; Staff: scope only to current user.
- Include `"CANCELLED"` status in job completion tracking.

#### [MODIFY] [accounts.ts](file:///c:/Users/datng/tiktok-automation/src/trpc/routers/accounts.ts)
- In `syncAccount`: encode target profile and handle in `targetScope` (`USER:${userId}|PROFILE:${profileId}|HANDLE:${handle}`).
- Include `analytics: true`, `bannedReason`, and `metadata` in `getById`.

#### [MODIFY] [route.ts](file:///c:/Users/datng/tiktok-automation/src/app/api/gpm/client-sync/route.ts)
- Parse `targetProfileId` and `targetHandle` from `targetScope` and return in `syncJob` for Client-Agent.

#### [MODIFY] [Header.tsx](file:///c:/Users/datng/tiktok-automation/src/components/layout/Header.tsx)
- When `syncing` is true, render a Stop button (`Square` icon) with tooltip `"Dừng đồng bộ"`.
- Clicking Stop sends `POST /api/gpm/sync` with `{ action: "stop" }`.

---

### Component 2: Client-Agent (`client-agent/agent.js`)

#### [MODIFY] [agent.js](file:///c:/Users/datng/tiktok-automation/client-agent/agent.js)
1. **Targeted Profile Filtering**: If `targetProfileId` or `targetHandle` is present in `syncJob`, filter to only that profile.
2. **Cancellation Check**: Before scanning each profile and during sweep, check if job was cancelled; break immediately.
3. **"Phần thưởng mỗi bài đăng" Extraction**:
   - In `extractProfileStudio`: on `/tiktokstudio/monetization`, extract DOM cards under "Phần thưởng mỗi bài đăng" (cover, title, postDate, reward amount, views, duration).
   - Check if Creator Rewards Program tab exists:
     - If missing and account is active/monetized: set `creatorRewardsMissing = true` and `bannedReason = "Bị ngừng chương trình TikTok Beta (Creator Rewards Program)"`.
   - Send `postRewards`, `creatorRewardsMissing`, and `bannedReason` in payload to `/api/extension/report`.

---

### Component 3: Server Report & Database Updates

#### [MODIFY] [route.ts](file:///c:/Users/datng/tiktok-automation/src/app/api/extension/report/route.ts)
- Accept `postRewards`, `creatorRewardsMissing`, `bannedReason`, `metadata`.
- Save `postRewards` in `AccountAnalytics.postRewards`.
- If `creatorRewardsMissing`: update `status = "BANNED"`, set `bannedReason`, update `metadata`, log audit event, and trigger checklist score recalculation for today.

---

### Component 4: Checklist Exclusion for Banned / Restricted Accounts

#### [MODIFY] [checklist.ts](file:///c:/Users/datng/tiktok-automation/src/trpc/routers/checklist.ts)
- In `getToday`: ensure only accounts with `status: { in: ["ACTIVE", "WARMING"] }` are included.
- In `calculateWorkdayScore` and item counts:
  - Filter `eligibleItems = allItems.filter(i => i.account?.status !== "BANNED" && i.account?.status !== "RESTRICTED")`.
  - Calculate `totalAssigned` and `completionRate` strictly on eligible items.
- If an account becomes `BANNED` or `RESTRICTED` mid-day, auto-recalculate the day's checklist score so the staff member is not penalized.

---

### Component 5: Web UI (Status Tooltips, Metadata & Video Rewards)

#### [MODIFY] [page.tsx](file:///c:/Users/datng/tiktok-automation/src/app/(protected)/accounts/page.tsx)
- Wrap status badge in table and card view with `<Tooltip>`:
  - When `acc.status === "BANNED"`: show tooltip `"Bị ngừng chương trình TikTok Beta"` (or `acc.bannedReason`).
- Add display of `bannedReason` / metadata indicator.

#### [MODIFY] [page.tsx](file:///c:/Users/datng/tiktok-automation/src/app/(protected)/accounts/[id]/page.tsx)
- Wrap status badge with tooltip: `"Bị ngừng chương trình TikTok Beta"` when status is `BANNED`.
- Show **Banned Reason banner / alert** when account is `BANNED`.
- Add **Metadata Details** card in Overview tab.
- Add a new tab **"Phần Thưởng Bài Đăng" (Video Rewards)** displaying the extracted video cards (cover image with duration overlay, title, post date, program tag, estimated reward, and view count).

---

## Verification Plan

### Automated Tests
- `node -c client-agent/agent.js` (Verify agent syntax)
- `npx prisma generate` (Verify Prisma client types)

### Manual Verification Flow
1. **Single Account Sync**: Click "Đồng bộ" on 1 account $\to$ Client-Agent only opens that 1 profile.
2. **Stop Sync**: Click "Dừng đồng bộ" during sweep $\to$ Client-Agent stops immediately.
3. **Video Rewards Display**: Open account detail page $\to$ View "Phần Thưởng Bài Đăng" tab $\to$ Confirm cover image, reward amount, views, and post date.
4. **Status Tooltip & Ban**: Hover over `BANNED` status $\to$ Verify tooltip `"Bị ngừng chương trình TikTok Beta"`.
5. **Checklist Exclusion**: If an account is Banned/Restricted $\to$ Verify today's checklist totalAssigned excludes that account and staff score is preserved.
