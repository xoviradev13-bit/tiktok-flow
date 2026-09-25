/**
 * lead-scoping.ts
 * Helper functions to enforce Team Leader (LEAD) permissions and data scoping.
 * When a user is a LEAD, they can only view and manage members and accounts of their led team.
 */

export interface LeadScopeResult {
  isAdmin: boolean;
  isLead: boolean;
  isStaff: boolean;
  teamIds: string[];
  memberUserIds: string[];
  ledTeam: { id: string; name: string; color: string | null } | null;
}

export async function resolveUserScope(
  prisma: any,
  user: { id: string; role?: string | null; teamId?: string | null }
): Promise<LeadScopeResult> {
  const role = user.role || "STAFF";

  if (role === "ADMIN") {
    return {
      isAdmin: true,
      isLead: false,
      isStaff: false,
      teamIds: [],
      memberUserIds: [],
      ledTeam: null,
    };
  }

  if (role === "LEAD") {
    // 1. Find all teams led by this user
    const leadingTeams = await prisma.team.findMany({
      where: { leaderId: user.id },
      select: { id: true, name: true, color: true },
    });

    let teamIds = leadingTeams.map((t: any) => t.id);

    // If user has teamId set, include it
    if (user.teamId && !teamIds.includes(user.teamId)) {
      teamIds.push(user.teamId);
    }

    // Identify primary led team
    let ledTeam = leadingTeams[0] || null;
    if (!ledTeam && user.teamId) {
      ledTeam = await prisma.team.findUnique({
        where: { id: user.teamId },
        select: { id: true, name: true, color: true },
      });
    }

    // 2. Find all members belonging to these teams + the leader themselves
    const teamMembers = await prisma.user.findMany({
      where: {
        OR: [
          ...(teamIds.length > 0 ? [{ teamId: { in: teamIds } }] : []),
          { id: user.id },
        ],
        deletedAt: null,
      },
      select: { id: true },
    });

    const memberUserIds: string[] = Array.from(new Set(teamMembers.map((m: any) => String(m.id))));

    return {
      isAdmin: false,
      isLead: true,
      isStaff: false,
      teamIds,
      memberUserIds,
      ledTeam,
    };
  }

  // STAFF role: strictly personal scope
  return {
    isAdmin: false,
    isLead: false,
    isStaff: true,
    teamIds: user.teamId ? [user.teamId] : [],
    memberUserIds: [user.id],
    ledTeam: null,
  };
}
