# Implementation Plan: Store in JSON & Deferred Processing Architecture

Store 100% of intercepted TikTok Studio metrics (60-day `dailyBreakdown`, `activePrograms`, `insightsHistory`) directly as JSON in a dedicated `AccountAnalytics` table. This keeps ingestion ultra-fast (< 10ms), avoids database row bloat, and allows processing/aggregating the JSON on-demand or in the background.

## Architecture Highlights

> [!IMPORTANT]
> **Store in JSON First, Process Later:**
> 1. **Ingestion Speed (< 10ms):**
>    - The Client Agent sends `dailyBreakdown`, `activePrograms`, `insightsHistory`, and period totals (`revenue7d`, `revenue28d`, `revenue60d`, `revenue365d`).
>    - The server performs a **single `upsert`** into `AccountAnalytics`.
>    - **Zero individual rows inserted into `DailyRevenue` during ingestion!** No table locks, no connection pool strain.
> 2. **Direct JSON Consumption by Dashboard:**
>    - Frontend charts (7d, 28d, 60d, 365d curves) read the `dailyBreakdown` JSON directly in 1 query.
>    - Instant loading time without querying or joining thousands of table rows.
> 3. **Deferred / On-Demand Processing:**
>    - If and when structured rows are needed for relational reporting or accounting, a helper function (`processAnalyticsJson(accountId)`) parses the stored JSON and syncs only the relevant non-zero records.

---

## Proposed Changes

### Database Layer (`prisma/schema.prisma`)

#### [MODIFY] [schema.prisma](file:///c:/Users/datng/tiktok-automation/prisma/schema.prisma)
- Add `AccountAnalytics` model:
  ```prisma
  model AccountAnalytics {
    id              String        @id @default(cuid())
    accountId       String        @unique
    account         TiktokAccount @relation(fields: [accountId], references: [id], onDelete: Cascade)
    currency        String        @default("USD")
    
    // Period Totals (for quick filtering & dashboard badges)
    revenue7d       Decimal       @default(0.0) @db.Decimal(12, 2)
    revenue28d      Decimal       @default(0.0) @db.Decimal(12, 2)
    revenue60d      Decimal       @default(0.0) @db.Decimal(12, 2)
    revenue365d     Decimal?      @db.Decimal(12, 2)
    totalRevenue    Decimal       @default(0.0) @db.Decimal(12, 2)

    views7d         BigInt?       @default(0)
    views28d        BigInt?       @default(0)
    likes28d        Int?          @default(0)
    comments28d     Int?          @default(0)
    shares28d       Int?          @default(0)

    // Raw JSON Stores (No relational bloat)
    dailyBreakdown  Json?         // Array of { date: string, revenue: number, views?: number }
    activePrograms  Json?         // Array of { name, programId, revenue, revenue7d, revenue28d, revenue60d }
    insightsHistory Json?         // { vv_history, pv_history, like_history, etc. }
    rawSnapshot     Json?

    processedAt     DateTime?     // Timestamp when JSON was processed to relational tables (if applicable)
    updatedAt       DateTime      @updatedAt
    createdAt       DateTime      @default(now())

    @@index([accountId])
    @@map("account_analytics")
  }
  ```
- Add relation `analytics AccountAnalytics?` to `TiktokAccount`.
- Run `npx prisma db push` to synchronize PostgreSQL.

---

### Client Agent (`client-agent/agent.js`)

#### [MODIFY] [agent.js](file:///c:/Users/datng/tiktok-automation/client-agent/agent.js)
- Update `snapshotProfileToTemp` to use `path.dirname(profileDir)/.gpm_temp` (Drive D:), eliminating C: drive out-of-space issues.
- In `extractProfileStudio`:
  - Intercept `/reward_analytics` -> captures `currency`, `revenue7d`, `revenue28d`, `revenue60d`, `daily_estimated_income` (60 days), and `m10n_program_user_income`.
  - Intercept `/all_programs` -> captures active monetization programs list.
  - Intercept Home tab `/insights` (`insight_type: 126`) -> captures `revenue365d`.
  - Package clean `dailyBreakdown: [{ date, revenue }]` and `activePrograms: [...]`.
  - Return all structured data for payload.
- In `performFullSweep`:
  - Forward the data in the report payload to `/api/extension/report`.

---

### Backend API (`src/app/api/extension/report/route.ts`)

#### [MODIFY] [route.ts](file:///c:/Users/datng/tiktok-automation/src/app/api/extension/report/route.ts)
- Extend payload interface to receive `dailyBreakdown`, `activePrograms`, `insightsHistory`, `revenue7d`, `revenue28d`, `revenue60d`, `revenue365d`.
- In POST handler:
  - Upsert single record in `AccountAnalytics`:
    - Save `dailyBreakdown`, `activePrograms`, `insightsHistory` as JSON.
    - Save period totals (`revenue7d`, `revenue28d`, `revenue60d`, `revenue365d`, `totalRevenue`).
  - Update `TiktokAccount.totalRevenue` with latest effective total.
  - Keep `SystemConfig` legacy sync for backwards compatibility.
- In GET handler:
  - Return the `AccountAnalytics` record directly.

---

### Client Agent Distribution

#### [MODIFY] [client-agent-base.zip](file:///c:/Users/datng/tiktok-automation/client-agent-base.zip)
- Re-run `powershell -ExecutionPolicy Bypass -File scripts/pack-client-agent-base.ps1`.

---

## Verification Plan

### Automated & Compilation Tests
- Run `npx prisma db push` to verify database schema update.
- Run `npx tsc --noEmit` to verify type safety across the Next.js project.

### Live End-to-End Verification
- Run a test sweep with the updated agent against a live GPM profile.
- Verify that `AccountAnalytics` contains the 60-day JSON array and period totals, executing in < 10ms with zero row spam.
