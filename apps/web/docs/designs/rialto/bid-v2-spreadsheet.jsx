// V2: Spreadsheet Evolved
// Dense heat-map matrix with AI recommendation row, sticky headers, sparkline coverage bars.

const { useState, useMemo, useRef } = React;

function fmtP(n) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return `$${n.toLocaleString()}`;
}

// Heat map color: green (best) → yellow → red (worst) for price
// For lead time: same
function heatColor(value, min, max, invert = false) {
  if (min === max) return 'bg-stone-50';
  const ratio = (value - min) / (max - min); // 0 = best price, 1 = worst
  const r = invert ? ratio : 1 - ratio;
  if (r > 0.66) return 'bg-teal-50 text-teal-800';
  if (r > 0.33) return 'bg-amber-50 text-amber-800';
  return 'bg-red-50 text-red-800';
}

function heatBorder(value, min, max, invert = false) {
  if (min === max) return '';
  const ratio = (value - min) / (max - min);
  const r = invert ? ratio : 1 - ratio;
  if (r > 0.66) return 'ring-1 ring-teal-200';
  if (r > 0.33) return 'ring-1 ring-amber-200';
  return 'ring-1 ring-red-200';
}

function AIRecommendationBar({ bids }) {
  const fullBids = bids.filter(b => !b.fulfillment_summary?.partial && (b.fulfillment_summary?.coverage_ratio ?? 1) >= 1);
  const best = fullBids.sort((a, b) => a.total_price - b.total_price)[0];
  if (!best) return null;
  const savings = bids.reduce((max, b) => Math.max(max, b.total_price), 0) - best.total_price;
  return (
    <div className="mb-4 flex items-center gap-3 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-500 text-white">
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.347.9-8.385.038-.346-.938zM6 20h12" /></svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-teal-900">AI Recommendation: Award to {best.vendor_name}</p>
        <p className="mt-0.5 text-xs text-teal-700">
          Lowest full-coverage bid at {fmtP(best.total_price)} · {best.lead_time_days}d lead · saves {fmtP(savings)} vs. highest bidder
        </p>
      </div>
      <div className="flex gap-2 shrink-0">
        <button className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 transition-colors">Award PO</button>
        <button className="rounded-lg border border-teal-300 px-3 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-100 transition-colors">Explain</button>
      </div>
    </div>
  );
}

function SparkBar({ values, currentIdx }) {
  const max = Math.max(...values.filter(Boolean));
  if (!max) return null;
  return (
    <div className="flex items-end gap-0.5 h-5">
      {values.map((v, i) => (
        <div key={i}
          className={`w-2 rounded-sm transition-all ${i === currentIdx ? 'bg-teal-500' : 'bg-stone-300'}`}
          style={{ height: `${v ? Math.max(16, (v / max) * 20) : 4}px` }}
        />
      ))}
    </div>
  );
}

function VendorHeaderCell({ bid, bids, isSelected, onSelect }) {
  const fullBids = bids.filter(b => !b.fulfillment_summary?.partial && (b.fulfillment_summary?.coverage_ratio ?? 1) >= 1);
  const isLowest = fullBids.sort((a, b) => a.total_price - b.total_price)[0]?.id === bid.id;
  const isFastest = [...bids].sort((a, b) => a.lead_time_days - b.lead_time_days)[0]?.id === bid.id;
  const decision = bid.buyer_decision_status;

  return (
    <th
      className={`min-w-[180px] border-b border-l border-stone-200 bg-white px-4 py-3 text-left align-bottom cursor-pointer transition-colors
        ${isSelected ? 'bg-teal-50' : 'hover:bg-stone-50'}`}
      onClick={onSelect}
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-start justify-between gap-1">
          <p className="text-xs font-bold text-stone-900 leading-tight">{bid.vendor_name}</p>
          {isLowest && <span className="shrink-0 rounded bg-teal-600 px-1 py-0.5 text-[9px] font-bold text-white">★ LOW</span>}
          {isFastest && !isLowest && <span className="shrink-0 rounded bg-amber-500 px-1 py-0.5 text-[9px] font-bold text-white">⚡ FAST</span>}
        </div>
        <p className="text-sm font-bold text-stone-950">{fmtP(bid.total_price)}</p>
        <p className="text-[10px] text-stone-500">{bid.lead_time_days}d · {Math.round((bid.fulfillment_summary?.coverage_ratio ?? 1) * 100)}% cov</p>
        {decision && (
          <span className={`w-fit rounded px-1.5 py-0.5 text-[9px] font-semibold
            ${decision === 'preferred' ? 'bg-teal-100 text-teal-800' :
              decision === 'alternate' ? 'bg-stone-200 text-stone-700' :
              decision === 'hold' ? 'bg-amber-100 text-amber-700' :
              'bg-red-100 text-red-700'}`}>{decision.replace('_',' ')}</span>
        )}
      </div>
    </th>
  );
}

function V2SpreadsheetDashboard({ tweaks }) {
  const bids = window.MOCK_BIDS;
  const rfq = window.MOCK_RFQ;
  const project = window.MOCK_PROJECT;
  const [selectedBidId, setSelectedBidId] = useState(null);
  const [metric, setMetric] = useState('total'); // total | unit | lead
  const [showDrawer, setShowDrawer] = useState(false);
  const selectedBid = bids.find(b => b.id === selectedBidId);

  // compute min/max per item per metric for heat
  const itemStats = useMemo(() => {
    return rfq.line_items.reduce((acc, item) => {
      const vals = bids.map(bid => {
        const resp = bid.line_item_responses.find(r => r.line_item_id === item.id);
        if (!resp || resp.availability === 'unavailable') return null;
        if (metric === 'total') return resp.total_price;
        if (metric === 'unit') return resp.unit_price;
        if (metric === 'lead') return resp.lead_time_days;
      }).filter(v => v !== null);
      acc[item.id] = { min: Math.min(...vals), max: Math.max(...vals) };
      return acc;
    }, {});
  }, [metric]);

  const totalStats = useMemo(() => {
    const vals = bids.map(b => b.total_price);
    return { min: Math.min(...vals), max: Math.max(...vals) };
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-[#f7f5f0]">
      <div className="flex flex-1">
        {/* Sidebar */}
        <aside className="flex w-56 shrink-0 flex-col border-r border-stone-800 bg-stone-950">
          <div className="border-b border-white/10 px-4 py-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-400 text-stone-950">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
              </span>
              <div>
                <p className="text-sm font-semibold text-white">Rialto</p>
                <p className="text-[10px] text-stone-400">Procurement OS</p>
              </div>
            </div>
          </div>
          <nav className="flex-1 px-2 py-4 space-y-0.5">
            <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-stone-500">Contractor</p>
            {[{ icon: '🏗', label: 'Projects', active: true }, { icon: '📦', label: 'Track Orders' }].map(item => (
              <a key={item.label} href="#" className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors
                ${item.active ? 'bg-white/10 text-white' : 'text-stone-400 hover:bg-white/10 hover:text-white'}`}>
                <span>{item.icon}</span>{item.label}
              </a>
            ))}
          </nav>
          <div className="m-2 rounded-xl border border-white/10 bg-white/[0.04] p-2.5">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-300 text-xs font-bold text-stone-950">S</div>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-white">Sarah McCarthy</p>
                <p className="truncate text-[10px] text-stone-400">sarah@mccarthy.com</p>
              </div>
            </div>
          </div>
        </aside>

        <div className="flex flex-1 flex-col overflow-hidden">
          <header className="flex h-14 items-center border-b border-stone-200 bg-white/85 px-5 backdrop-blur">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">Rialto Marketplace</p>
              <p className="text-xs font-medium text-stone-700">Bid, award, and track construction procurement.</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs font-medium text-stone-500">AI-assisted sourcing</span>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200">Live</span>
            </div>
          </header>

          <main className="flex-1 overflow-auto bg-[radial-gradient(circle_at_top_left,#ccfbf1_0,transparent_28rem),linear-gradient(180deg,#fafaf9_0,#f3f0e8_100%)] p-5">
            <nav className="mb-4 flex items-center gap-1.5 text-xs text-stone-400">
              <span className="cursor-pointer hover:text-stone-600">Projects</span>
              <span>/</span>
              <span className="cursor-pointer hover:text-stone-600">{project.name}</span>
              <span>/</span>
              <span className="font-medium text-stone-700">{rfq.title}</span>
            </nav>

            <div className="mb-5 flex items-start justify-between">
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-stone-950">{rfq.title}</h1>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="rounded bg-stone-900 px-2 py-0.5 text-[10px] font-semibold text-white">RFQ</span>
                  <span className="rounded border border-teal-200 bg-teal-50 px-2 py-0.5 text-[10px] font-semibold text-teal-700">Active</span>
                  <span className="rounded border border-stone-200 bg-stone-50 px-2 py-0.5 text-[10px] font-medium text-stone-500">{rfq.category}</span>
                </div>
              </div>
              <button className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-600 shadow-sm hover:bg-stone-50">Download PDF</button>
            </div>

            <nav className="mb-5 flex gap-1.5 rounded-xl border border-stone-200 bg-white p-1.5 shadow-sm w-fit">
              {['Bid Comparison', 'Mailbox & Quote Sync', 'Purchase Order'].map((tab, i) => (
                <button key={tab} className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition-colors
                  ${i === 0 ? 'bg-stone-950 text-white' : 'text-stone-500 hover:bg-stone-100'}`}>{tab}</button>
              ))}
            </nav>

            {/* AI bar */}
            <AIRecommendationBar bids={bids} />

            {/* Controls row */}
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-semibold text-stone-900">Item-by-Item Matrix</h2>
                <span className="text-xs text-stone-400">{rfq.line_items.length} items · {bids.length} vendors</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-stone-400">Show</span>
                <div className="flex rounded-lg border border-stone-200 bg-white p-0.5">
                  {[['total', 'Total $'], ['unit', 'Unit $'], ['lead', 'Lead days']].map(([val, lbl]) => (
                    <button key={val} onClick={() => setMetric(val)}
                      className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${metric === val ? 'bg-stone-950 text-white' : 'text-stone-500 hover:text-stone-800'}`}>
                      {lbl}
                    </button>
                  ))}
                </div>
                <span className="text-[10px] text-stone-400 ml-1">Click vendor to select</span>
              </div>
            </div>

            {/* Heat map table */}
            <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full border-separate border-spacing-0 text-xs">
                  <thead>
                    {/* Vendor header row */}
                    <tr>
                      <th className="sticky left-0 z-20 min-w-[220px] border-b border-stone-200 bg-stone-50 px-4 py-3 text-left">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">Line Item</p>
                        <p className="mt-1 text-xs text-stone-500">{rfq.line_items.length} SKUs requested</p>
                      </th>
                      {bids.map(bid => (
                        <VendorHeaderCell key={bid.id} bid={bid} bids={bids}
                          isSelected={selectedBidId === bid.id}
                          onSelect={() => setSelectedBidId(selectedBidId === bid.id ? null : bid.id)} />
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rfq.line_items.map((item, rowIdx) => {
                      const stats = itemStats[item.id] || { min: 0, max: 0 };
                      const allUnavail = bids.every(b => {
                        const r = b.line_item_responses.find(r => r.line_item_id === item.id);
                        return !r || r.availability === 'unavailable';
                      });

                      return (
                        <tr key={item.id} className="group">
                          {/* Row header */}
                          <th className="sticky left-0 z-10 border-b border-stone-100 bg-white px-4 py-3 text-left align-top group-hover:bg-stone-50 transition-colors">
                            <p className="font-semibold text-stone-900 leading-tight">{item.description}</p>
                            <p className="mt-0.5 font-mono text-[10px] text-stone-400">{item.sku}</p>
                            <p className="mt-1 text-[10px] text-stone-500">{item.quantity.toLocaleString()} {item.unit}</p>
                            {allUnavail && <p className="mt-1 text-[10px] font-bold text-red-600">Supply risk</p>}
                          </th>

                          {/* Per-vendor cells */}
                          {bids.map(bid => {
                            const resp = bid.line_item_responses.find(r => r.line_item_id === item.id);
                            const unavail = !resp || resp.availability === 'unavailable';
                            const val = unavail ? null : metric === 'total' ? resp.total_price : metric === 'unit' ? resp.unit_price : resp.lead_time_days;
                            const heat = val !== null ? heatColor(val, stats.min, stats.max, metric === 'lead') : '';
                            const isSelected = selectedBidId === bid.id;

                            return (
                              <td key={bid.id}
                                className={`border-b border-l border-stone-100 px-3 py-3 text-right align-top transition-colors
                                  ${unavail ? 'bg-stone-50' : heat}
                                  ${isSelected ? 'opacity-100 ring-1 ring-teal-400 ring-inset' : ''}`}
                              >
                                {unavail ? (
                                  <span className="text-[10px] font-medium text-stone-400">—</span>
                                ) : (
                                  <>
                                    <p className="font-bold text-current">
                                      {metric === 'lead' ? `${val}d` : fmtP(val)}
                                    </p>
                                    {metric !== 'lead' && (
                                      <p className="mt-0.5 text-[10px] text-current opacity-70">
                                        {metric === 'total' ? `${fmtP(resp.unit_price)}/${item.unit}` : `×${item.quantity}`}
                                      </p>
                                    )}
                                    {resp.availability === 'can_source' && (
                                      <p className="mt-0.5 text-[10px] font-semibold text-amber-700">Needs sourcing</p>
                                    )}
                                  </>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}

                    {/* Totals row */}
                    <tr className="bg-stone-50 font-semibold">
                      <th className="sticky left-0 z-10 border-t border-stone-200 bg-stone-100 px-4 py-3 text-left text-xs uppercase tracking-wider text-stone-500">
                        Total
                      </th>
                      {bids.map(bid => {
                        const heat = heatColor(bid.total_price, totalStats.min, totalStats.max);
                        return (
                          <td key={bid.id} className={`border-l border-t border-stone-200 px-3 py-3 text-right ${heat}`}>
                            <p className="text-sm font-bold">{fmtP(bid.total_price)}</p>
                            {bid.fulfillment_summary?.partial && <p className="mt-0.5 text-[10px] font-semibold text-amber-700">Partial</p>}
                          </td>
                        );
                      })}
                    </tr>

                    {/* Lead time row */}
                    <tr className="bg-stone-50">
                      <th className="sticky left-0 z-10 border-t border-stone-100 bg-stone-50 px-4 py-2.5 text-left text-[10px] uppercase tracking-wider text-stone-400">
                        Lead Time
                      </th>
                      {bids.map(bid => {
                        const leads = bids.map(b => b.lead_time_days);
                        const heat = heatColor(bid.lead_time_days, Math.min(...leads), Math.max(...leads), true);
                        return (
                          <td key={bid.id} className={`border-l border-t border-stone-100 px-3 py-2.5 text-right text-xs font-semibold ${heat}`}>
                            {bid.lead_time_days}d
                          </td>
                        );
                      })}
                    </tr>

                    {/* Coverage row */}
                    <tr>
                      <th className="sticky left-0 z-10 border-t border-stone-100 bg-white px-4 py-2.5 text-left text-[10px] uppercase tracking-wider text-stone-400">
                        Coverage
                      </th>
                      {bids.map(bid => {
                        const cov = bid.fulfillment_summary?.coverage_ratio ?? 1;
                        return (
                          <td key={bid.id} className="border-l border-t border-stone-100 px-3 py-2.5 align-middle">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-100">
                                <div className={`h-full rounded-full ${cov >= 1 ? 'bg-teal-500' : cov >= 0.7 ? 'bg-amber-400' : 'bg-red-400'}`}
                                  style={{ width: `${Math.round(cov * 100)}%` }} />
                              </div>
                              <span className={`text-[10px] font-semibold ${cov >= 1 ? 'text-teal-700' : 'text-amber-700'}`}>
                                {Math.round(cov * 100)}%
                              </span>
                            </div>
                          </td>
                        );
                      })}
                    </tr>

                    {/* Payment terms row */}
                    {tweaks.showTerms && (
                      <tr>
                        <th className="sticky left-0 z-10 border-t border-stone-100 bg-white px-4 py-2.5 text-left text-[10px] uppercase tracking-wider text-stone-400">
                          Payment
                        </th>
                        {bids.map(bid => (
                          <td key={bid.id} className="border-l border-t border-stone-100 px-3 py-2.5 text-[10px] text-stone-600">
                            {bid.terms?.payment_terms ?? '—'}
                          </td>
                        ))}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Legend */}
            <div className="mt-3 flex items-center gap-4 text-[10px] text-stone-400">
              <span className="font-semibold uppercase tracking-wider">Heat map:</span>
              <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-teal-100 ring-1 ring-teal-200" /> Best value</span>
              <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-amber-100 ring-1 ring-amber-200" /> Mid range</span>
              <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-red-100 ring-1 ring-red-200" /> Highest cost</span>
            </div>

            {/* Selected vendor detail */}
            {selectedBid && tweaks.showVendorDetail && (
              <div className="mt-5 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-stone-900">{selectedBid.vendor_name} — Detail</h3>
                  <button onClick={() => setSelectedBidId(null)} className="text-xs text-stone-400 hover:text-stone-700">Dismiss ×</button>
                </div>
                <div className="grid grid-cols-4 gap-3 text-xs">
                  <div className="rounded-xl bg-stone-50 p-3">
                    <p className="text-stone-400">Total</p>
                    <p className="mt-1 text-lg font-bold text-stone-950">{fmtP(selectedBid.total_price)}</p>
                  </div>
                  <div className="rounded-xl bg-stone-50 p-3">
                    <p className="text-stone-400">Lead Time</p>
                    <p className="mt-1 text-lg font-bold text-stone-950">{selectedBid.lead_time_days}d</p>
                  </div>
                  <div className="rounded-xl bg-stone-50 p-3">
                    <p className="text-stone-400">Payment</p>
                    <p className="mt-1 font-semibold text-stone-950">{selectedBid.terms?.payment_terms ?? '—'}</p>
                  </div>
                  <div className="rounded-xl bg-stone-50 p-3">
                    <p className="text-stone-400">Source</p>
                    <p className="mt-1 font-semibold text-stone-950 capitalize">{selectedBid.source}</p>
                  </div>
                </div>
                {selectedBid.source !== 'email' && (
                  <button className="mt-4 w-full rounded-xl bg-stone-950 py-2.5 text-sm font-semibold text-white hover:bg-stone-800 transition-colors">
                    Award PO to {selectedBid.vendor_name}
                  </button>
                )}
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { V2SpreadsheetDashboard });
