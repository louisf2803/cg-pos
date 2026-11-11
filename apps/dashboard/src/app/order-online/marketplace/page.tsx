'use client';

import { OrderOnlineChannelPage } from '@/components/order-online-channels';

export default function OrderMarketplacePage() {
  return (
    <OrderOnlineChannelPage
      focusChannel="marketplace"
      title="Integrasi marketplace"
      subtitle="Kelola status toko daring dan sinkronisasi pesanan CG Order dengan etalase luar."
    />
  );
}

