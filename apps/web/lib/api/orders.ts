/**
 * Vendor order fulfillment API.
 * Orders are created from awarded bids via acceptPOAction.
 * SERVER-SIDE ONLY.
 */

import type { VendorOrder } from '@/lib/types/vendor'
import { getOrders, getOrder as storeGetOrder } from '@/lib/store/server-store'

// Pass vendorId to scope results to the current vendor.
// Orders without vendor_id (legacy seed data) are always included.
export async function getVendorOrders(vendorId?: string): Promise<VendorOrder[]> {
  const all = Object.values(await getOrders()).sort(
    (a, b) => new Date(b.awarded_at).getTime() - new Date(a.awarded_at).getTime(),
  )
  if (!vendorId) return all
  return all.filter((o) => !o.vendor_id || o.vendor_id === vendorId)
}

export async function getVendorOrder(orderId: string, vendorId?: string): Promise<VendorOrder | null> {
  const order = await storeGetOrder(orderId)
  if (!order) return null
  if (vendorId && order.vendor_id && order.vendor_id !== vendorId) return null
  return order
}
