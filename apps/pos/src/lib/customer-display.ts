import {
  buildCustomerDisplayUrl,
  CUSTOMER_DISPLAY_CHANNEL,
  parseCustomerDisplaySnapshot,
  type CustomerDisplaySnapshot,
} from '@cgpos/shared';

export function publishCustomerDisplay(snapshot: CustomerDisplaySnapshot): void {
  if (typeof window === 'undefined') return;
  const serialized = JSON.stringify(snapshot);
  try {
    window.localStorage.setItem(CUSTOMER_DISPLAY_CHANNEL, serialized);
  } catch {
    // Abaikan kuota / mode privat
  }
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      const ch = new BroadcastChannel(CUSTOMER_DISPLAY_CHANNEL);
      ch.postMessage(serialized);
      ch.close();
    } catch {
      // Abaikan jika BroadcastChannel gagal pada konteks ini
    }
  }
}

export function readStoredCustomerDisplay(): CustomerDisplaySnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    return parseCustomerDisplaySnapshot(window.localStorage.getItem(CUSTOMER_DISPLAY_CHANNEL));
  } catch {
    return null;
  }
}

export function subscribeCustomerDisplay(
  onSnapshot: (snapshot: CustomerDisplaySnapshot) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};

  const deliverRaw = (raw: string | null) => {
    const snap = parseCustomerDisplaySnapshot(raw);
    if (snap) onSnapshot(snap);
  };

  const onStorage = (e: StorageEvent) => {
    if (e.key === CUSTOMER_DISPLAY_CHANNEL) deliverRaw(e.newValue);
  };
  window.addEventListener('storage', onStorage);

  let channel: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      channel = new BroadcastChannel(CUSTOMER_DISPLAY_CHANNEL);
      channel.onmessage = (ev: MessageEvent) => {
        if (typeof ev.data === 'string') deliverRaw(ev.data);
        else if (ev.data && typeof ev.data === 'object') {
          deliverRaw(JSON.stringify(ev.data));
        }
      };
    } catch {
      channel = null;
    }
  }

  return () => {
    window.removeEventListener('storage', onStorage);
    try {
      channel?.close();
    } catch {
      // Abaikan saat membersihkan
    }
  };
}

export function openCustomerDisplayWindow(): { opened: boolean; url: string } {
  const url = typeof window !== 'undefined' ? buildCustomerDisplayUrl(window.location.href) : '?display=customer';
  if (typeof window === 'undefined') return { opened: false, url };
  const win = window.open(
    url,
    'cgpos-customer-display',
    'width=1100,height=760,menubar=no,toolbar=no,location=no,status=no',
  );
  return { opened: Boolean(win), url };
}

