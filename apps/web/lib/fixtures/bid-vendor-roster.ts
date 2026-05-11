export interface BidVendorProfile {
  name: string
  email: string
  is_domestic: boolean
  price_skew: number   // multiplier applied to all prices for this vendor (e.g. 0.92 = 8% cheaper)
  lead_time_base: number  // base days
}

export const BID_VENDOR_ROSTER: BidVendorProfile[] = [
  { name: 'Nucor Steel',              email: 'quotes@nucor.com',           is_domestic: true,  price_skew: 1.00, lead_time_base: 28 },
  { name: 'Steel Dynamics Inc',       email: 'sales@steeldyn.com',       is_domestic: true,  price_skew: 0.95, lead_time_base: 35 },
  { name: 'CalPortland',              email: 'sales@calportland.com',    is_domestic: true,  price_skew: 0.97, lead_time_base: 21 },
  { name: 'Gerdau Americas',          email: 'quotes@gerdau.com',          is_domestic: true,  price_skew: 0.92, lead_time_base: 32 },
  { name: 'Pacific Steel Supply',     email: 'quotes@pacsteel.com',      is_domestic: true,  price_skew: 1.05, lead_time_base: 18 },
  { name: 'Tata Steel',               email: 'export@tatasteel.com',     is_domestic: false, price_skew: 0.88, lead_time_base: 55 },
  { name: 'Hoa Phat Group',           email: 'sales@hoaphat.vn',         is_domestic: false, price_skew: 0.82, lead_time_base: 60 },
  { name: 'JSW Steel USA',            email: 'usa@jsw.com',              is_domestic: false, price_skew: 0.90, lead_time_base: 45 },
]
