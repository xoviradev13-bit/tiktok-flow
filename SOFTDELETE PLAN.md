# Implementation Plan (v2): Production-Grade Soft Delete & Audit Architecture for TikTok Accounts

**Status:** Implementation-ready. Supersedes the prior draft. All prior review points resolved
(race conditions, Zod defaults, bulk restore per-target updates, audit-trail durability, raw-client
escape hatches, targetScope substring bug, post-commit reconciliation safety, typed stats shapes)
**plus** the second-pass fixes listed in §12: reconciliation timezone boundary, `list` bypassing the
soft-delete extension, `checkUsername` Trash-existence leak, concurrent-create race (`P2002`),
`SyncQueue` full-scan cost, migration strategy, batched deleter-name join, purge-snapshot race
comment, and STAFF-facing error message leak.

---

## 1. Prisma Client Architecture — Dual Client Pattern

Trash-specific operations (admin `getById`, `restore`, `hardDelete`, `create` auto-restore
detection) need to see soft-deleted rows. The extended client hides them by default. Two clients
are exported from `src/lib/db.ts`.

```typescript
// src/lib/db.ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prismaRaw?: PrismaClient };

// ─── 1. Base client (no extension) — sees ALL rows including Trash ───
export const prismaRaw =
  globalForPrisma.prismaRaw ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prismaRaw = prismaRaw;

// ─── 2. Extension helper ───
function shouldInjectSoftDeleteFilter(where: any): boolean {
  if (!where) return true;
  if (!("deletedAt" in where)) return true;
  if (where.deletedAt === undefined) return true;
  return false;
}

// ─── 3. Extended client — hides Trash by default ───
export const prisma = prismaRaw.$extends({
  name: "softDelete",
  query: {
    tiktokAccount: {
      async findMany({ args, query }) {
        if (shouldInjectSoftDeleteFilter(args.where)) {
          args.where = { ...args.where, deletedAt: null };
        }
        return query(args);
      },
      async findFirst({ args, query }) {
        if (shouldInjectSoftDeleteFilter(args.where)) {
          args.where = { ...args.where, deletedAt: null };
        }
        return query(args);
      },
      async count({ args, query }) {
        if (shouldInjectSoftDeleteFilter(args.where)) {
          args.where = { ...args.where, deletedAt: null };
        }
        return query(args);
      },
      async groupBy({ args, query }) {
        if (shouldInjectSoftDeleteFilter(args.where)) {
          args.where = { ...args.where, deletedAt: null };
        }
        return query(args);
      },
      async aggregate({ args, query }) {
        if (shouldInjectSoftDeleteFilter(args.where)) {
          args.where = { ...args.where, deletedAt: null };
        }
        return query(args);
      },
    },
  },
});
```

### 1.1 Rules of engagement

| Use case | Client | Filter rule |
|---|---|---|
| Normal fleet reads (incl. `accounts.list` fleet mode) | `prisma` | Auto-injected `deletedAt: null` |
| Normal fleet writes (`update`, `updateMany`) | `prisma` | Must add `deletedAt: null` manually to `where` |
| Trash reads (`viewTrash: true`) | `prismaRaw` | Explicit `deletedAt: { not: null }` |
| Admin `getById({ includeDeleted: true })` | `prismaRaw` | No filter (any state) |
| `restore`, `hardDelete`, `bulkRestore`, `bulkHardDelete` | `prismaRaw` | Explicit `deletedAt: { not: null }` |
| `create` trashed-username detection | `prismaRaw` | `findUnique({ where: { username } })` |
| `checkUsername` | `prismaRaw` | `findUnique` (existence only — see §5.11) |
| Checklist reconciliation | `prisma` (extended) | Explicit `deletedAt: null` for safety |
| Cross-cutting admin queries | `prismaRaw` + explicit filters | — |

> **Fix #2 applied:** `accounts.list`'s fleet-mode branch now reads through `ctx.prisma` (the
> extended client) instead of `ctx.prismaRaw`, so the one query every user hits most often actually
> benefits from the auto-injected filter rather than being a hand-maintained exception to it. The
> Trash branch still uses `ctx.prismaRaw` with an explicit `deletedAt: { not: null }`, which the
> extension's `shouldInjectSoftDeleteFilter` correctly detects and leaves alone. See §5.1.

### 1.2 Operations the extension does NOT intercept

`findUnique`, `update`, `updateMany`, `create`, `createMany`, `upsert`, `delete`, `deleteMany`.

Consequences:

- `findUnique` on `tiktokAccount` returns rows in any state. Never use it for active-fleet paths.
  Use `findFirst` (auto-injected) instead.
- `updateMany` / `deleteMany` operate on any state. Every router must add `deletedAt: null`
  explicitly.
- No `upsert` on `tiktokAccount`. If added later, it must guard `deletedAt`.

### 1.3 `ctx.prisma` in the tRPC context

```typescript
// src/trpc/init.ts
import { prisma, prismaRaw } from "@/lib/db";

export const createContext = async (opts) => ({
  prisma,           // extended — default for fleet reads
  prismaRaw,        // raw — Trash reads/writes, audit-critical lookups
  session: ...,
});
```

---

## 2. Database Schema

```prisma
// ─────────────────────────────────────────────────────────
// SystemAuditLog — independent of TiktokAccount and User.
// NO relations on purpose: actorId and targetId are
// denormalized so audit rows survive hard deletes of
// either the account or the actor.
// ─────────────────────────────────────────────────────────
model SystemAuditLog {
  id         String   @id @default(cuid())
  actorId    String?  @map("actor_id")
  actorName  String   @map("actor_name")
  action     String   // ACCOUNT_SOFT_DELETE | ACCOUNT_BULK_SOFT_DELETE
                      // | ACCOUNT_HARD_DELETE | ACCOUNT_BULK_HARD_DELETE
                      // | ACCOUNT_RESTORE | ACCOUNT_BULK_RESTORE
  targetType String   @map("target_type") // "TiktokAccount"
  targetId   String   @map("target_id")
  username   String?  // Denormalized; survives account hard delete
  metadata   Json?
  createdAt  DateTime @default(now()) @map("created_at")

  @@index([targetId])
  @@index([targetId, createdAt(sort: Desc)])
  @@index([action, createdAt])
  @@map("system_audit_logs")
}
```

### TiktokAccount additions

```prisma
model TiktokAccount {
  // ... existing fields
  deletedAt   DateTime? @map("deleted_at")
  deletedById String?   @map("deleted_by_id")
  deletedBy   User?     @relation("AccountDeletedBy", fields: [deletedById], references: [id], onDelete: SetNull)

  @@index([deletedAt])
  @@index([deletedAt, assignedUserId])
  @@index([deletedAt, status])
  @@index([deletedAt, isOnline, lastSyncedAt])
  @@index([deletedAt, country])
}
```

### User addition

```prisma
model User {
  // ... existing fields
  deletedAccounts TiktokAccount[] @relation("AccountDeletedBy")
}
```

Confirmed existing fields (do not re-add): `User.isActive`, `User.deletedAt`.

### SyncQueue addition (Fix #5)

```prisma
model SyncQueue {
  // ... existing fields
  @@index([status])
}
```

> **Fix #5 applied:** `cancelInFlightSyncJobs` (§4.1) pulls every `PENDING`/`PROCESSING` row
> system-wide on each delete/bulk-delete and filters in JS to avoid the substring bug. That scan
> needs an index on `status` to stay cheap as the queue grows; without it, every delete transaction
> pays a full-table scan. Revisit with a bounded/paginated scan or a `targetScope`-keyed lookup if
> `SyncQueue` volume grows past a few thousand in-flight rows (see §12 for the accepted-risk note).

### 2.1 Cascade matrix (schema `onDelete`)

| Model | `onDelete` |
|---|---|
| `AccountLog` | `Cascade` |
| `AccountAlert` | `Cascade` |
| `AccountAnalytics` | `Cascade` |
| `DailyRevenue` | `Cascade` |
| `DailyChecklistItem` | `Cascade` |
| `SyncQueue` | No FK (scope string) |

Blocking policy is enforced in the router, not the schema. Cascade is the mechanism; the router
decides when to allow it.

---

## 3. Shared Types (`src/lib/audit-types.ts`)

```typescript
export interface AccountPurgeSnapshot {
  username: string;
  country: string | null;
  status: string;
  assignedUserId: string | null;
  totalRevenue: number;
  totalVideos: number;
  totalFollowers: number;
  lastSyncedAt: string | null;
  dailyRevenueCount: number;
  checklistItemCount: number;
  hasMeaningfulAnalytics: boolean;
}

export interface AccountRestoreDiff {
  restoredFromTrash: true;
  actorRole: string;
  previousState: {
    status: string;
    country: string | null;
    groupName: string | null;
    assignedUserId: string | null;
    gpmProfileId: string | null;
    deletedAt: string | null;
  };
  newState: Record<string, unknown>;
}

export type AccountAuditAction =
  | "ACCOUNT_SOFT_DELETE"
  | "ACCOUNT_BULK_SOFT_DELETE"
  | "ACCOUNT_HARD_DELETE"
  | "ACCOUNT_BULK_HARD_DELETE"
  | "ACCOUNT_RESTORE"
  | "ACCOUNT_BULK_RESTORE";

// Typed union for `list` stats — the UI switches on `mode`
export type ListStats =
  | {
      mode: "fleet";
      total: number;
      active: number;
      restricted: number;
      banned: number;
      warming: number;
      online: number;
      totalRevenue: number;
      trashCount: number | null;
    }
  | {
      mode: "trash";
      trashCount: number;
    };
```

---

## 4. Shared Helpers

### 4.1 Target-scope matching (`src/lib/sync-scope.ts`)

Bug fix: substring matching on `targetScope` (e.g. `HANDLE:user`) matches `HANDLE:user2` and
`HANDLE:username`. Cancel jobs by parsing the scope, not by substring.

The scope format is:

```
USER:<userId>|PROFILE:<profileId>|HANDLE:<username>
```

```typescript
// src/lib/sync-scope.ts

export interface ParsedScope {
  USER?: string;
  PROFILE?: string;
  HANDLE?: string;
}

export function parseScope(scope: string | null | undefined): ParsedScope {
  if (!scope) return {};
  const out: ParsedScope = {};
  for (const segment of scope.split("|")) {
    const idx = segment.indexOf(":");
    if (idx === -1) continue;
    const key = segment.slice(0, idx);
    const value = segment.slice(idx + 1);
    if (key === "USER" || key === "PROFILE" || key === "HANDLE") {
      out[key] = value;
    }
  }
  return out;
}

export function scopeMatchesAccount(
  scope: string | null | undefined,
  account: { username?: string | null; gpmProfileId?: string | null }
): boolean {
  const parsed = parseScope(scope);
  if (account.gpmProfileId && parsed.PROFILE === account.gpmProfileId) return true;
  if (account.username && parsed.HANDLE === account.username) return true;
  return false;
}

/**
 * Cancels in-flight SyncQueue jobs for the given accounts.
 * Uses JS-side filtering to avoid substring-matching bugs.
 * Must be called inside a transaction (`tx`).
 *
 * COST NOTE (Fix #5): this pulls every PENDING/PROCESSING row system-wide.
 * Requires @@index([status]) on SyncQueue (see §2). Acceptable at current
 * volume; revisit with a scoped lookup if the in-flight queue grows large.
 */
export async function cancelInFlightSyncJobs(
  tx: Prisma.TransactionClient,
  accounts: Array<{ username?: string | null; gpmProfileId?: string | null }>
): Promise<void> {
  if (accounts.length === 0) return;

  const inFlight = await tx.syncQueue.findMany({
    where: { status: { in: ["PENDING", "PROCESSING"] } },
    select: { id: true, targetScope: true },
  });

  const toCancel = inFlight
    .filter(job => accounts.some(acc => scopeMatchesAccount(job.targetScope, acc)))
    .map(job => job.id);

  if (toCancel.length === 0) return;

  await tx.syncQueue.updateMany({
    where: { id: { in: toCancel } },
    data: {
      status: "CANCELLED",
      completedAt: new Date(),
      errorMessage: "Account moved to Trash",
    },
  });
}
```

### 4.2 Reconciliation helper (`src/lib/checklist-reconcile.ts`)

Typed to accept either client. Uses a minimal interface so the extended client type does not break
the signature.

> **Fix #1 applied — timezone boundary.** The prior draft computed `todayOnly` via
> `Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())`, i.e. the *UTC* calendar day. The
> product is Vietnam-local (Asia/Ho_Chi_Minh, UTC+7) and every other date-facing surface in the app
> renders in that timezone. Using the UTC boundary here means `checklist.date` (stored as a
> Vietnam-local midnight elsewhere) and `todayOnly` disagree for the first 7 hours of every
> Vietnam day — and because a missing checklist just triggers a silent `return`, reconciliation
> would quietly no-op with no error during that window. Fixed below by deriving `todayOnly` from
> the Vietnam-local calendar date via a fixed +7h offset, matching however `DailyChecklist.date` is
> written elsewhere. **Before implementing, confirm the exact function/logic that stamps
> `DailyChecklist.date` on creation and mirror it exactly here — do not let this diverge.**

```typescript
import { Prisma } from "@prisma/client";
import { calculateWorkdayScore, getScoringConfig } from "@/lib/scoring-engine";

// Minimal structural type satisfied by both the extended and raw clients.
// Using a structural type avoids the extended-client / PrismaClient
// assignability problem.
export type ReconciliationClient = {
  dailyChecklist: {
    findFirst: (args: any) => Promise<any>;
    update: (args: any) => Promise<any>;
  };
  dailyChecklistItem: {
    createMany: (args: any) => Promise<any>;
    deleteMany: (args: any) => Promise<any>;
    findMany: (args: any) => Promise<any[]>;
  };
  tiktokAccount: {
    findMany: (args: any) => Promise<Array<{ id: string }>>;
  };
  $transaction: <T>(fn: (tx: ReconciliationClient) => Promise<T>) => Promise<T>;
};

// Vietnam is UTC+7 year-round (no DST). Mirror whatever logic stamps
// DailyChecklist.date on creation — do not let this drift independently.
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

function vnTodayAsUtcMidnight(now: Date): Date {
  const vnShifted = new Date(now.getTime() + VN_OFFSET_MS);
  return new Date(Date.UTC(
    vnShifted.getUTCFullYear(),
    vnShifted.getUTCMonth(),
    vnShifted.getUTCDate()
  ));
}

export async function reconcileTodayChecklistForUser(
  prismaClient: ReconciliationClient,
  targetUserId: string
): Promise<void> {
  const now = new Date();
  const todayOnly = vnTodayAsUtcMidnight(now);

  const checklist = await prismaClient.dailyChecklist.findFirst({
    where: { userId: targetUserId, date: todayOnly, isLocked: false },
    include: { items: true },
  });
  if (!checklist) return;

  // Explicit deletedAt filter makes this safe with either extended or raw client.
  const activeAccounts = await prismaClient.tiktokAccount.findMany({
    where: {
      assignedUserId: targetUserId,
      deletedAt: null,
      status: { in: ["ACTIVE", "WARMING", "RESTRICTED"] },
    },
    select: { id: true },
  });

  const existingIds = new Set<string>(checklist.items.map((i: any) => i.accountId));
  const toAdd = activeAccounts.filter(a => !existingIds.has(a.id));
  const activeIds = new Set(activeAccounts.map(a => a.id));
  const toRemove = checklist.items.filter(
    (i: any) => !activeIds.has(i.accountId) && !i.isCompleted && !i.isPosted
  );

  if (toAdd.length === 0 && toRemove.length === 0) return;

  await prismaClient.$transaction(async (tx) => {
    if (toAdd.length) {
      await tx.dailyChecklistItem.createMany({
        data: toAdd.map(a => ({ checklistId: checklist.id, accountId: a.id })),
        skipDuplicates: true,
      });
    }
    if (toRemove.length) {
      await tx.dailyChecklistItem.deleteMany({
        where: { id: { in: toRemove.map((i: any) => i.id) } },
      });
    }

    const remaining = await tx.dailyChecklistItem.findMany({
      where: { checklistId: checklist.id },
    });
    const totalAssigned = remaining.length;
    const completedCount = remaining.filter((i: any) => i.isCompleted || i.isPosted).length;
    const scoringConfig = await getScoringConfig(tx as any);
    const { completionRate, workdayScore } = calculateWorkdayScore(
      totalAssigned,
      completedCount,
      scoringConfig
    );

    await tx.dailyChecklist.update({
      where: { id: checklist.id },
      data: { totalAssigned, completedCount, completionRate, workdayScore },
    });
  });
}

/**
 * Post-commit reconciliation wrapper. Failures are logged, not thrown,
 * because the primary state change has already committed and the client
 * should not receive a false 500.
 */
export async function reconcileAfterCommit(
  prismaClient: ReconciliationClient,
  targetUserId: string,
  context: string
): Promise<void> {
  try {
    await reconcileTodayChecklistForUser(prismaClient, targetUserId);
  } catch (err) {
    console.error(`[${context}] checklist reconciliation failed for user ${targetUserId}:`, err);
    // Optionally: enqueue a retry job or write to SystemAuditLog.
  }
}
```

Boundary rules:

- Fires only when `date === today` (Vietnam-local, see fix above) and `isLocked === false`.
- Only touches incomplete, unposted items.
- Uses `targetUserId`, never `ctx.session.user.id`.

---

## 5. Backend — tRPC Router (`src/trpc/routers/accounts.ts`)

Header comment:

```typescript
// NOTE: `delete` / `bulkDelete` perform SOFT deletes (moved to Trash).
//       Use `hardDelete` / `bulkHardDelete` for permanent removal.
// RACE-SAFETY RULE: All mutating procedures verify state inside the
// transaction via updateMany/deleteMany + count check. Never trust a
// pre-transaction read alone.
// RECONCILIATION RULE: Post-commit reconciliation is wrapped in try/catch
// via `reconcileAfterCommit` — never let a checklist error 500 the caller.
```

### 5.1 `list`

> **Fix #2 applied.** The fleet-mode `findMany` now goes through `ctx.prisma` (extended client),
> so the soft-delete extension actually filters it rather than the router hand-rolling the same
> `deletedAt: null` the extension would add anyway. The Trash branch still explicitly uses
> `ctx.prismaRaw` with `deletedAt: { not: null }`, since the extension only auto-injects when
> `deletedAt` is *absent* from `where` — an explicit `{ not: null }` is left untouched, but using
> the raw client here keeps the intent obvious to future readers.

```typescript
list: protectedProcedure
  .input(z.object({
    search: z.string().optional(),
    status: z.enum(["ALL", "ACTIVE", "WARMING", "RESTRICTED", "BANNED", "STOPPED", "CUSTOM"]).optional(),
    onlineStatus: z.enum(["ALL", "ONLINE", "OFFLINE"]).optional(),
    country: z.string().optional(),
    assignedUserId: z.string().optional(),
    viewTrash: z.boolean().optional().default(false),
  }))
  .query(async ({ ctx, input }) => {
    const isAdmin = ctx.session.user.role === "ADMIN";
    const viewTrash = input.viewTrash && isAdmin;

    // Fleet mode uses the extended client so the soft-delete extension is the
    // one source of truth for "what counts as active" — not a hand-copied
    // filter that can drift from the extension's own logic.
    const client = viewTrash ? ctx.prismaRaw : ctx.prisma;

    const where: any = viewTrash
      ? { deletedAt: { not: null } }
      : {}; // extension auto-injects deletedAt: null

    // STAFF scoping
    if (ctx.session.user.role === "STAFF") {
      where.assignedUserId = ctx.session.user.id;
    } else if (!viewTrash && input.assignedUserId && input.assignedUserId !== "ALL") {
      where.assignedUserId = input.assignedUserId;
    }

    if (input.search) {
      const s = input.search.trim();
      where.OR = [
        { username: { contains: s, mode: "insensitive" } },
        { groupName: { contains: s, mode: "insensitive" } },
      ];
    }

    // In Trash mode: only search + country are honored.
    if (input.country && input.country !== "ALL") {
      where.country = input.country;
    }

    if (!viewTrash) {
      if (input.status && input.status !== "ALL") where.status = input.status;
      // ...online status filter
    }

    const [items, trashCount] = await Promise.all([
      client.tiktokAccount.findMany({
        where,
        include: {
          assignedUser: {
            select: { id: true, username: true, name: true, fullName: true, firstName: true, lastName: true, role: true },
          },
          alerts: { where: { status: "OPEN" }, orderBy: { createdAt: "desc" } },
          analytics: { select: { postRewards: true, sumRevenue: true, sumViews: true, rawSnapshot: true } },
        },
        orderBy: { updatedAt: "desc" },
      }),
      isAdmin
        ? ctx.prismaRaw.tiktokAccount.count({ where: { deletedAt: { not: null } } })
        : Promise.resolve(null),
    ]);

    // ...normal fleet stats computed from `items` when !viewTrash

    // Fix #29 (optional enhancement, batched): in Trash mode, join the latest
    // SystemAuditLog entry per row so the UI shows the deleter's name even
    // when deletedBy was SetNull. MUST be a single batched query, never N+1,
    // since SystemAuditLog deliberately has no relation to TiktokAccount.
    let deleterByAccountId: Record<string, string> = {};
    if (viewTrash && items.length > 0) {
      const logs = await ctx.prismaRaw.systemAuditLog.findMany({
        where: {
          targetId: { in: items.map((i: any) => i.id) },
          action: "ACCOUNT_SOFT_DELETE",
        },
        orderBy: { createdAt: "desc" },
        select: { targetId: true, actorName: true, createdAt: true },
      });
      // Keep only the most recent per targetId (logs are already sorted desc).
      for (const log of logs) {
        if (!deleterByAccountId[log.targetId]) {
          deleterByAccountId[log.targetId] = log.actorName;
        }
      }
    }

    const stats: ListStats = viewTrash
      ? { mode: "trash", trashCount: trashCount ?? 0 }
      : {
          mode: "fleet",
          /* total, active, restricted, banned, warming, online, totalRevenue */,
          trashCount,
        };

    return {
      items: serializeBigInt(items).map((i: any) =>
        viewTrash ? { ...i, deletedByName: deleterByAccountId[i.id] ?? null } : i
      ),
      stats,
    };
  }),
```

`trashCount` shape: always present (number in Trash mode, `number | null` in fleet mode).
`null` for non-admins.

Typed stats: the UI must switch on `stats.mode` and never read fleet keys in Trash mode.

### 5.2 `getById`

```typescript
getById: protectedProcedure
  .input(z.object({
    id: z.string(),
    includeDeleted: z.boolean().optional().default(false),
  }))
  .query(async ({ ctx, input }) => {
    const isAdmin = ctx.session.user.role === "ADMIN";

    // Honest contract: only Admin may request deleted rows.
    if (input.includeDeleted && !isAdmin) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Only Admin can view trashed accounts." });
    }

    const account = await ctx.prismaRaw.tiktokAccount.findFirst({
      where: input.includeDeleted
        ? { id: input.id }
        : { id: input.id, deletedAt: null },
      include: {
        assignedUser: { select: { id: true, username: true, name: true, fullName: true, firstName: true, lastName: true, role: true } },
        alerts: { orderBy: { createdAt: "desc" } },
        logs: { orderBy: { createdAt: "desc" }, take: 50 },
        dailyRevenues: { orderBy: { date: "desc" }, take: 400 },
        analytics: true,
      },
    });

    if (!account) throw new TRPCError({ code: "NOT_FOUND" });

    if (ctx.session.user.role === "STAFF" && account.assignedUserId !== ctx.session.user.id) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }

    // ...compute punishedVideos30d, strikeLevel
    return serializeBigInt({ ...account, /* ... */ });
  }),
```

### 5.3 `update` (race-safe, STAFF-scoped)

> **Fix #9 applied.** The `NOT_FOUND` message no longer distinguishes "doesn't exist" from "is in
> Trash" for callers who shouldn't know Trash exists for accounts outside their scope. STAFF gets a
> generic `"Account not found"`; the distinction is preserved for Admin-only surfaces where it's
> already meaningful (e.g. `checkUsername`'s explicit `inTrash` flag, which is a deliberate,
> narrowly-scoped UX feature rather than an incidental leak — see §5.11).

```typescript
update: protectedProcedure
  .input(z.object({
    id: z.string(),
    country: z.string().optional(),
    gpmProfileId: z.string().optional().nullable(),
    gpmPort: z.number().optional().nullable(),
    groupName: z.string().optional().nullable(),
    status: z.enum(["ACTIVE", "WARMING", "RESTRICTED", "BANNED", "STOPPED", "CUSTOM"]).optional(),
    assignedUserId: z.string().optional().nullable(),
    isAssignmentLocked: z.boolean().optional(),
  }))
  .mutation(async ({ ctx, input }) => {
    const current = await ctx.prisma.tiktokAccount.findFirst({
      where: { id: input.id }, // extension auto-adds deletedAt: null
    });
    if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Account not found" });

    if (ctx.session.user.role === "STAFF" && current.assignedUserId !== ctx.session.user.id) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }

    const isStaff = ctx.session.user.role === "STAFF";

    // ...all STAFF guards (status, country, group, reassign lock)

    const res = await ctx.prisma.tiktokAccount.updateMany({
      where: { id: input.id, deletedAt: null },  // race guard
      data: {
        country: !isStaff ? input.country : undefined,
        gpmProfileId: !isStaff ? input.gpmProfileId : undefined,
        gpmPort: !isStaff && input.gpmPort !== undefined ? input.gpmPort : undefined,
        groupName: !isStaff ? input.groupName : undefined,
        status: !isStaff ? input.status : undefined,
        assignedUserId: !isStaff ? input.assignedUserId : undefined,
        isAssignmentLocked: !isStaff && input.isAssignmentLocked !== undefined ? input.isAssignmentLocked : undefined,
      },
    });

    if (res.count === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Account not found" });

    // ...write AccountLog entries for HANDOVER / STATUS_CHANGE
    // ...return updated
  }),
```

### 5.4 `delete` (Admin, soft — race-safe)

```typescript
delete: adminProcedure
  .input(z.object({ id: z.string() }))
  .mutation(async ({ ctx, input }) => {
    const account = await ctx.prisma.tiktokAccount.findFirst({
      where: { id: input.id, deletedAt: null },
    });
    if (!account) throw new TRPCError({ code: "NOT_FOUND" });

    const actorName = ctx.session.user.name || ctx.session.user.email || "Admin";

    await ctx.prisma.$transaction(async (tx) => {
      const res = await tx.tiktokAccount.updateMany({
        where: { id: account.id, deletedAt: null },
        data: { deletedAt: new Date(), deletedById: ctx.session.user.id, isOnline: false },
      });
      if (res.count === 0) throw new TRPCError({ code: "CONFLICT", message: "Account state changed" });

      // JS-side scope matching — fixes substring bug
      await cancelInFlightSyncJobs(tx, [{
        username: account.username,
        gpmProfileId: account.gpmProfileId,
      }]);

      await tx.accountLog.create({
        data: {
          accountId: account.id,
          logType: "DELETED",
          newStatus: account.status,
          message: `[CHUYỂN VÀO THÙNG RÁC] Tài khoản @${account.username} đã được chuyển vào thùng rác bởi ${actorName}.`,
          actorName,
        },
      });

      await tx.systemAuditLog.create({
        data: {
          actorId: ctx.session.user.id,
          actorName,
          action: "ACCOUNT_SOFT_DELETE",
          targetType: "TiktokAccount",
          targetId: account.id,
          username: account.username,
          metadata: { status: account.status, assignedUserId: account.assignedUserId },
        },
      });
    });

    if (account.assignedUserId) {
      await reconcileAfterCommit(ctx.prisma, account.assignedUserId, "delete");
    }

    return { success: true };
  }),
```

### 5.5 `bulkDelete` (Admin, soft — race-safe)

```typescript
bulkDelete: adminProcedure
  .input(z.object({ ids: z.array(z.string()) }))
  .mutation(async ({ ctx, input }) => {
    const actorName = ctx.session.user.name || ctx.session.user.email || "Admin";

    const targets = await ctx.prisma.tiktokAccount.findMany({
      where: { id: { in: input.ids }, deletedAt: null },
      select: { id: true, username: true, status: true, gpmProfileId: true, assignedUserId: true },
    });
    if (targets.length === 0) return { count: 0 };

    const now = new Date();

    await ctx.prisma.$transaction(async (tx) => {
      const res = await tx.tiktokAccount.updateMany({
        where: { id: { in: targets.map(t => t.id) }, deletedAt: null },
        data: { deletedAt: now, deletedById: ctx.session.user.id, isOnline: false },
      });
      if (res.count !== targets.length) {
        throw new TRPCError({ code: "CONFLICT", message: "One or more accounts changed state. Retry." });
      }

      await cancelInFlightSyncJobs(tx, targets.map(t => ({
        username: t.username,
        gpmProfileId: t.gpmProfileId,
      })));

      await tx.accountLog.createMany({
        data: targets.map(t => ({
          accountId: t.id,
          logType: "DELETED",
          newStatus: t.status,
          message: `[CHUYỂN VÀO THÙNG RÁC] Tài khoản @${t.username} đã được chuyển vào thùng rác bởi ${actorName}.`,
          actorName,
        })),
      });

      await tx.systemAuditLog.createMany({
        data: targets.map(t => ({
          actorId: ctx.session.user.id,
          actorName,
          action: "ACCOUNT_BULK_SOFT_DELETE",
          targetType: "TiktokAccount",
          targetId: t.id,
          username: t.username,
          metadata: { status: t.status, assignedUserId: t.assignedUserId },
        })),
      });
    });

    const affectedUsers = Array.from(
      new Set(targets.map(t => t.assignedUserId).filter((u): u is string => !!u))
    );
    for (const userId of affectedUsers) {
      await reconcileAfterCommit(ctx.prisma, userId, "bulkDelete");
    }

    return { count: targets.length };
  }),
```

### 5.6 `restore` (Admin, race-safe, ghost-user fallback)

```typescript
restore: adminProcedure
  .input(z.object({
    id: z.string(),
    assignedUserId: z.string().nullable().optional(),
    resetAssignmentLock: z.boolean().optional().default(false),
  }))
  .mutation(async ({ ctx, input }) => {
    const account = await ctx.prismaRaw.tiktokAccount.findFirst({
      where: { id: input.id, deletedAt: { not: null } },
    });
    if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Not in Trash" });

    let resolvedAssignee = input.assignedUserId !== undefined
      ? input.assignedUserId
      : account.assignedUserId;

    if (resolvedAssignee) {
      const user = await ctx.prismaRaw.user.findFirst({
        where: { id: resolvedAssignee, isActive: true, deletedAt: null },
        select: { id: true },
      });
      if (!user) resolvedAssignee = null;
    }

    const actorName = ctx.session.user.name || ctx.session.user.email || "Admin";

    await ctx.prisma.$transaction(async (tx) => {
      const res = await tx.tiktokAccount.updateMany({
        where: { id: account.id, deletedAt: { not: null } },  // race guard
        data: {
          deletedAt: null,
          deletedById: null,
          assignedUserId: resolvedAssignee,
          isAssignmentLocked: input.resetAssignmentLock ? false : account.isAssignmentLocked,
        },
      });
      if (res.count === 0) throw new TRPCError({ code: "CONFLICT", message: "Account state changed" });

      await tx.accountLog.create({
        data: {
          accountId: account.id,
          logType: "RESTORED",
          newStatus: account.status,
          message: `[KHÔI PHỤC TÀI KHOẢN] Tài khoản @${account.username} đã được khôi phục từ thùng rác bởi ${actorName}.`,
          actorName,
        },
      });

      await tx.systemAuditLog.create({
        data: {
          actorId: ctx.session.user.id,
          actorName,
          action: "ACCOUNT_RESTORE",
          targetType: "TiktokAccount",
          targetId: account.id,
          username: account.username,
          metadata: {
            restoredFromTrash: true,
            actorRole: ctx.session.user.role,
            previousState: {
              status: account.status,
              country: account.country,
              groupName: account.groupName,
              assignedUserId: account.assignedUserId,
              gpmProfileId: account.gpmProfileId,
              deletedAt: account.deletedAt?.toISOString() ?? null,
            },
            newState: { assignedUserId: resolvedAssignee },
          } satisfies AccountRestoreDiff,
        },
      });
    });

    if (resolvedAssignee) {
      await reconcileAfterCommit(ctx.prisma, resolvedAssignee, "restore");
    }

    return { success: true };
  }),
```

### 5.7 `bulkRestore` (Admin, per-target ghost-user fallback)

Important: Bulk restore cannot use a single `updateMany` because each row may resolve to a
different `assignedUserId`. Use N updates inside one transaction, plus bulk `createMany` for logs.

```typescript
bulkRestore: adminProcedure
  .input(z.object({
    ids: z.array(z.string()),
    resetAssignmentLock: z.boolean().optional().default(false),
  }))
  .mutation(async ({ ctx, input }) => {
    const targets = await ctx.prismaRaw.tiktokAccount.findMany({
      where: { id: { in: input.ids }, deletedAt: { not: null } },
      select: { id: true, username: true, status: true, assignedUserId: true, isAssignmentLocked: true },
    });
    if (targets.length === 0) return { restoredCount: 0 };

    const candidateIds = Array.from(
      new Set(targets.map(t => t.assignedUserId).filter((u): u is string => !!u))
    );
    const validUsers = candidateIds.length
      ? await ctx.prismaRaw.user.findMany({
          where: { id: { in: candidateIds }, isActive: true, deletedAt: null },
          select: { id: true },
        })
      : [];
    const validSet = new Set(validUsers.map(u => u.id));

    const resolved = targets.map(t => ({
      ...t,
      resolvedAssignee:
        t.assignedUserId && validSet.has(t.assignedUserId) ? t.assignedUserId : null,
    }));

    const actorName = ctx.session.user.name || ctx.session.user.email || "Admin";

    await ctx.prisma.$transaction(async (tx) => {
      for (const t of resolved) {
        const res = await tx.tiktokAccount.updateMany({
          where: { id: t.id, deletedAt: { not: null } },
          data: {
            deletedAt: null,
            deletedById: null,
            assignedUserId: t.resolvedAssignee,
            isAssignmentLocked: input.resetAssignmentLock ? false : t.isAssignmentLocked,
          },
        });
        if (res.count === 0) {
          throw new TRPCError({ code: "CONFLICT", message: `Account ${t.id} state changed` });
        }
      }

      await tx.accountLog.createMany({
        data: resolved.map(t => ({
          accountId: t.id,
          logType: "RESTORED",
          newStatus: t.status,
          message: `[KHÔI PHỤC TÀI KHOẢN] Tài khoản @${t.username} đã được khôi phục từ thùng rác bởi ${actorName}.`,
          actorName,
        })),
      });

      await tx.systemAuditLog.createMany({
        data: resolved.map(t => ({
          actorId: ctx.session.user.id,
          actorName,
          action: "ACCOUNT_BULK_RESTORE",
          targetType: "TiktokAccount",
          targetId: t.id,
          username: t.username,
          metadata: {
            restoredFromTrash: true,
            actorRole: ctx.session.user.role,
            previousState: { assignedUserId: t.assignedUserId },
            newState: { assignedUserId: t.resolvedAssignee },
          },
        })),
      });
    });

    const affectedUsers = Array.from(
      new Set(resolved.map(t => t.resolvedAssignee).filter((u): u is string => !!u))
    );
    for (const userId of affectedUsers) {
      await reconcileAfterCommit(ctx.prisma, userId, "bulkRestore");
    }

    return { restoredCount: resolved.length };
  }),
```

### 5.8 `hardDelete` (Admin, atomic, race-safe)

> **Fix #accepted-risk applied.** `hasHistory` is computed from a read taken *before* the
> transaction opens. A `DailyRevenue`/checklist row inserted in the gap between that read and the
> `deleteMany` would be cascade-deleted without being reflected in the purge snapshot's counts. The
> window is milliseconds and the row would need to be created for this specific, already-trashed
> account in that instant — treated as accepted risk, not fixed, and called out explicitly rather
> than left as a silent gap. Revisit only if hard-delete-immediately-after-new-activity becomes a
> real workflow.

```typescript
hardDelete: adminProcedure
  .input(z.object({
    id: z.string(),
    forcePurgeHistoricalData: z.boolean().default(false),
  }))
  .mutation(async ({ ctx, input }) => {
    const account = await ctx.prismaRaw.tiktokAccount.findFirst({
      where: { id: input.id, deletedAt: { not: null } },
      include: {
        analytics: true,
        _count: { select: { dailyRevenues: true, checklistItems: true } },
      },
    });
    if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Not in Trash" });

    // ACCEPTED RISK: hasHistory is read pre-transaction; a row inserted in the
    // gap before deleteMany commits won't be reflected in the snapshot below.
    const hasHistory =
      account._count.dailyRevenues > 0 ||
      account._count.checklistItems > 0 ||
      (account.analytics && (
        Number((account.analytics as any)?.sumRevenue?.totalRevenue ?? 0) > 0 ||
        (Array.isArray((account.analytics as any)?.postRewards) &&
          (account.analytics as any).postRewards.length > 0)
      ));

    if (hasHistory && !input.forcePurgeHistoricalData) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Tài khoản có dữ liệu doanh thu/KPI lịch sử. Gửi forcePurgeHistoricalData: true để xóa vĩnh viễn.",
      });
    }

    const actorName = ctx.session.user.name || ctx.session.user.email || "Admin";
    const snapshot = {
      username: account.username,
      country: account.country,
      status: account.status,
      assignedUserId: account.assignedUserId,
      totalRevenue: resolveAllTimeRevenue(account as any),
      totalVideos: account.totalVideos ?? 0,
      totalFollowers: account.totalFollowers ?? 0,
      lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null,
      dailyRevenueCount: account._count.dailyRevenues,
      checklistItemCount: account._count.checklistItems,
      hasMeaningfulAnalytics: !!account.analytics,
    } satisfies AccountPurgeSnapshot;

    await ctx.prismaRaw.$transaction(async (tx) => {
      await tx.systemAuditLog.create({
        data: {
          actorId: ctx.session.user.id,
          actorName,
          action: "ACCOUNT_HARD_DELETE",
          targetType: "TiktokAccount",
          targetId: account.id,
          username: account.username,
          metadata: snapshot,
        },
      });
      const res = await tx.tiktokAccount.deleteMany({
        where: { id: account.id, deletedAt: { not: null } },
      });
      if (res.count === 0) throw new TRPCError({ code: "CONFLICT", message: "Account state changed" });
    });

    return { success: true };
  }),
```

### 5.9 `bulkHardDelete` (Admin, partial purge, race-safe)

```typescript
bulkHardDelete: adminProcedure
  .input(z.object({
    ids: z.array(z.string()),
    forcePurgeHistoricalData: z.boolean().default(false),
  }))
  .mutation(async ({ ctx, input }) => {
    const targets = await ctx.prismaRaw.tiktokAccount.findMany({
      where: { id: { in: input.ids }, deletedAt: { not: null } },
      include: {
        analytics: true,
        _count: { select: { dailyRevenues: true, checklistItems: true } },
      },
    });

    const purgeable: typeof targets = [];
    const blocked: Array<{ id: string; username: string }> = [];

    for (const t of targets) {
      const hasHistory =
        t._count.dailyRevenues > 0 ||
        t._count.checklistItems > 0 ||
        (t.analytics && (
          Number((t.analytics as any)?.sumRevenue?.totalRevenue ?? 0) > 0 ||
          (Array.isArray((t.analytics as any)?.postRewards) &&
            (t.analytics as any).postRewards.length > 0)
        ));

      if (hasHistory && !input.forcePurgeHistoricalData) {
        blocked.push({ id: t.id, username: t.username });
      } else {
        purgeable.push(t);
      }
    }

    if (purgeable.length === 0) {
      return { purgedCount: 0, blockedCount: blocked.length, blockedAccounts: blocked };
    }

    const actorName = ctx.session.user.name || ctx.session.user.email || "Admin";

    await ctx.prismaRaw.$transaction(async (tx) => {
      await tx.systemAuditLog.createMany({
        data: purgeable.map(t => ({
          actorId: ctx.session.user.id,
          actorName,
          action: "ACCOUNT_BULK_HARD_DELETE",
          targetType: "TiktokAccount",
          targetId: t.id,
          username: t.username,
          metadata: {
            username: t.username,
            country: t.country,
            status: t.status,
            assignedUserId: t.assignedUserId,
            totalRevenue: resolveAllTimeRevenue(t as any),
            totalVideos: t.totalVideos ?? 0,
            totalFollowers: t.totalFollowers ?? 0,
            lastSyncedAt: t.lastSyncedAt?.toISOString() ?? null,
            dailyRevenueCount: t._count.dailyRevenues,
            checklistItemCount: t._count.checklistItems,
            hasMeaningfulAnalytics: !!t.analytics,
          } satisfies AccountPurgeSnapshot,
        })),
      });

      const res = await tx.tiktokAccount.deleteMany({
        where: { id: { in: purgeable.map(t => t.id) }, deletedAt: { not: null } },
      });
      if (res.count !== purgeable.length) {
        throw new TRPCError({ code: "CONFLICT", message: "One or more accounts changed state. Retry." });
      }
    });

    return {
      purgedCount: purgeable.length,
      blockedCount: blocked.length,
      blockedAccounts: blocked,
    };
  }),
```

### 5.10 `create` (Lead / Admin) — Trash-aware, no Zod defaults on restorable fields, race-safe insert

Key fix (carried over): remove `.default(...)` from `country` and `status`. Defaults are applied
only in the normal create branch, so a Trash auto-restore never silently overwrites stored values.

> **Fix #4 applied — concurrent-create race.** Two concurrent `create` calls for a brand-new
> (not-yet-existing) username both pass the `existing === null` check and race on the unique
> constraint on `username`. Prisma throws `P2002` on the loser, which previously propagated as an
> uncaught 500. Now caught explicitly and converted to a clean `CONFLICT`.

```typescript
create: leadProcedure
  .input(z.object({
    username: z.string().min(1),
    // ⚠️ No defaults here — defaults applied only in the normal create branch.
    country: z.string().optional(),
    gpmProfileId: z.string().optional().nullable(),
    gpmPort: z.number().optional().nullable(),
    groupName: z.string().optional().nullable(),
    status: z.enum(["ACTIVE", "WARMING", "RESTRICTED", "BANNED", "STOPPED", "CUSTOM"]).optional(),
    assignedUserId: z.string().optional().nullable(),
  }))
  .mutation(async ({ ctx, input }) => {
    const cleanUsername = input.username.replace(/^@/, "").trim();
    const actorName = ctx.session.user.name || ctx.session.user.email || "User";

    const existing = await ctx.prismaRaw.tiktokAccount.findUnique({
      where: { username: cleanUsername },
    });

    if (existing && existing.deletedAt !== null) {
      const before = {
        status: existing.status,
        country: existing.country,
        groupName: existing.groupName,
        assignedUserId: existing.assignedUserId,
        gpmProfileId: existing.gpmProfileId,
        deletedAt: existing.deletedAt.toISOString(),
      };

      const restored = await ctx.prisma.$transaction(async (tx) => {
        const res = await tx.tiktokAccount.updateMany({
          where: { id: existing.id, deletedAt: { not: null } },
          data: {
            deletedAt: null,
            deletedById: null,
            ...(input.country !== undefined && { country: input.country }),
            ...(input.gpmProfileId !== undefined && { gpmProfileId: input.gpmProfileId }),
            ...(input.gpmPort !== undefined && { gpmPort: input.gpmPort }),
            ...(input.groupName !== undefined && { groupName: input.groupName }),
            ...(input.status !== undefined && { status: input.status }),
            ...(input.assignedUserId !== undefined && { assignedUserId: input.assignedUserId }),
          },
        });
        if (res.count === 0) throw new TRPCError({ code: "CONFLICT", message: "Account state changed" });

        await tx.systemAuditLog.create({
          data: {
            actorId: ctx.session.user.id,
            actorName,
            action: "ACCOUNT_RESTORE",
            targetType: "TiktokAccount",
            targetId: existing.id,
            username: existing.username,
            metadata: {
              restoredFromTrash: true,
              actorRole: ctx.session.user.role,
              previousState: before,
              newState: input,
            } satisfies AccountRestoreDiff,
          },
        });

        return tx.tiktokAccount.findFirst({
          where: { id: existing.id },
          include: { assignedUser: true },
        });
      });

      if (!restored) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return serializeBigInt(restored);
    }

    if (existing) {
      throw new TRPCError({ code: "CONFLICT", message: "Username already exists." });
    }

    // ─── Normal create path: apply defaults HERE ───
    try {
      const created = await ctx.prisma.tiktokAccount.create({
        data: {
          username: cleanUsername,
          country: input.country ?? "US",
          gpmProfileId: input.gpmProfileId ?? null,
          gpmPort: input.gpmPort ?? null,
          groupName: input.groupName ?? null,
          status: input.status ?? "ACTIVE",
          assignedUserId: input.assignedUserId ?? null,
          lastSyncedAt: new Date(),
        },
        include: { assignedUser: true },
      });

      await ctx.prisma.accountLog.create({
        data: {
          accountId: created.id,
          newStatus: created.status,
          logType: "STATUS_CHANGE",
          message: `Account created and assigned to ${created.assignedUser?.name || created.assignedUser?.username || "Unassigned"}`,
          actorName,
        },
      });

      return serializeBigInt(created);
    } catch (err) {
      // Two concurrent creates for a brand-new username can both pass the
      // `existing === null` check above and race on the unique constraint.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new TRPCError({ code: "CONFLICT", message: "Username already exists." });
      }
      throw err;
    }
  }),
```

### 5.11 `checkUsername` (Lead / Admin only)

> **Fix #3 applied — Trash-existence leak.** The prior draft returned `inTrash: boolean` to any
> Lead, letting a Lead enumerate which usernames sit in Trash even though only Admins can browse
> Trash directly (§5.1's `viewTrash && isAdmin` gate). This is a deliberate, narrow exception —
> `create`'s auto-restore UX genuinely needs to know "is this username restorable" before
> submitting — rather than an incidental leak, so it's kept, but scoped down: it now returns only
> what the create-flow UI needs (`exists`, `canAutoRestore`) and never a raw `deletedAt` or any
> other Trash metadata. If this distinction still feels too permissive for your access model,
> the alternative is to drop `checkUsername` entirely and let `create` itself silently handle the
> restore path — the UI would lose the pre-submit confirmation copy in §8, but Leads would learn
> nothing about Trash state independent of actually creating an account.

```typescript
checkUsername: leadProcedure
  .input(z.object({ username: z.string().min(1) }))
  .query(async ({ ctx, input }) => {
    const clean = input.username.replace(/^@/, "").trim();
    const existing = await ctx.prismaRaw.tiktokAccount.findUnique({
      where: { username: clean },
      select: { id: true, deletedAt: true },
    });
    return {
      exists: !!existing,
      // Deliberately scoped to what the create-flow confirmation dialog
      // needs — not a general Trash-existence lookup. No deletedAt exposed.
      canAutoRestore: !!existing && existing.deletedAt !== null,
    };
  }),
```

### 5.12 `resolveAlert` / `addLog`

```typescript
resolveAlert: protectedProcedure
  .input(z.object({ alertId: z.string() }))
  .mutation(async ({ ctx, input }) => {
    const alert = await ctx.prisma.accountAlert.findFirst({
      where: { id: input.alertId, account: { deletedAt: null } },
    });
    if (!alert) throw new TRPCError({ code: "FORBIDDEN", message: "Account is in Trash." });
    // ...resolve
  }),

addLog: protectedProcedure
  .input(z.object({
    accountId: z.string(),
    message: z.string().min(1),
    logType: z.string().default("NOTE"),
  }))
  .mutation(async ({ ctx, input }) => {
    const isAdmin = ctx.session.user.role === "ADMIN";
    const account = await ctx.prismaRaw.tiktokAccount.findUnique({
      where: { id: input.accountId },
      select: { id: true, deletedAt: true },
    });
    if (!account) throw new TRPCError({ code: "NOT_FOUND" });
    if (account.deletedAt && !isAdmin) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Only Admin can log notes on trashed accounts." });
    }
    // ...create log
  }),
```

---

## 6. Sync & Scraper Protection

### `src/app/api/extension/report/route.ts`

Lookup: `ctx.prismaRaw.tiktokAccount.findFirst({ where: { OR: [{ username }, { gpmProfileId }] } })`.

If `account.deletedAt !== null`, return immediately:

```typescript
return NextResponse.json({ success: true, skipped: "ACCOUNT_DELETED" });
```

Before auto-activating:

```typescript
if (
  !isBannedFromCreatorRewards &&
  account.status !== "BANNED" &&
  account.status !== "STOPPED" &&
  account.status !== "CUSTOM" &&
  isLoggedIn &&
  account.status !== "ACTIVE"
) {
  updateData.status = "ACTIVE";
}
```

### `src/app/api/gpm/client-sync/route.ts`

- Match via `prismaRaw`, check `deletedAt`.
- Skip soft-deleted. Never call `tiktokAccount.create`.
- Apply the same `STOPPED` / `CUSTOM` guard.

### `src/app/api/cron/sync/route.ts`

- Filter `where.deletedAt = null` on sync-queue candidate selection.
- Skip `STOPPED` / `CUSTOM` for auto-activation.

### `src/trpc/routers/gpm.ts`

Same guard.

---

## 7. Other Routers

**`checklist.ts`**
- `getToday` / `getByDate`: explicit `where.deletedAt = null` on candidate accounts.
- Call `reconcileTodayChecklistForUser(targetUserId)` when `getToday` runs for an unlocked,
  today-dated checklist (today = Vietnam-local, per §4.2 fix).
- Write paths: explicit `deletedAt: null` guards.

**`scoring-engine.ts`**
- `finalizePendingChecklists`: exclude soft-deleted accounts from final cutoff.

**`user.ts`**
- Any `tiktokAccounts` include: `{ where: { deletedAt: null } }` explicitly.

**`analytics.ts`**
- Filter fleet counters and operator accounts by `deletedAt: null`.

**`revenue.ts`**
- Preserve historical `DailyRevenue` (no `deletedAt` filter).
- `listDetails`: include `account.deletedAt`, accept `includeArchived: boolean` (default `false`).
- When `includeArchived = false`: filter out rows whose account is soft-deleted.

---

## 8. Frontend UI

### `src/app/(protected)/accounts/page.tsx`

- Add `viewTrash` state and "Thùng rác (N)" button for Admin. Muted with `(0)` when empty.
- The list response uses `stats.mode` — UI must switch on it and never read fleet keys in Trash
  mode.
- In Trash mode (`viewTrash = true`):
  - Hide fleet KPI cards; show Trash banner.
  - Hide `onlineStatus`, `status`, and operational filters. Keep search + country.
  - Row actions: "Khôi phục" (calls `restore`), "Xóa vĩnh viễn" (calls `hardDelete`).
  - Bulk bar: "Khôi phục đã chọn" (calls `bulkRestore`), "Xóa vĩnh viễn đã chọn" (calls
    `bulkHardDelete`).
  - Hard-delete dialog displays the warning banner using `blockedAccounts` (now
    `Array<{ id, username }>` for a self-contained message).
  - Detail link uses `getById({ id, includeDeleted: true })`.
  - Row shows `deletedByName` from the batched audit-log join in §5.1 when present, falling back to
    a neutral label ("—" or "Không xác định") if `deletedById` was `SetNull`'d and no matching audit
    row is found.
- Normal mode delete dialog: "Tài khoản sẽ được chuyển vào thùng rác và có thể khôi phục bất cứ lúc
  nào."
- Create form: call `accounts.checkUsername` on submit. If `canAutoRestore === true`, show
  confirmation: "Tài khoản @username hiện đang trong Thùng rác. Bạn có muốn khôi phục và cập nhật
  thông tin không?".
- All timestamps rendered in `Asia/Ho_Chi_Minh` via `Intl.DateTimeFormat`.

### `src/app/(protected)/revenue/details/page.tsx`

- Add `includeArchived` toggle (default `false`).
- Split summary bar: `Doanh thu kênh hoạt động: $X | Kênh đã lưu trữ: $Y`.
- Render `(Đã xóa)` badge on rows where `account.deletedAt !== null`.
- Timestamps in `Asia/Ho_Chi_Minh`.

---

## 9. Migration & Rollout

> **Fix #applied — migration strategy.** `prisma db push` has no migration history, which is a poor
> fit for a feature whose entire point is auditability and a clean rollback path. Switched to
> `prisma migrate dev` (locally, to generate the migration file) followed by a hand-edited SQL
> migration and `prisma migrate deploy` in production, so the `CREATE INDEX CONCURRENTLY` goal from
> the original plan is achieved *and* the change is a recorded, revertible migration.

1. Take a production DB snapshot.
2. Locally: `npx prisma migrate dev --name soft_delete_and_audit --create-only` to generate the
   migration SQL without applying it.
3. Hand-edit the generated SQL: convert every `CREATE INDEX` on `TiktokAccount`/`SyncQueue` to
   `CREATE INDEX CONCURRENTLY` (and move them out of the implicit transaction Prisma wraps
   migrations in, since `CONCURRENTLY` cannot run inside a transaction — split into a
   non-transactional follow-up migration if needed for your Prisma version).
4. `npx prisma generate`.
5. `npm run type-check && npm run build`.
6. Verify on staging first (apply the migration there exactly as it will run in production).
7. Apply to production via `npx prisma migrate deploy` during a low-traffic window. This leaves a
   recorded migration history and a clean revert path, unlike `db push`.

---

## 10. Verification Plan

**Type / build**
- `npm run type-check` — all Prisma types and tRPC procedures compile.
- `npm run build`.

**Extension & read paths**
- `select` exclusion: `prisma.tiktokAccount.findFirst({ where: { id: activeId }, select: { username: true } })` returns the row.
- Trash hidden by default: `accounts.list` never returns trashed rows in normal mode.
- Raw client sees Trash: `prismaRaw.tiktokAccount.findFirst({ where: { id: trashedId } })` returns
  the row.
- **New:** `accounts.list` fleet mode, called through `ctx.prisma`, returns identical results to
  the pre-fix hand-filtered version for an equivalent `where` — confirms the switch to the extended
  client in §5.1 didn't change behavior.

**Write paths & race safety**
- `updateMany` safety: `bulkUpdateStatus` on a trashed ID → row status unchanged.
- `bulkAssign` safety: same, verify no mutation.
- `accounts.update` race guard: `updateMany({ where: { id, deletedAt: null } })` returns
  `count: 0` for a trashed ID and throws `NOT_FOUND` with a generic message for STAFF.
- Concurrent delete/restore race: simulate delete → restore → delete → verify `CONFLICT` thrown
  where expected.
- **New:** concurrent-create race: fire two `create` calls with the same brand-new username in
  parallel → exactly one succeeds, the other receives a clean `CONFLICT` (not a raw 500 from
  `P2002`).

**targetScope fix**
- Substring isolation: create accounts `@user` and `@user2` with pending jobs. Soft-delete
  `@user`. Verify `@user2`'s pending job remains.
- Bulk delete isolation: same with 3 accounts, verify only matched jobs cancel.
- **New:** `SyncQueue` volume test: seed a large number of `PENDING` jobs (e.g. 5–10k) and confirm
  `cancelInFlightSyncJobs` still completes within an acceptable transaction time with the
  `@@index([status])` in place.

**Trash lifecycle**
- Soft delete: single + bulk → `deletedAt`, `deletedById` set, `isOnline = false`, `AccountLog` +
  `SystemAuditLog` created, in-flight `SyncQueue` cancelled.
- Restore: single + bulk → `deletedAt` and `deletedById` cleared, `AccountLog` + `SystemAuditLog`
  created.
- Ghost user fallback (single): restore account assigned to inactive user →
  `assignedUserId = null`.
- Ghost user fallback (bulk): restore 3 accounts, 1 assigned to a deleted user → that one gets
  `assignedUserId = null`, others keep theirs.
- Auto-restore on create: submit a username in Trash → returns the restored account, single row,
  diff recorded in `SystemAuditLog.metadata`. Verify country was NOT overwritten to `"US"` when the
  input omitted it.
- Partial bulk hard delete: select 2 (1 with revenue, 1 empty) without force →
  `{ purgedCount: 1, blockedCount: 1, blockedAccounts: [{ id, username }] }`.
- Hard delete atomicity: purge with `forcePurgeHistoricalData: true` → row gone, `SystemAuditLog`
  retains snapshot.
- Admin `getById({ includeDeleted: true })`: returns the trashed account.
- Non-admin `getById({ includeDeleted: true })`: throws `FORBIDDEN`.
- Staff `getById`: trashed account → 404.
- `checkUsername` permission: STAFF calls it → `FORBIDDEN`.
- **New:** `checkUsername` response shape: confirm the response contains only `exists` and
  `canAutoRestore` — no `deletedAt` or other Trash metadata leaks to the Lead role.

**Scanner & sync**
- Scraper skip: report on trashed account → `{ success: true, skipped: "ACCOUNT_DELETED" }`, no
  new row.
- `STOPPED` protection: report with `isLoggedIn = true` on a `STOPPED` account → status unchanged.
- `CUSTOM` protection: same.

**Checklist**
- Mid-day add: assign a 6th account at 3 PM ICT → today's checklist shows 6 items, updated
  `totalAssigned`.
- Mid-day delete: soft-delete an account assigned to a user with an unlocked today checklist →
  pending item removed, `totalAssigned` decremented.
- Mid-day restore: restore at 3 PM ICT → item added back.
- Finalized checklist untouched: soft-delete or add after `isLocked = true` → no mutation.
- Past date untouched: `getByDate(yesterday)` → no reconciliation.
- Reconciliation error does not 500: simulate `reconcileTodayChecklistForUser` throwing → verify
  the primary delete/restore still succeeds with a logged warning.
- **New — timezone boundary:** run the delete/restore flow at approximately 01:00–06:00
  Asia/Ho_Chi_Minh (i.e. still "yesterday" in UTC) and confirm reconciliation still finds and
  updates *today's* Vietnam-local checklist rather than silently no-op'ing. This is the specific
  regression the §4.2 fix addresses — do not skip it.

**Audit trail**
- Persistence: `SystemAuditLog` retains all rows after hard delete of the referenced account.
- Actor name: verify `actorName` reflects actual actor for Lead-triggered restores (not hardcoded
  "Admin").
- **New:** batched deleter-name join: seed Trash with N rows, confirm the `accounts.list` Trash
  query issues exactly one `SystemAuditLog.findMany` regardless of N (not N queries).

---

## 11. Out of Scope (Future Iterations)

- Trash TTL / auto-purge policy (with a scheduled job).
- Retention policy for `SystemAuditLog` (partitioning or rolling archive).
- Restore UI confirmation showing the diff before applying.
- Soft delete for related entities (users, alerts) with the same rigor.
- Full audit-log viewer UI (`/admin/audit-logs`) with filters by action, actor, target.
- Reconciliation retry queue (currently logged-and-dropped on failure).
- Scoped/paginated alternative to `cancelInFlightSyncJobs`'s full `SyncQueue` scan, if volume
  outgrows the `@@index([status])` mitigation in §2.

---

## 12. Summary of Fixes Applied vs. Prior Drafts

| # | Point | Resolution |
|---|---|---|
| 1 | `create` Zod defaults overwrite trashed country/status | §5.10 — defaults removed from Zod; applied only in normal create branch |
| 2 | State races in delete/restore/hardDelete (and bulk versions) | §5.4–5.9 — updateMany/deleteMany with state-in-where + count check |
| 3 | `bulkRestore` undefined | §5.7 — explicit per-target loop in one transaction + bulk log writes |
| 4 | `checkUsername` too permissive | §5.11 — `leadProcedure` |
| 5 | `SystemAuditLog` relation comment | §2 — explicit "no relations on purpose" comment |
| 6 | `ctx.prisma` vs `prismaRaw` ambiguity | §1.3 — both exported, rules documented |
| 7 | `findUnique` not intercepted | §1.2 — documented; use `findFirst` for fleet reads |
| 8 | Nested relation includes leak | §7 — explicit `where: { deletedAt: null }` on each include site |
| 9 | Analytics block condition too broad | §2.1 — blocked only if meaningful data exists |
| 10 | Partial bulk hard delete atomicity | §5.9 — count check inside transaction, `CONFLICT` on mismatch |
| 11 | Ghost-user fallback for bulk restore | §5.7 — bulk resolve valid users, then per-target update |
| 12 | Migration strategy | §9 — snapshot → `migrate dev --create-only` → hand-edit `CONCURRENTLY` → `migrate deploy` |
| 13 | `trashCount` shape | §5.1 — always present via typed `ListStats` union |
| 14 | Reconciliation boundary | §4.2 — `date === today` (Vietnam-local) && `isLocked === false` only |
| 15 | Sync/auto-activation guards | §6 — all four paths patched |
| 16 | Scraper skip response | §6 — `{ success: true, skipped: "ACCOUNT_DELETED" }` |
| 17 | UI Trash mode behaviors | §8 — muted button at 0, banner, restricted filters, admin-only detail |
| 18 | Revenue details `includeArchived` default OFF | §8 |
| 19 | Vietnam timezone formatting | §8 |
| 20 | Audit types | §3 |
| 21 | `targetScope` substring bug cancels wrong jobs | §4.1 — JS-side scope parsing (`cancelInFlightSyncJobs`) |
| 22 | Post-commit reconciliation errors 500 the caller | §4.2 — `reconcileAfterCommit` wraps in try/catch |
| 23 | `getById` silently ignores `includeDeleted` for non-admins | §5.2 — throws `FORBIDDEN` |
| 24 | Stats shape ambiguity between fleet / trash modes | §3 — typed `ListStats` union |
| 25 | `blockedAccounts` returned as raw IDs | §5.9 — returns `Array<{ id, username }>` |
| 26 | `PrismaClient \| TransactionClient` typing incompatible with extended client | §4.2 — `ReconciliationClient` structural type |
| 27 | `as AccountPurgeSnapshot` hides type errors | §5.8, §5.9 — `satisfies` |
| 28 | Actor name fallback "Operator" is misleading for Lead | §5.10 — fallback is "User" |
| 29 | Trash list rows lack deleter name when `deletedBy` is `SetNull` | §5.1, §8 — single batched join, not N+1 |
| 30 | Null-guard on `create` auto-restore re-read | §5.10 — explicit `if (!restored) throw` |
| **31** | **Reconciliation uses UTC calendar day, silently missing the first 7h of the Vietnam day** | **§4.2 — `vnTodayAsUtcMidnight` helper; must match whatever stamps `DailyChecklist.date`** |
| **32** | **`accounts.list` fleet mode bypasses the soft-delete extension it's meant to validate** | **§1.1, §5.1 — fleet branch now reads through `ctx.prisma`** |
| **33** | **`checkUsername` lets any Lead enumerate Trash existence by username** | **§5.11 — response scoped to `exists`/`canAutoRestore` only, no raw `deletedAt`** |
| **34** | **Concurrent `create` on a brand-new username races on the unique constraint, throws raw 500** | **§5.10 — `P2002` caught, converted to `CONFLICT`** |
| **35** | **`cancelInFlightSyncJobs` full-scans `SyncQueue` with no supporting index** | **§2, §4.1 — `@@index([status])` added, cost documented as accepted-risk-until-scale** |
| **36** | **`prisma db push` has no migration history for an auditability-focused feature** | **§9 — `migrate dev --create-only` + hand-edited `CONCURRENTLY` + `migrate deploy`** |
| **37** | **`hasHistory` snapshot read has a pre-transaction race window** | **§5.8 — documented as accepted risk, not silently left unaddressed** |
| **38** | **STAFF-facing error messages distinguish "not found" from "in Trash," leaking Trash existence** | **§5.3 — generic `"Account not found"` for STAFF-scoped paths** |