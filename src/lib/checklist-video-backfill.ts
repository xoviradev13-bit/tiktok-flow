/**
 * Checklist Video Backfill Utility
 *
 * Groups a videosList (from TikTok, up to BACKFILL_WINDOW_DAYS back) by Vietnam
 * posting date and retroactively fills DailyChecklistItem rows that were missed
 * because the extension was not running on those days.
 *
 * §0.1 — date convention confirmed: DailyChecklist.date is stored as
 *   new Date(Date.UTC(y, m-1, d)) where y/m/d are the VN calendar date.
 *   vnDateStrToChecklistDate() matches this exactly. If the convention ever
 *   changes, fix ONLY that function — all callers go through it.
 *
 * §0.2 — isSynced is NOT read by scoring-engine finalizePendingChecklists.
 *   Backfill does not set isSynced. If scoring ever changes to gate on isSynced,
 *   backfilled days will stop auto-completing — see the comment in scoring-engine.ts.
 *
 * §0.3 — BACKFILL_WINDOW_DAYS is imported from scoring-engine so it stays in
 *   sync with the cutoff cron's 7-day lock window. Backfilling past locked
 *   checklists is harmless (writes are skipped) but wasteful.
 */

import { CHECKLIST_FINALIZATION_WINDOW_DAYS } from "@/lib/scoring-engine";

export const VN_TZ = "Asia/Ho_Chi_Minh";

/**
 * How far back (in days) to attempt backfilling.
 * Capped at the cutoff cron's lock window — writes to locked checklists
 * are silently skipped, so exceeding this is only wasted DB lookups.
 *
 * §0.4 note: TikTok Studio typically returns ~14 days of video history, so
 * a 7-day window is well within what the extension can provide. If the lock
 * window is ever extended, raise this constant to match.
 */
export const BACKFILL_WINDOW_DAYS = CHECKLIST_FINALIZATION_WINDOW_DAYS;

// Singleton formatter — avoids re-allocating on every call.
// en-CA locale produces ISO "YYYY-MM-DD" format reliably.
const _vnDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: VN_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Format a Date as "YYYY-MM-DD" in Asia/Ho_Chi_Minh.
 * Used both for "what VN date is now" and "what VN date did this video post on".
 */
export function toVnDateStr(d: Date): string {
  return _vnDateFormatter.format(d);
}

/**
 * Convert a VN calendar date string ("YYYY-MM-DD") to the exact Date value
 * stored as DailyChecklist.date.
 *
 * Convention confirmed (§0.1): new Date(Date.UTC(y, m-1, d)) where y/m/d
 * are the VN calendar components — i.e. UTC midnight whose calendar date in
 * any timezone >= UTC equals the VN date. This matches parseDateOnly() in
 * checklist.ts.
 *
 * If this convention ever changes, fix ONLY this function.
 */
export function vnDateStrToChecklistDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Parse a video object's post timestamp into a VN date string "YYYY-MM-DD".
 *
 * Handles:
 * - Unix timestamp (seconds or ms) in createTime / create_time / createtime
 * - ISO string in createTime fields (non-numeric fallback)
 * - postDate string fallback
 * Logs a warning for videos that cannot be dated (so silent drops are visible).
 */
export function parseVideoVnDate(v: any): string | null {
  let d: Date | null = null;

  const raw = v?.createTime ?? v?.create_time ?? v?.createtime;

  if (raw != null) {
    const sec = Number(raw);
    if (Number.isFinite(sec)) {
      // Heuristic: values > 1e11 are already milliseconds; smaller are seconds.
      d = new Date(sec > 1e11 ? sec : sec * 1000);
    } else {
      // Non-numeric variant (e.g. ISO string) — try direct parse.
      // Fixed vs. v1: v1 silently gave up here without trying postDate.
      const parsed = new Date(String(raw));
      if (!isNaN(parsed.getTime())) d = parsed;
    }
  }

  // Always try postDate as a fallback, even if createTime existed but
  // failed to parse — don't let a malformed primary field block a valid secondary.
  if (!d && v?.postDate) {
    const parsed = new Date(v.postDate);
    if (!isNaN(parsed.getTime())) d = parsed;
  }

  if (!d || isNaN(d.getTime())) {
    console.warn(
      "[checklist-video-backfill] could not parse video timestamp, video dropped:",
      {
        id: v?.id ?? v?.item_id ?? v?.aweme_id,
        raw,
        postDate: v?.postDate,
      }
    );
    return null;
  }

  return toVnDateStr(d);
}

/**
 * Stable dedup key for a video object across syncs.
 * Prefers explicit numeric IDs over composite keys, so that metadata-only
 * updates to the same video don't create duplicate entries.
 */
function videoKey(v: any): string {
  const id = v?.id ?? v?.item_id ?? v?.aweme_id ?? v?.video_id;
  if (id != null && String(id) !== "") return `id:${String(id)}`;

  // Fallback: timestamp + title as composite key
  const ts = v?.createTime ?? v?.create_time ?? v?.createtime;
  if (ts != null) {
    return `ts:${String(ts)}:${String(v?.title ?? v?.desc ?? "")}`;
  }

  // Last resort: full JSON (only for videos with no identifiable fields)
  return `raw:${JSON.stringify(v)}`;
}

// ── Exported types ──────────────────────────────────────────────────────────

export type BackfillSkipReason =
  | "outside_window"         // date is older than BACKFILL_WINDOW_DAYS or in the future
  | "locked"                 // checklist exists but isLocked = true
  | "no_checklist"           // no DailyChecklist row for this date at all
  | "no_change"              // merged key set is identical to stored — idempotent skip
  | "precedence_live"        // existing source is "live" — higher precedence
  | "precedence_manual";     // existing source is "manual" — higher precedence

export interface BackfillResult {
  /** Dates where at least one new video was written. */
  written: string[];
  /** Dates that were skipped, with the reason for each. */
  skipped: Record<string, BackfillSkipReason>;
}

// ── Main function ───────────────────────────────────────────────────────────

/**
 * Group videos by VN posting date and backfill matching DailyChecklistItem rows.
 *
 * Rules:
 * - Only dates strictly before today (today is the live path's responsibility)
 * - Only dates within `windowDays` of today (default: BACKFILL_WINDOW_DAYS = 7)
 * - Skips locked checklists (already finalized by cutoff cron)
 * - Skips dates where no checklist row exists
 * - Never overwrites videoSource "live" or "manual"
 *   (precedence: live > manual > backfill)
 * - Idempotent: re-running on the same data produces the same result
 * - Does NOT set isSynced (§0.2 confirmed: scoring doesn't read it)
 * - Only bumps videoSyncedAt when the merged key set actually changes
 *
 * @param prisma      Prisma client instance
 * @param accountId   The TiktokAccount id to backfill
 * @param videosList  Raw video objects from the extension report payload
 * @param todayVnStr  Today's VN date as "YYYY-MM-DD" (from caller, for clock consistency)
 * @param windowDays  How far back to look (default: BACKFILL_WINDOW_DAYS = 7)
 */
export async function backfillChecklistVideos(
  prisma: any,
  accountId: string,
  videosList: any[],
  todayVnStr: string,
  windowDays: number = BACKFILL_WINDOW_DAYS
): Promise<BackfillResult> {
  const written: string[] = [];
  const skipped: Record<string, BackfillSkipReason> = {};

  if (!Array.isArray(videosList) || videosList.length === 0) {
    return { written, skipped };
  }

  // Compute the inclusive start of the backfill window.
  const todayUtc = vnDateStrToChecklistDate(todayVnStr);
  const windowStart = new Date(todayUtc.getTime() - windowDays * 24 * 60 * 60 * 1000);
  const windowStartStr = toVnDateStr(windowStart);

  // Group all videos by their VN posting date.
  const byDate = new Map<string, any[]>();
  for (const v of videosList) {
    const dateStr = parseVideoVnDate(v);
    if (!dateStr) continue; // already warned in parseVideoVnDate
    const bucket = byDate.get(dateStr) ?? [];
    bucket.push(v);
    byDate.set(dateStr, bucket);
  }

  for (const [dateStr, videos] of byDate.entries()) {
    // Today belongs to the live path in the extension report route.
    if (dateStr === todayVnStr) continue;

    // Reject dates outside the backfill window (future dates or too old).
    if (dateStr < windowStartStr || dateStr > todayVnStr) {
      skipped[dateStr] = "outside_window";
      continue;
    }

    const dateUtc = vnDateStrToChecklistDate(dateStr);

    // Look up the checklist item for this account + date.
    // The isLocked: false filter means we won't match locked checklists.
    const item = await prisma.dailyChecklistItem.findFirst({
      where: {
        accountId,
        checklist: {
          date: dateUtc,
          isLocked: false,
        },
      },
      select: {
        id: true,
        videoSource: true,
        videosSnapshot: true,
      },
    });

    if (!item) {
      // Distinguish "locked" from "no checklist" — different operational implications.
      // "locked" = intentionally finalized; "no_checklist" = missing data entirely.
      const lockedCheck = await prisma.dailyChecklistItem.findFirst({
        where: { accountId, checklist: { date: dateUtc } },
        select: { id: true },
      });
      skipped[dateStr] = lockedCheck ? "locked" : "no_checklist";
      continue;
    }

    // Respect source precedence: live > manual > backfill.
    if (item.videoSource === "live") {
      skipped[dateStr] = "precedence_live";
      continue;
    }
    if (item.videoSource === "manual") {
      skipped[dateStr] = "precedence_manual";
      continue;
    }

    // Merge incoming videos with whatever was stored previously.
    // Incoming videos overwrite on the same key (fresher data wins).
    const existing = Array.isArray(item.videosSnapshot) ? (item.videosSnapshot as any[]) : [];
    const mergedMap = new Map<string, any>();
    for (const v of existing) mergedMap.set(videoKey(v), v);
    for (const v of videos) {
      mergedMap.set(videoKey(v), {
        ...v,
        _backfilledAt: new Date().toISOString(),
      });
    }
    const merged = Array.from(mergedMap.values());

    // Only write if the key set actually changed — avoids churning videoSyncedAt
    // and updatedAt on every identical re-sync (idempotency).
    const existingKeys = new Set(existing.map(videoKey));
    const mergedKeys = new Set(merged.map(videoKey));
    const hasNewKeys =
      mergedKeys.size !== existingKeys.size ||
      [...mergedKeys].some((k) => !existingKeys.has(k));

    if (!hasNewKeys) {
      skipped[dateStr] = "no_change";
      continue;
    }

    await prisma.dailyChecklistItem.update({
      where: { id: item.id },
      data: {
        videosSnapshot: merged,
        isPosted: true,
        videoSource: "backfill",
        videoSyncedAt: new Date(),
        // isSynced intentionally NOT set — §0.2 confirmed scoring doesn't read it.
        // "isSynced" semantically means the account was live-monitored that day.
      },
    });

    written.push(dateStr);
  }

  return { written, skipped };
}
