'use client';

import { OrderOnlineChannelPage } from '@/components/order-online-channels';

export default function OrderDeliveryPage() {
  return (
    <OrderOnlineChannelPage
      focusChannel="delivery"
      title="Pesan-antar makanan"
      subtitle="Pantau dan jeda sementara saluran pesan-antar mitra dalam ekosistem CG Order."
    />
  );
}

