'use client';

import {
  mergeOnlineChannels,
  type OnlineChannelConfig,
  type PaymentMethodConfig,
  type PaymentMethodOverride,
} from '@cgpos/shared';

const OVERRIDES_KEY = 'cg-a59-payment-overrides-v1';
const CUSTOM_KEY = 'cg-a59-payment-custom-v1';
const CHANNELS_KEY = 'cg-a59-online-channels-v1';

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

export function loadPaymentOverrides(): Record<string, PaymentMethodOverride> {
  return readJson<Record<string, PaymentMethodOverride>>(OVERRIDES_KEY, {});
}

export function savePaymentOverrides(next: Record<string, PaymentMethodOverride>): void {
  writeJson(OVERRIDES_KEY, next);
}

export function loadCustomPaymentMethods(): PaymentMethodConfig[] {
  const arr = readJson<PaymentMethodConfig[]>(CUSTOM_KEY, []);
  return Array.isArray(arr) ? arr : [];
}

export function saveCustomPaymentMethods(next: PaymentMethodConfig[]): void {
  writeJson(CUSTOM_KEY, next);
}

export function loadOnlineChannels(): OnlineChannelConfig[] {
  const stored = readJson<Partial<OnlineChannelConfig>[]>(CHANNELS_KEY, []);
  return mergeOnlineChannels(Array.isArray(stored) ? stored : []);
}

export function saveOnlineChannels(channels: OnlineChannelConfig[]): void {
  writeJson(CHANNELS_KEY, channels);
}

