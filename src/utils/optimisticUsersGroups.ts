import type { QueryClient } from "@tanstack/react-query";

export interface UserGroupSnapshot {
  usersList: Array<[any, any]>;
  groupsList: Array<[any, any]>;
  userDetail: Array<[any, any]>;
}

export function snapshotUserGroupQueries(queryClient: QueryClient): UserGroupSnapshot {
  return {
    usersList: queryClient.getQueriesData({ queryKey: [["admin", "listUsers"]] }),
    groupsList: queryClient.getQueriesData({ queryKey: [["admin", "listGroups"]] }),
    userDetail: queryClient.getQueriesData({ queryKey: [["user", "getById"]] }),
  };
}

export function rollbackUserGroupQueries(
  queryClient: QueryClient,
  snapshot: UserGroupSnapshot
) {
  if (snapshot.usersList) {
    for (const [key, data] of snapshot.usersList) {
      queryClient.setQueryData(key, data);
    }
  }
  if (snapshot.groupsList) {
    for (const [key, data] of snapshot.groupsList) {
      queryClient.setQueryData(key, data);
    }
  }
  if (snapshot.userDetail) {
    for (const [key, data] of snapshot.userDetail) {
      queryClient.setQueryData(key, data);
    }
  }
}

/**
 * Optimistically update user's group assignment across admin.listUsers and admin.listGroups.
 */
export function optimisticallyUpdateUserGroup(
  queryClient: QueryClient,
  userId: string,
  groupName: string | null
) {
  let targetUserObj: any = null;

  // 1. Update admin.listUsers
  queryClient.setQueriesData(
    { queryKey: [["admin", "listUsers"]] },
    (oldData: any) => {
      if (!Array.isArray(oldData)) return oldData;
      return oldData.map((u: any) => {
        if (u.id === userId) {
          targetUserObj = u;
          return {
            ...u,
            groupName: groupName || null,
            groupId: groupName ? u.groupId : null,
            group: groupName ? { ...(u.group || {}), name: groupName } : null,
          };
        }
        return u;
      });
    }
  );

  // 2. Update user.getById
  queryClient.setQueriesData(
    { queryKey: [["user", "getById"]] },
    (oldData: any) => {
      if (!oldData || oldData.id !== userId) return oldData;
      return {
        ...oldData,
        groupName: groupName || null,
        groupId: groupName ? oldData.groupId : null,
        group: groupName ? { ...(oldData.group || {}), name: groupName } : null,
      };
    }
  );

  // 3. Update admin.listGroups
  queryClient.setQueriesData(
    { queryKey: [["admin", "listGroups"]] },
    (oldData: any) => {
      if (!oldData || !Array.isArray(oldData.groupsDetails)) return oldData;

      const updatedGroupsDetails = oldData.groupsDetails.map((g: any) => {
        const isCurrentGroup = g.name === groupName;
        const hasMember = (g.members || []).some((m: any) => m.id === userId);

        if (isCurrentGroup && !hasMember) {
          const newMember = targetUserObj
            ? {
                id: targetUserObj.id,
                name: targetUserObj.fullName || targetUserObj.name || targetUserObj.username,
                username: targetUserObj.username,
                email: targetUserObj.email,
                avatar: targetUserObj.avatar,
                role: targetUserObj.role,
                isActive: targetUserObj.isActive,
                accountsCount: targetUserObj.accountsCount || 0,
              }
            : { id: userId };
          return {
            ...g,
            membersCount: (g.membersCount || 0) + 1,
            members: [...(g.members || []), newMember],
          };
        } else if (!isCurrentGroup && hasMember) {
          return {
            ...g,
            membersCount: Math.max(0, (g.membersCount || 0) - 1),
            members: (g.members || []).filter((m: any) => m.id !== userId),
          };
        }
        return g;
      });

      return {
        ...oldData,
        groupsDetails: updatedGroupsDetails,
      };
    }
  );
}

/**
 * Optimistically update user's role (ADMIN, LEAD, STAFF).
 */
export function optimisticallyUpdateUserRole(
  queryClient: QueryClient,
  userId: string,
  role: "ADMIN" | "LEAD" | "STAFF"
) {
  queryClient.setQueriesData(
    { queryKey: [["admin", "listUsers"]] },
    (oldData: any) => {
      if (!Array.isArray(oldData)) return oldData;
      return oldData.map((u: any) => (u.id === userId ? { ...u, role } : u));
    }
  );

  queryClient.setQueriesData(
    { queryKey: [["user", "getById"]] },
    (oldData: any) => {
      if (!oldData || oldData.id !== userId) return oldData;
      return { ...oldData, role };
    }
  );

  queryClient.setQueriesData(
    { queryKey: [["admin", "listGroups"]] },
    (oldData: any) => {
      if (!oldData || !Array.isArray(oldData.groupsDetails)) return oldData;
      return {
        ...oldData,
        groupsDetails: oldData.groupsDetails.map((g: any) => ({
          ...g,
          members: (g.members || []).map((m: any) =>
            m.id === userId ? { ...m, role } : m
          ),
          leader: g.leader?.id === userId ? { ...g.leader, role } : g.leader,
        })),
      };
    }
  );
}

/**
 * Optimistically toggle user active status.
 */
export function optimisticallyToggleUserStatus(
  queryClient: QueryClient,
  userId: string
) {
  let newStatus: boolean | undefined = undefined;

  queryClient.setQueriesData(
    { queryKey: [["admin", "listUsers"]] },
    (oldData: any) => {
      if (!Array.isArray(oldData)) return oldData;
      return oldData.map((u: any) => {
        if (u.id === userId) {
          newStatus = !u.isActive;
          return { ...u, isActive: newStatus };
        }
        return u;
      });
    }
  );

  queryClient.setQueriesData(
    { queryKey: [["user", "getById"]] },
    (oldData: any) => {
      if (!oldData || oldData.id !== userId) return oldData;
      return {
        ...oldData,
        isActive: newStatus !== undefined ? newStatus : !oldData.isActive,
      };
    }
  );
}

/**
 * Optimistically delete users from admin.listUsers.
 */
export function optimisticallyDeleteUsers(
  queryClient: QueryClient,
  userIds: string[]
) {
  const idSet = new Set(userIds);
  queryClient.setQueriesData(
    { queryKey: [["admin", "listUsers"]] },
    (oldData: any) => {
      if (!Array.isArray(oldData)) return oldData;
      return oldData.filter((u: any) => !idSet.has(u.id));
    }
  );

  queryClient.setQueriesData(
    { queryKey: [["admin", "listGroups"]] },
    (oldData: any) => {
      if (!oldData || !Array.isArray(oldData.groupsDetails)) return oldData;
      return {
        ...oldData,
        groupsDetails: oldData.groupsDetails.map((g: any) => ({
          ...g,
          membersCount: (g.members || []).filter((m: any) => !idSet.has(m.id)).length,
          members: (g.members || []).filter((m: any) => !idSet.has(m.id)),
          leader: g.leader && idSet.has(g.leader.id) ? null : g.leader,
        })),
      };
    }
  );
}

/**
 * Optimistically update group in admin.listGroups.
 */
export function optimisticallyUpdateGroup(
  queryClient: QueryClient,
  groupPatch: {
    id: string;
    name?: string;
    description?: string | null;
    color?: string;
    leaderId?: string | null;
    memberIds?: string[];
  },
  usersList?: any[]
) {
  queryClient.setQueriesData(
    { queryKey: [["admin", "listGroups"]] },
    (oldData: any) => {
      if (!oldData || !Array.isArray(oldData.groupsDetails)) return oldData;

      const updated = oldData.groupsDetails.map((g: any) => {
        if (g.id !== groupPatch.id) return g;

        let leader = g.leader;
        if (groupPatch.leaderId !== undefined) {
          if (!groupPatch.leaderId) {
            leader = null;
          } else if (usersList) {
            const found = usersList.find((u: any) => u.id === groupPatch.leaderId);
            if (found) {
              leader = {
                id: found.id,
                name: found.fullName || found.name || found.username,
                username: found.username,
                email: found.email,
                avatar: found.avatar,
                role: found.role,
              };
            }
          }
        }

        let members = g.members;
        let membersCount = g.membersCount;
        if (groupPatch.memberIds !== undefined && usersList) {
          const memberIdSet = new Set(groupPatch.memberIds);
          members = usersList
            .filter((u: any) => memberIdSet.has(u.id))
            .map((u: any) => ({
              id: u.id,
              name: u.fullName || u.name || u.username,
              username: u.username,
              email: u.email,
              avatar: u.avatar,
              role: u.role,
              isActive: u.isActive,
              accountsCount: u.accountsCount || 0,
            }));
          membersCount = members.length;
        }

        return {
          ...g,
          ...(groupPatch.name !== undefined ? { name: groupPatch.name } : {}),
          ...(groupPatch.description !== undefined ? { description: groupPatch.description } : {}),
          ...(groupPatch.color !== undefined ? { color: groupPatch.color } : {}),
          leader,
          members,
          membersCount,
        };
      });

      return {
        ...oldData,
        groups: updated.map((g: any) => g.name),
        groupsDetails: updated,
      };
    }
  );
}

/**
 * Optimistically bulk assign leader to groups.
 */
export function optimisticallyBulkAssignGroupLeader(
  queryClient: QueryClient,
  groupIds: string[],
  leaderId: string | null,
  usersList?: any[]
) {
  const idSet = new Set(groupIds);
  let resolvedLeader: any = null;
  if (leaderId && usersList) {
    const found = usersList.find((u: any) => u.id === leaderId);
    if (found) {
      resolvedLeader = {
        id: found.id,
        name: found.fullName || found.name || found.username,
        username: found.username,
        email: found.email,
        avatar: found.avatar,
        role: found.role,
      };
    }
  }

  queryClient.setQueriesData(
    { queryKey: [["admin", "listGroups"]] },
    (oldData: any) => {
      if (!oldData || !Array.isArray(oldData.groupsDetails)) return oldData;
      return {
        ...oldData,
        groupsDetails: oldData.groupsDetails.map((g: any) => {
          if (!idSet.has(g.id)) return g;
          return {
            ...g,
            leader: leaderId ? resolvedLeader : null,
          };
        }),
      };
    }
  );
}

/**
 * Optimistically bulk change color for groups.
 */
export function optimisticallyBulkChangeGroupColor(
  queryClient: QueryClient,
  groupIds: string[],
  color: string
) {
  const idSet = new Set(groupIds);
  queryClient.setQueriesData(
    { queryKey: [["admin", "listGroups"]] },
    (oldData: any) => {
      if (!oldData || !Array.isArray(oldData.groupsDetails)) return oldData;
      return {
        ...oldData,
        groupsDetails: oldData.groupsDetails.map((g: any) =>
          idSet.has(g.id) ? { ...g, color } : g
        ),
      };
    }
  );
}

/**
 * Optimistically delete groups.
 */
export function optimisticallyDeleteGroups(
  queryClient: QueryClient,
  groupIds: string[]
) {
  const idSet = new Set(groupIds);
  queryClient.setQueriesData(
    { queryKey: [["admin", "listGroups"]] },
    (oldData: any) => {
      if (!oldData || !Array.isArray(oldData.groupsDetails)) return oldData;
      const updated = oldData.groupsDetails.filter((g: any) => !idSet.has(g.id));
      return {
        ...oldData,
        groups: updated.map((g: any) => g.name),
        groupsDetails: updated,
      };
    }
  );

  queryClient.setQueriesData(
    { queryKey: [["admin", "listUsers"]] },
    (oldData: any) => {
      if (!Array.isArray(oldData)) return oldData;
      return oldData.map((u: any) => {
        if (u.groupId && idSet.has(u.groupId)) {
          return { ...u, groupId: null, groupName: null, group: null };
        }
        return u;
      });
    }
  );
}
