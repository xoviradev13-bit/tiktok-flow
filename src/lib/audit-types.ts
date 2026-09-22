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
  | "SOFT_DELETE"
  | "BULK_SOFT_DELETE"
  | "HARD_DELETE"
  | "BULK_HARD_DELETE"
  | "RESTORE"
  | "BULK_RESTORE";

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
