'use client';

import {
  DEFAULT_BIRTHDAY_RULE,
  DEFAULT_LOYALTY_TIERS,
  type BirthdayRuleConfig,
  type FacilityMeta,
  type LoyaltyTierGroup,
} from '@cgpos/shared';

const FACILITY_META_KEY = 'cg-a58-facility-meta-v1';
const LOYALTY_TIERS_KEY = 'cg-a58-loyalty-tiers-v1';
const BIRTHDAY_RULE_KEY = 'cg-a58-birthday-rule-v1';
const BIRTHDAY_GRANTS_KEY = 'cg-a58-birthday-grants-v1';

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Abaikan bila penyimpanan lokal dinonaktifkan di peramban.
  }
}

export function loadFacilityMeta(): Record<string, FacilityMeta> {
  return readJson<Record<string, FacilityMeta>>(FACILITY_META_KEY, {});
}

export function saveFacilityMetaEntry(productId: string, meta: FacilityMeta): Record<string, FacilityMeta> {
  const next = { ...loadFacilityMeta(), [productId]: meta };
  writeJson(FACILITY_META_KEY, next);
  return next;
}

export function loadLoyaltyTiers(): LoyaltyTierGroup[] {
  const parsed = readJson<LoyaltyTierGroup[] | null>(LOYALTY_TIERS_KEY, null);
  return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_LOYALTY_TIERS;
}

export function saveLoyaltyTiers(tiers: LoyaltyTierGroup[]): void {
  writeJson(LOYALTY_TIERS_KEY, tiers);
}

export function loadBirthdayRule(): BirthdayRuleConfig {
  const parsed = readJson<Partial<BirthdayRuleConfig> | null>(BIRTHDAY_RULE_KEY, null);
  if (!parsed || typeof parsed !== 'object') return DEFAULT_BIRTHDAY_RULE;
  return {
    isActive: typeof parsed.isActive === 'boolean' ? parsed.isActive : DEFAULT_BIRTHDAY_RULE.isActive,
    bonusPoints:
      typeof parsed.bonusPoints === 'number' && Number.isFinite(parsed.bonusPoints)
        ? parsed.bonusPoints
        : DEFAULT_BIRTHDAY_RULE.bonusPoints,
    noteTemplate:
      typeof parsed.noteTemplate === 'string' && parsed.noteTemplate.trim()
        ? parsed.noteTemplate
        : DEFAULT_BIRTHDAY_RULE.noteTemplate,
  };
}

export function saveBirthdayRule(cfg: BirthdayRuleConfig): void {
  writeJson(BIRTHDAY_RULE_KEY, cfg);
}

export function loadBirthdayGrants(): Record<string, number> {
  return readJson<Record<string, number>>(BIRTHDAY_GRANTS_KEY, {});
}

export function markBirthdayGranted(customerId: string, year: number): Record<string, number> {
  const next = { ...loadBirthdayGrants(), [customerId]: year };
  writeJson(BIRTHDAY_GRANTS_KEY, next);
  return next;
}

