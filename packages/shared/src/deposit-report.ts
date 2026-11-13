export interface CustomerDepositBalance {
  customerId: string;
  customerName: string;
  customerPhone?: string;
  totalDepositPurchased: number;
  totalDepositUsed: number;
  totalDepositRefunded: number;
  currentBalance: number;
  lastTransactionAt?: string;
}

export interface CustomerDepositEntry {
  id: string;
  customerId: string;
  kind: 'purchase' | 'usage' | 'refund';
  creditAmount: number;
  salePrice?: number;
  packageName?: string;
  orderNumber?: string;
  paymentMethod?: string;
  reason?: string;
  occurredAt: string;
}

export function summarizeCustomerDepositBalances(balances: readonly CustomerDepositBalance[]): {
  customerCount: number;
  totalPurchased: number;
  totalUsed: number;
  totalRefunded: number;
  totalOutstandingBalance: number;
} {
  let totalPurchased = 0;
  let totalUsed = 0;
  let totalRefunded = 0;
  let totalOutstandingBalance = 0;
  for (const b of balances) {
    totalPurchased += b.totalDepositPurchased;
    totalUsed += b.totalDepositUsed;
    totalRefunded += b.totalDepositRefunded;
    totalOutstandingBalance += b.currentBalance;
  }
  return {
    customerCount: balances.length,
    totalPurchased,
    totalUsed,
    totalRefunded,
    totalOutstandingBalance,
  };
}

export function filterCustomerDepositBalances(
  balances: readonly CustomerDepositBalance[],
  search: string,
): CustomerDepositBalance[] {
  const q = search.trim().toLowerCase();
  if (!q) return [...balances];
  return balances.filter(
    (b) =>
      b.customerName.toLowerCase().includes(q) ||
      (b.customerPhone && b.customerPhone.includes(q)),
  );
}
