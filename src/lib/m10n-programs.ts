/**
 * TikTok Studio m10n_center program IDs / enum names.
 * Keep in sync with client-agent ALL_M10N_PROGRAMS + PROGRAM_ID_MAP.
 */

export type M10nProgramDef = {
  id: number;
  key: string;
  label: string;
  /** Legacy / UI aliases that should match this program when filtering. */
  aliases?: string[];
};

export const M10N_PROGRAMS: M10nProgramDef[] = [
  { id: 0, key: "M10N_PROGRAM_UNSPECIFIED", label: "Không xác định" },
  { id: 1, key: "M10N_PROGRAM_VIDEO_GIFTS", label: "Quà tặng video (Video Gifts)" },
  { id: 2, key: "M10N_PROGRAM_TIPS", label: "Tiền boa (Tips)" },
  { id: 3, key: "M10N_PROGRAM_CREATOR_NEXT", label: "Creator Next" },
  { id: 4, key: "M10N_PROGRAM_CREATOR_FUND", label: "Quỹ nhà sáng tạo (Creator Fund)" },
  {
    id: 5,
    key: "M10N_PROGRAM_TIKTOK_CREATOR_MARKETPLACE",
    label: "TikTok Creator Marketplace",
  },
  { id: 6, key: "M10N_PROGRAM_SHOUTOUTS", label: "Shoutouts" },
  { id: 7, key: "M10N_PROGRAM_LIVE_GIFTS", label: "Quà tặng LIVE (Live Gifts)" },
  {
    id: 8,
    key: "M10N_PROGRAM_TIKTOK_SHOP",
    label: "TikTok Shop",
    aliases: ["SHOP", "AFFILIATE"],
  },
  {
    id: 9,
    key: "M10N_PROGRAM_CREATOR_INCENTIVES",
    label: "Chương trình Creator Rewards",
    aliases: ["CREATOR_REWARDS"],
  },
  { id: 10, key: "M10N_PROGRAM_SERIES", label: "Series" },
  {
    id: 11,
    key: "M10N_PROGRAM_TIKTOK_SHOP_MERCHANT",
    label: "TikTok Shop Merchant",
  },
  {
    id: 12,
    key: "M10N_PROGRAM_MUSIC_PROMOTION",
    label: "Quảng bá âm nhạc (Work with Artists)",
  },
  {
    id: 13,
    key: "M10N_PROGRAM_LIVE_SUBSCRIPTION",
    label: "Đăng ký LIVE (Live Subscription)",
  },
  {
    id: 14,
    key: "M10N_PROGRAM_TIKTOK_CREATIVE_CHALLENGE",
    label: "TikTok Creative Challenge",
  },
  {
    id: 15,
    key: "M10N_PROGRAM_TIKTOK_GAMING_REWARD",
    label: "TikTok Gaming Reward",
  },
  {
    id: 16,
    key: "M10N_PROGRAM_TIKTOK_BRANDED_MISSION",
    label: "Branded Mission",
  },
  {
    id: 17,
    key: "M10N_PROGRAM_TIKTOK_LOCAL_SERVICE",
    label: "TikTok Local Service",
  },
  {
    id: 18,
    key: "M10N_PROGRAM_GO_LIVE_INCENTIVE",
    label: "Go Live Incentive",
  },
  { id: 19, key: "M10N_PROGRAM_GO_LIVE_LEADS", label: "Go Live Leads" },
  { id: 20, key: "M10N_PROGRAM_SOUNDON", label: "SoundOn" },
  { id: 21, key: "M10N_PROGRAM_GO_LIVE_SMB", label: "Go Live SMB" },
];

/** Aggregate / non-program rows still shown in the nguồn thu filter. */
export const EXTRA_REVENUE_SOURCE_OPTIONS: Array<{ key: string; label: string }> = [
  { key: "INSIGHTS_VV", label: "Lượt xem (Studio Insights)" },
  { key: "OTHER", label: "Khác" },
];

const byId = new Map(M10N_PROGRAMS.map((p) => [p.id, p]));
const byKey = new Map<string, M10nProgramDef>();
const byLabel = new Map<string, M10nProgramDef>();
for (const p of M10N_PROGRAMS) {
  byKey.set(p.key, p);
  byKey.set(p.key.toUpperCase(), p);
  byLabel.set(p.label.toLowerCase(), p);
  for (const a of p.aliases || []) {
    byKey.set(a, p);
    byKey.set(a.toUpperCase(), p);
  }
}

export function getM10nProgramById(id: number | null | undefined): M10nProgramDef | null {
  if (id == null || !Number.isFinite(Number(id))) return null;
  return byId.get(Number(id)) || null;
}

export function getM10nProgramByKey(key: string | null | undefined): M10nProgramDef | null {
  if (!key) return null;
  const raw = String(key).trim();
  return (
    byKey.get(raw) ||
    byKey.get(raw.toUpperCase()) ||
    byLabel.get(raw.toLowerCase()) ||
    null
  );
}

/** Canonical sourceType key stored/filtered in DailyRevenue + details UI. */
export function resolveRevenueSourceKey(
  input: string | number | null | undefined
): string {
  if (input == null || input === "") return "M10N_PROGRAM_CREATOR_INCENTIVES";
  if (typeof input === "number") {
    return getM10nProgramById(input)?.key || `PROGRAM_${input}`;
  }
  const raw = String(input).trim();
  const prog = getM10nProgramByKey(raw);
  if (prog) return prog.key;
  if (/^M10N_PROGRAM_/i.test(raw)) return raw.toUpperCase();
  return raw;
}

export function formatRevenueSourceLabel(sourceType: string | null | undefined): string {
  if (!sourceType) return "Chương trình Creator Rewards";
  const prog = getM10nProgramByKey(sourceType);
  if (prog) return prog.label;
  const extra = EXTRA_REVENUE_SOURCE_OPTIONS.find((e) => e.key === sourceType);
  if (extra) return extra.label;
  return sourceType;
}

/** Keys that should match when filtering (includes aliases). */
export function revenueSourceFilterKeys(filter: string): string[] {
  if (!filter || filter === "ALL") return [];
  const prog = getM10nProgramByKey(filter);
  if (!prog) return [filter];
  return [prog.key, ...(prog.aliases || [])];
}

export function matchesRevenueSourceFilter(
  rowSourceType: string | null | undefined,
  filter: string | null | undefined
): boolean {
  if (!filter || filter === "ALL") return true;
  const keys = new Set(revenueSourceFilterKeys(filter).map((k) => k.toUpperCase()));
  const rowKey = resolveRevenueSourceKey(rowSourceType).toUpperCase();
  const raw = String(rowSourceType || "").toUpperCase();
  return keys.has(rowKey) || keys.has(raw) || keys.has(filter.toUpperCase());
}

/** Options for "Nguồn thu" dropdowns (filter + edit). */
export function getRevenueSourceSelectOptions(): Array<{ value: string; label: string }> {
  return [
    ...M10N_PROGRAMS.filter((p) => p.id !== 0).map((p) => ({
      value: p.key,
      label: p.label,
    })),
    ...EXTRA_REVENUE_SOURCE_OPTIONS.map((e) => ({
      value: e.key,
      label: e.label,
    })),
  ];
}
