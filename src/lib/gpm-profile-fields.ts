/** Helpers for TikTok account GPM profile name vs group name fields. */

const PLACEHOLDER_GROUPS = new Set([
  "extension fleet",
  "gpm fleet",
  "gpmlogin fleet",
]);

/** True when a string looks like a GPM profile display name (e.g. "Profile 5404"). */
export function looksLikeGpmProfileName(value?: string | null): boolean {
  const s = String(value || "").trim();
  if (!s) return false;
  if (/^profile\s+\d+$/i.test(s)) return true;
  if (/^profile\s+[0-9a-f-]{8,}$/i.test(s)) return true;
  return false;
}

export function isPlaceholderGroupName(value?: string | null): boolean {
  const s = String(value || "").trim().toLowerCase();
  if (!s) return true;
  if (PLACEHOLDER_GROUPS.has(s)) return true;
  return looksLikeGpmProfileName(s);
}

/**
 * Split legacy misuse where profile name was stored in groupName.
 * Returns { gpmProfileName, groupName } ready for DB write.
 */
export function splitGpmNameFields(input: {
  profileName?: string | null;
  groupName?: string | null;
  existingProfileName?: string | null;
  existingGroupName?: string | null;
}): { gpmProfileName: string | null; groupName: string | null } {
  const profileName =
    String(input.profileName || "").trim() ||
    (looksLikeGpmProfileName(input.existingGroupName)
      ? String(input.existingGroupName).trim()
      : "") ||
    String(input.existingProfileName || "").trim() ||
    null;

  let groupName = String(input.groupName || "").trim() || null;
  if (groupName && looksLikeGpmProfileName(groupName)) {
    // Don't keep profile name in the group field
    if (!profileName) {
      return { gpmProfileName: groupName, groupName: null };
    }
    groupName = null;
  }
  if (!groupName && input.existingGroupName && !isPlaceholderGroupName(input.existingGroupName)) {
    groupName = String(input.existingGroupName).trim();
  }
  if (groupName && isPlaceholderGroupName(groupName) && !looksLikeGpmProfileName(groupName)) {
    // keep explicit placeholders only if nothing better — prefer null
    if (/fleet$/i.test(groupName)) groupName = null;
  }

  return {
    gpmProfileName: profileName,
    groupName,
  };
}
