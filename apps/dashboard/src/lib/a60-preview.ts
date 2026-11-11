'use client';

import {
  DEFAULT_CUSTOMER_CUSTOM_FIELDS,
  DEFAULT_CUSTOMER_POLICY,
  type CustomerCustomField,
  type CustomerPolicySettings,
} from '@cgpos/shared';

const FIELDS_KEY = 'cg-a60-customer-fields-v1';
const POLICY_KEY = 'cg-a60-customer-policy-v1';
const FOLLOWUP_KEY = 'cg-a60-satisfaction-followup-v1';

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

export function loadCustomerCustomFields(): CustomerCustomField[] {
  const arr = readJson<CustomerCustomField[] | null>(FIELDS_KEY, null);
  return Array.isArray(arr) ? arr : DEFAULT_CUSTOMER_CUSTOM_FIELDS;
}

export function saveCustomerCustomFields(fields: CustomerCustomField[]): void {
  writeJson(FIELDS_KEY, fields);
}

export function loadCustomerPolicy(): CustomerPolicySettings {
  const parsed = readJson<Partial<CustomerPolicySettings> | null>(POLICY_KEY, null);
  if (!parsed || typeof parsed !== 'object') return DEFAULT_CUSTOMER_POLICY;
  return {
    requirePhoneOnCreate:
      typeof parsed.requirePhoneOnCreate === 'boolean'
        ? parsed.requirePhoneOnCreate
        : DEFAULT_CUSTOMER_POLICY.requirePhoneOnCreate,
    uniquePhoneEnforcement:
      typeof parsed.uniquePhoneEnforcement === 'boolean'
        ? parsed.uniquePhoneEnforcement
        : DEFAULT_CUSTOMER_POLICY.uniquePhoneEnforcement,
    allowCashierCreate:
      typeof parsed.allowCashierCreate === 'boolean'
        ? parsed.allowCashierCreate
        : DEFAULT_CUSTOMER_POLICY.allowCashierCreate,
    allowCashierEdit:
      typeof parsed.allowCashierEdit === 'boolean'
        ? parsed.allowCashierEdit
        : DEFAULT_CUSTOMER_POLICY.allowCashierEdit,
    defaultAutoJoinLoyalty:
      typeof parsed.defaultAutoJoinLoyalty === 'boolean'
        ? parsed.defaultAutoJoinLoyalty
        : DEFAULT_CUSTOMER_POLICY.defaultAutoJoinLoyalty,
    hidePhoneMaskOnReceipt:
      typeof parsed.hidePhoneMaskOnReceipt === 'boolean'
        ? parsed.hidePhoneMaskOnReceipt
        : DEFAULT_CUSTOMER_POLICY.hidePhoneMaskOnReceipt,
    birthdayReminderDaysBefore:
      typeof parsed.birthdayReminderDaysBefore === 'number' &&
      Number.isInteger(parsed.birthdayReminderDaysBefore)
        ? parsed.birthdayReminderDaysBefore
        : DEFAULT_CUSTOMER_POLICY.birthdayReminderDaysBefore,
    inactiveCustomerDaysThreshold:
      typeof parsed.inactiveCustomerDaysThreshold === 'number' &&
      Number.isInteger(parsed.inactiveCustomerDaysThreshold)
        ? parsed.inactiveCustomerDaysThreshold
        : DEFAULT_CUSTOMER_POLICY.inactiveCustomerDaysThreshold,
  };
}

export function saveCustomerPolicy(policy: CustomerPolicySettings): void {
  writeJson(POLICY_KEY, policy);
}

export function loadSatisfactionFollowups(): Record<string, string> {
  return readJson<Record<string, string>>(FOLLOWUP_KEY, {});
}

export function saveSatisfactionFollowups(next: Record<string, string>): void {
  writeJson(FOLLOWUP_KEY, next);
}

