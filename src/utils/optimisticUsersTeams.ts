import type { QueryClient } from "@tanstack/react-query";

export interface UserTeamSnapshot {
  usersList: Array<[any, any]>;
  teamsList: Array<[any, any]>;
  userDetail: Array<[any, any]>;
}

export function snapshotUserTeamQueries(queryClient: QueryClient): UserTeamSnapshot {
  return {
    usersList: queryClient.getQueriesData({ queryKey: [["admin", "listUsers"]] }),
    teamsList: queryClient.getQueriesData({ queryKey: [["admin", "listTeams"]] }),
    userDetail: queryClient.getQueriesData({ queryKey: [["user", "getById"]] }),
  };
}

export function rollbackUserTeamQueries(
  queryClient: QueryClient,
  snapshot: UserTeamSnapshot
) {
  if (snapshot.usersList) {
    for (const [key, data] of snapshot.usersList) {
      queryClient.setQueryData(key, data);
    }
  }
  if (snapshot.teamsList) {
    for (const [key, data] of snapshot.teamsList) {
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
 * Optimistically update user's team assignment across admin.listUsers and admin.listTeams.
 */
export function optimisticallyUpdateUserTeam(
  queryClient: QueryClient,
  userId: string,
  teamName: string | null
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
            teamName: teamName || null,
            teamId: teamName ? u.teamId : null,
            team: teamName ? { ...(u.team || {}), name: teamName } : null,
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
        teamName: teamName || null,
        teamId: teamName ? oldData.teamId : null,
        team: teamName ? { ...(oldData.team || {}), name: teamName } : null,
      };
    }
  );

  // 3. Helper to update teams cache
  const updateTeamsCache = (oldData: any) => {
    if (!oldData || !Array.isArray(oldData.teamsDetails)) return oldData;

    const updatedDetails = oldData.teamsDetails.map((t: any) => {
      const isCurrentTeam = t.name === teamName;
      const hasMember = (t.members || []).some((m: any) => m.id === userId);

      if (isCurrentTeam && !hasMember) {
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
          ...t,
          membersCount: (t.membersCount || 0) + 1,
          members: [...(t.members || []), newMember],
        };
      } else if (!isCurrentTeam && hasMember) {
        return {
          ...t,
          membersCount: Math.max(0, (t.membersCount || 0) - 1),
          members: (t.members || []).filter((m: any) => m.id !== userId),
        };
      }
      return t;
    });

    return {
      ...oldData,
      teamsDetails: updatedDetails,
    };
  };

  queryClient.setQueriesData({ queryKey: [["admin", "listTeams"]] }, updateTeamsCache);
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

  const updateRolesInTeams = (oldData: any) => {
    if (!oldData || !Array.isArray(oldData.teamsDetails)) return oldData;

    const updated = oldData.teamsDetails.map((t: any) => ({
      ...t,
      members: (t.members || []).map((m: any) =>
        m.id === userId ? { ...m, role } : m
      ),
      leader: t.leader?.id === userId ? { ...t.leader, role } : t.leader,
    }));

    return {
      ...oldData,
      teamsDetails: updated,
    };
  };

  queryClient.setQueriesData({ queryKey: [["admin", "listTeams"]] }, updateRolesInTeams);
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

  const deleteInTeams = (oldData: any) => {
    if (!oldData || !Array.isArray(oldData.teamsDetails)) return oldData;

    const updated = oldData.teamsDetails.map((t: any) => ({
      ...t,
      membersCount: (t.members || []).filter((m: any) => !idSet.has(m.id)).length,
      members: (t.members || []).filter((m: any) => !idSet.has(m.id)),
      leader: t.leader && idSet.has(t.leader.id) ? null : t.leader,
    }));

    return {
      ...oldData,
      teamsDetails: updated,
    };
  };

  queryClient.setQueriesData({ queryKey: [["admin", "listTeams"]] }, deleteInTeams);
}

/**
 * Optimistically update team in admin.listTeams.
 * Also promotes newly appointed leader to LEAD in users query.
 */
export function optimisticallyUpdateTeam(
  queryClient: QueryClient,
  teamPatch: {
    id: string;
    name?: string;
    description?: string | null;
    color?: string;
    leaderId?: string | null;
    memberIds?: string[];
  },
  usersList?: any[]
) {
  // If leader assigned, optimistically promote to LEAD on listUsers
  if (teamPatch.leaderId) {
    queryClient.setQueriesData(
      { queryKey: [["admin", "listUsers"]] },
      (oldUsers: any) => {
        if (!Array.isArray(oldUsers)) return oldUsers;
        return oldUsers.map((u: any) => {
          if (u.id === teamPatch.leaderId && u.role === "STAFF") {
            return { ...u, role: "LEAD" };
          }
          return u;
        });
      }
    );
  }

  const updateTeamList = (oldData: any) => {
    if (!oldData || !Array.isArray(oldData.teamsDetails)) return oldData;

    const updated = oldData.teamsDetails.map((t: any) => {
      if (t.id !== teamPatch.id) return t;

      let leader = t.leader;
      if (teamPatch.leaderId !== undefined) {
        if (!teamPatch.leaderId) {
          leader = null;
        } else if (usersList) {
          const found = usersList.find((u: any) => u.id === teamPatch.leaderId);
          if (found) {
            leader = {
              id: found.id,
              name: found.fullName || found.name || found.username,
              username: found.username,
              email: found.email,
              avatar: found.avatar,
              role: found.role === "STAFF" ? "LEAD" : found.role,
            };
          }
        }
      }

      let members = t.members;
      let membersCount = t.membersCount;
      if (teamPatch.memberIds !== undefined && usersList) {
        const memberIdSet = new Set(teamPatch.memberIds);
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
        ...t,
        ...(teamPatch.name !== undefined ? { name: teamPatch.name } : {}),
        ...(teamPatch.description !== undefined ? { description: teamPatch.description } : {}),
        ...(teamPatch.color !== undefined ? { color: teamPatch.color } : {}),
        leader,
        members,
        membersCount,
      };
    });

    return {
      ...oldData,
      teams: updated.map((t: any) => t.name),
      teamsDetails: updated,
    };
  };

  queryClient.setQueriesData({ queryKey: [["admin", "listTeams"]] }, updateTeamList);
}

/**
 * Optimistically bulk assign leader to teams.
 */
export function optimisticallyBulkAssignTeamLeader(
  queryClient: QueryClient,
  teamIds: string[],
  leaderId: string | null,
  usersList?: any[]
) {
  const idSet = new Set(teamIds);
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
        role: found.role === "STAFF" ? "LEAD" : found.role,
      };
    }
  }

  if (leaderId) {
    queryClient.setQueriesData(
      { queryKey: [["admin", "listUsers"]] },
      (oldUsers: any) => {
        if (!Array.isArray(oldUsers)) return oldUsers;
        return oldUsers.map((u: any) =>
          u.id === leaderId && u.role === "STAFF" ? { ...u, role: "LEAD" } : u
        );
      }
    );
  }

  const updateBulkLeader = (oldData: any) => {
    if (!oldData || !Array.isArray(oldData.teamsDetails)) return oldData;

    const updated = oldData.teamsDetails.map((t: any) => {
      if (!idSet.has(t.id)) return t;
      return {
        ...t,
        leader: leaderId ? resolvedLeader : null,
      };
    });

    return {
      ...oldData,
      teamsDetails: updated,
    };
  };

  queryClient.setQueriesData({ queryKey: [["admin", "listTeams"]] }, updateBulkLeader);
}

/**
 * Optimistically bulk change color for teams.
 */
export function optimisticallyBulkChangeTeamColor(
  queryClient: QueryClient,
  teamIds: string[],
  color: string
) {
  const idSet = new Set(teamIds);
  const updateColor = (oldData: any) => {
    if (!oldData || !Array.isArray(oldData.teamsDetails)) return oldData;

    const updated = oldData.teamsDetails.map((t: any) =>
      idSet.has(t.id) ? { ...t, color } : t
    );

    return {
      ...oldData,
      teamsDetails: updated,
    };
  };

  queryClient.setQueriesData({ queryKey: [["admin", "listTeams"]] }, updateColor);
}

/**
 * Optimistically delete teams.
 */
export function optimisticallyDeleteTeams(
  queryClient: QueryClient,
  teamIds: string[]
) {
  const idSet = new Set(teamIds);
  const deleteTeamsInCache = (oldData: any) => {
    if (!oldData || !Array.isArray(oldData.teamsDetails)) return oldData;

    const updated = oldData.teamsDetails.filter((t: any) => !idSet.has(t.id));
    return {
      ...oldData,
      teams: updated.map((t: any) => t.name),
      teamsDetails: updated,
    };
  };

  queryClient.setQueriesData({ queryKey: [["admin", "listTeams"]] }, deleteTeamsInCache);

  queryClient.setQueriesData(
    { queryKey: [["admin", "listUsers"]] },
    (oldData: any) => {
      if (!Array.isArray(oldData)) return oldData;
      return oldData.map((u: any) => {
        if (u.teamId && idSet.has(u.teamId)) {
          return {
            ...u,
            teamId: null,
            teamName: null,
            team: null,
          };
        }
        return u;
      });
    }
  );
}
