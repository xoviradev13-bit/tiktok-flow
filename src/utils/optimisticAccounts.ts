import type { QueryClient } from "@tanstack/react-query";

export interface AccountPatch {
  id: string;
  status?: string;
  assignedUserId?: string | null;
  assignedUser?: any;
  isAssignmentLocked?: boolean;
  country?: string | null;
  groupName?: string | null;
  gpmProfileName?: string | null;
  gpmProfileId?: string | null;
  gpmPort?: number | null;
}

export interface AccountQuerySnapshot {
  listQueries: Array<[any, any]>;
  detailQueries: Array<[any, any]>;
  userQueries: Array<[any, any]>;
}

/**
 * Capture current cache states for rollback in case a mutation fails.
 */
export function snapshotAccountQueries(queryClient: QueryClient): AccountQuerySnapshot {
  return {
    listQueries: queryClient.getQueriesData({ queryKey: [["accounts", "list"]] }),
    detailQueries: queryClient.getQueriesData({ queryKey: [["accounts", "getById"]] }),
    userQueries: queryClient.getQueriesData({ queryKey: [["user", "getById"]] }),
  };
}

/**
 * Rollback caches to the snapshotted state.
 */
export function rollbackAccountQueries(
  queryClient: QueryClient,
  snapshot: AccountQuerySnapshot
) {
  if (snapshot.listQueries) {
    for (const [key, data] of snapshot.listQueries) {
      queryClient.setQueryData(key, data);
    }
  }
  if (snapshot.detailQueries) {
    for (const [key, data] of snapshot.detailQueries) {
      queryClient.setQueryData(key, data);
    }
  }
  if (snapshot.userQueries) {
    for (const [key, data] of snapshot.userQueries) {
      queryClient.setQueryData(key, data);
    }
  }
}

/**
 * Resolve assigned user object from staffList or patch.
 */
function resolveAssignedUser(
  assignedUserId: string | null | undefined,
  providedUser: any,
  oldUser: any,
  staffList?: any[]
) {
  if (assignedUserId === undefined) return oldUser;
  if (!assignedUserId) return null;
  if (providedUser) return providedUser;
  if (staffList && staffList.length > 0) {
    const found = staffList.find((u: any) => u.id === assignedUserId);
    if (found) {
      return {
        id: found.id,
        name: found.name || null,
        fullName: found.fullName || null,
        firstName: found.firstName || null,
        lastName: found.lastName || null,
        username: found.username || null,
        role: found.role || "STAFF",
        avatar: found.avatar || null,
        image: found.image || null,
      };
    }
  }
  return oldUser?.id === assignedUserId ? oldUser : null;
}

/**
 * Optimistically updates a single TikTok account across all relevant queries (accounts.list, accounts.getById, user.getById).
 * Provides immediate 0ms UI reflection without requiring page refresh.
 */
export function optimisticallyUpdateAccount(
  queryClient: QueryClient,
  patch: AccountPatch,
  staffList?: any[]
) {
  // 1. Update all accounts.list queries (handles all filter permutations)
  queryClient.setQueriesData(
    { queryKey: [["accounts", "list"]] },
    (oldData: any) => {
      if (!oldData || !Array.isArray(oldData.items)) return oldData;
      const idx = oldData.items.findIndex((a: any) => a.id === patch.id);
      if (idx === -1) return oldData;

      const oldItem = oldData.items[idx];
      const assignedUser = resolveAssignedUser(
        patch.assignedUserId,
        patch.assignedUser,
        oldItem.assignedUser,
        staffList
      );

      const updatedItem = {
        ...oldItem,
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.assignedUserId !== undefined
          ? { assignedUserId: patch.assignedUserId, assignedUser }
          : {}),
        ...(patch.isAssignmentLocked !== undefined
          ? { isAssignmentLocked: patch.isAssignmentLocked }
          : {}),
        ...(patch.country !== undefined ? { country: patch.country } : {}),
        ...(patch.groupName !== undefined ? { groupName: patch.groupName } : {}),
        ...(patch.gpmProfileName !== undefined ? { gpmProfileName: patch.gpmProfileName } : {}),
        ...(patch.gpmProfileId !== undefined ? { gpmProfileId: patch.gpmProfileId } : {}),
        ...(patch.gpmPort !== undefined ? { gpmPort: patch.gpmPort } : {}),
      };

      const newItems = [...oldData.items];
      newItems[idx] = updatedItem;

      // Update fleet stats counts if status changed
      let newStats = oldData.stats;
      if (
        oldData.stats &&
        patch.status &&
        patch.status !== oldItem.status
      ) {
        newStats = { ...oldData.stats };
        const oldKey = oldItem.status?.toLowerCase();
        const newKey = patch.status.toLowerCase();
        if (typeof newStats[oldKey] === "number" && newStats[oldKey] > 0) {
          newStats[oldKey]--;
        }
        if (typeof newStats[newKey] === "number") {
          newStats[newKey]++;
        }
      }

      return {
        ...oldData,
        items: newItems,
        stats: newStats,
      };
    }
  );

  // 2. Update accounts.getById queries
  queryClient.setQueriesData(
    { queryKey: [["accounts", "getById"]] },
    (oldData: any) => {
      if (!oldData || oldData.id !== patch.id) return oldData;

      const assignedUser = resolveAssignedUser(
        patch.assignedUserId,
        patch.assignedUser,
        oldData.assignedUser,
        staffList
      );

      return {
        ...oldData,
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.assignedUserId !== undefined
          ? { assignedUserId: patch.assignedUserId, assignedUser }
          : {}),
        ...(patch.isAssignmentLocked !== undefined
          ? { isAssignmentLocked: patch.isAssignmentLocked }
          : {}),
        ...(patch.country !== undefined ? { country: patch.country } : {}),
        ...(patch.groupName !== undefined ? { groupName: patch.groupName } : {}),
        ...(patch.gpmProfileName !== undefined ? { gpmProfileName: patch.gpmProfileName } : {}),
        ...(patch.gpmProfileId !== undefined ? { gpmProfileId: patch.gpmProfileId } : {}),
        ...(patch.gpmPort !== undefined ? { gpmPort: patch.gpmPort } : {}),
      };
    }
  );

  // 3. Update user.getById queries
  queryClient.setQueriesData(
    { queryKey: [["user", "getById"]] },
    (oldData: any) => {
      if (!oldData || !Array.isArray(oldData.tiktokAccounts)) return oldData;
      const idx = oldData.tiktokAccounts.findIndex((a: any) => a.id === patch.id);
      if (idx === -1) return oldData;

      const newAccounts = [...oldData.tiktokAccounts];
      newAccounts[idx] = {
        ...newAccounts[idx],
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.country !== undefined ? { country: patch.country } : {}),
        ...(patch.groupName !== undefined ? { groupName: patch.groupName } : {}),
        ...(patch.gpmProfileName !== undefined ? { gpmProfileName: patch.gpmProfileName } : {}),
        ...(patch.gpmProfileId !== undefined ? { gpmProfileId: patch.gpmProfileId } : {}),
        ...(patch.gpmPort !== undefined ? { gpmPort: patch.gpmPort } : {}),
      };

      return {
        ...oldData,
        tiktokAccounts: newAccounts,
      };
    }
  );
}

/**
 * Optimistically bulk updates multiple TikTok accounts.
 */
export function optimisticallyBulkUpdateAccounts(
  queryClient: QueryClient,
  ids: string[],
  patch: { status?: string; assignedUserId?: string | null; assignedUser?: any },
  staffList?: any[]
) {
  const idSet = new Set(ids);

  // 1. Update accounts.list
  queryClient.setQueriesData(
    { queryKey: [["accounts", "list"]] },
    (oldData: any) => {
      if (!oldData || !Array.isArray(oldData.items)) return oldData;

      let newStats = oldData.stats ? { ...oldData.stats } : oldData.stats;

      const newItems = oldData.items.map((item: any) => {
        if (!idSet.has(item.id)) return item;

        if (newStats && patch.status && patch.status !== item.status) {
          const oldKey = item.status?.toLowerCase();
          const newKey = patch.status.toLowerCase();
          if (typeof newStats[oldKey] === "number" && newStats[oldKey] > 0) {
            newStats[oldKey]--;
          }
          if (typeof newStats[newKey] === "number") {
            newStats[newKey]++;
          }
        }

        const assignedUser = resolveAssignedUser(
          patch.assignedUserId,
          patch.assignedUser,
          item.assignedUser,
          staffList
        );

        return {
          ...item,
          ...(patch.status !== undefined ? { status: patch.status } : {}),
          ...(patch.assignedUserId !== undefined
            ? { assignedUserId: patch.assignedUserId, assignedUser }
            : {}),
        };
      });

      return {
        ...oldData,
        items: newItems,
        stats: newStats,
      };
    }
  );

  // 2. Update accounts.getById
  queryClient.setQueriesData(
    { queryKey: [["accounts", "getById"]] },
    (oldData: any) => {
      if (!oldData || !idSet.has(oldData.id)) return oldData;

      const assignedUser = resolveAssignedUser(
        patch.assignedUserId,
        patch.assignedUser,
        oldData.assignedUser,
        staffList
      );

      return {
        ...oldData,
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.assignedUserId !== undefined
          ? { assignedUserId: patch.assignedUserId, assignedUser }
          : {}),
      };
    }
  );

  // 3. Update user.getById
  queryClient.setQueriesData(
    { queryKey: [["user", "getById"]] },
    (oldData: any) => {
      if (!oldData || !Array.isArray(oldData.tiktokAccounts)) return oldData;
      const newAccounts = oldData.tiktokAccounts.map((a: any) => {
        if (!idSet.has(a.id)) return a;
        return {
          ...a,
          ...(patch.status !== undefined ? { status: patch.status } : {}),
        };
      });
      return {
        ...oldData,
        tiktokAccounts: newAccounts,
      };
    }
  );
}

/**
 * Optimistically deletes accounts from active lists.
 */
export function optimisticallyDeleteAccounts(queryClient: QueryClient, ids: string[]) {
  const idSet = new Set(ids);
  queryClient.setQueriesData(
    { queryKey: [["accounts", "list"]] },
    (oldData: any) => {
      if (!oldData || !Array.isArray(oldData.items)) return oldData;
      const newItems = oldData.items.filter((a: any) => !idSet.has(a.id));
      let newStats = oldData.stats;
      if (newStats) {
        newStats = {
          ...newStats,
          total: Math.max(0, (newStats.total || 0) - idSet.size),
          trash: (newStats.trash || 0) + idSet.size,
        };
      }
      return {
        ...oldData,
        items: newItems,
        stats: newStats,
      };
    }
  );

  queryClient.setQueriesData(
    { queryKey: [["user", "getById"]] },
    (oldData: any) => {
      if (!oldData || !Array.isArray(oldData.tiktokAccounts)) return oldData;
      return {
        ...oldData,
        tiktokAccounts: oldData.tiktokAccounts.filter((a: any) => !idSet.has(a.id)),
      };
    }
  );
}

/**
 * Optimistically restores accounts in trash view.
 */
export function optimisticallyRestoreAccounts(queryClient: QueryClient, ids: string[]) {
  const idSet = new Set(ids);
  queryClient.setQueriesData(
    { queryKey: [["accounts", "list"]] },
    (oldData: any) => {
      if (!oldData || !Array.isArray(oldData.items)) return oldData;
      const newItems = oldData.items.filter((a: any) => !idSet.has(a.id));
      let newStats = oldData.stats;
      if (newStats) {
        newStats = {
          ...newStats,
          total: (newStats.total || 0) + idSet.size,
          trash: Math.max(0, (newStats.trash || 0) - idSet.size),
        };
      }
      return {
        ...oldData,
        items: newItems,
        stats: newStats,
      };
    }
  );
}
