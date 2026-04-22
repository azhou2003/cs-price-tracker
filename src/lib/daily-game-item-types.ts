import type { DailyGameItemType } from "@/lib/types";

export const DAILY_GAME_ITEM_TYPE_VALUES = [
  "weapon",
  "knife-glove",
  "agent",
  "sticker-patch",
  "charm",
  "container",
  "other",
] as const satisfies readonly DailyGameItemType[];

export const DEFAULT_DAILY_GAME_ITEM_TYPES = [...DAILY_GAME_ITEM_TYPE_VALUES];

const DAILY_GAME_ITEM_TYPE_SET = new Set<string>(DAILY_GAME_ITEM_TYPE_VALUES);

export function normalizeDailyGameItemTypes(value: unknown): DailyGameItemType[] {
  if (!Array.isArray(value)) {
    return [...DEFAULT_DAILY_GAME_ITEM_TYPES];
  }

  const selected = new Set<DailyGameItemType>();
  for (const entry of value) {
    if (typeof entry !== "string" || !DAILY_GAME_ITEM_TYPE_SET.has(entry)) {
      continue;
    }

    selected.add(entry as DailyGameItemType);
  }

  if (selected.size === 0) {
    return [...DEFAULT_DAILY_GAME_ITEM_TYPES];
  }

  return DAILY_GAME_ITEM_TYPE_VALUES.filter((entry) => selected.has(entry));
}

export function parseDailyGameItemTypesParam(value: string | null | undefined): DailyGameItemType[] {
  if (!value) {
    return [...DEFAULT_DAILY_GAME_ITEM_TYPES];
  }

  const parsed = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  return normalizeDailyGameItemTypes(parsed);
}

export function toDailyGameItemTypesParam(value: readonly DailyGameItemType[]) {
  return normalizeDailyGameItemTypes([...value]).join(",");
}

export function dailyGameItemTypesKey(value: readonly DailyGameItemType[]) {
  return toDailyGameItemTypesParam(value);
}

export function classifyDailyGameItemType(marketType?: string): DailyGameItemType {
  if (!marketType) {
    return "other";
  }

  const normalized = marketType.toLowerCase();

  if (
    normalized.includes("rifle") ||
    normalized.includes("pistol") ||
    normalized.includes("smg") ||
    normalized.includes("shotgun") ||
    normalized.includes("sniper") ||
    normalized.includes("machinegun")
  ) {
    return "weapon";
  }

  if (normalized.includes("knife") || normalized.includes("glove")) {
    return "knife-glove";
  }

  if (normalized.includes("agent")) {
    return "agent";
  }

  if (
    normalized.includes("sticker") ||
    normalized.includes("patch") ||
    normalized.includes("graffiti")
  ) {
    return "sticker-patch";
  }

  if (normalized.includes("charm")) {
    return "charm";
  }

  if (
    normalized.includes("container") ||
    normalized.includes("case") ||
    normalized.includes("capsule") ||
    normalized.includes("package") ||
    normalized.includes("crate") ||
    normalized.includes("souvenir package")
  ) {
    return "container";
  }

  return "other";
}
