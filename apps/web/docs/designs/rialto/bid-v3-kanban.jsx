// V3: Kanban Pipeline
// Vendors flow as columns in a decision pipeline. Cards are draggable between stages.
// A collapsible bottom drawer reveals the SKU comparison table.

const { useState, useRef, useCallback } = React;

function fmtK(n) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return `$${n.toLocaleString()}`;
}

const LANES = [
  { id: 'preferred',  label: 'Preferred',   desc: 'Ready to award',         color: 'bg-teal-500',   light: 'bg-teal-50',   border: 'border-teal-200',  text: 'text-teal-700'  },
  { id: 'alternate',  label: 'Shortlist',    desc: 'Strong backup option',   color: 'bg-stone-600',  light: 'bg-stone-50',  border: 'border-stone-200', text: 'text-stone-700' },
  { id: 'hold',       label: 'Hold',         desc: 'Pending more info',      color: 'bg-amber-400',  light: 'bg-amber-50',  border: 'border-amber-200', text: 'text-amber-700' },
  { id: null,         label: 'Undecided',    desc: 'Not yet evaluated',      color: 'bg-stone-300',  light: 'bg-white',     border: 'border-stone-200', text: 'text-stone-500' },
  { id: 'do_not_use', label: 'Pass',         desc: 'Not moving forward',     color: 'bg-red-300',    light: 'bg-red-50',    border: 'border-red-200',   text: 'text-red-600'   },
];

function SourcePip({ bid }) {
  if (bid.source === 'email')      return <span className="rounded-sm bg-stone-200 px-1.5 py-0.5 text-[9px] font-semibold text-stone-600">Email</span>;
  if (bid.source === 'magic_form') return <span className="rounded-sm bg-teal-100 px-1.5 py-0.5 text-[9px] font-semibold text-teal-700">Magic Form</span>;
  if (bid.is_invited)              return <span className="rounded-sm bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700">Invited</span>;
  return <span className="rounded-sm bg-stone-100 px-1.5 py-0.5 text-[9px] font-semibold text-stone-500">Marketplace</span>;
}

function CovDots({ responses }) {
  return (
    <div className="flex gap-0.5">
      {responses.map((r, i) => (
        <div key={i} className={`h-2 w-2 rounded-full ${r.availability === 'unavailable' ? 'bg-red-300' : r.availability === 'can_source' ? 'bg-amber-300' : 'bg-teal-400'}`} />
      ))}
    </div>
  );
}

function KanbanCard({ bid, bids, lane, onDragStart, onOpenDetail, tweaks }) {
  const fullBids = bids.filter(b => !b.fulfillment_summary?.partial && (b.fulfillment_summary?.coverage_ratio ?? 1) >= 1);
  const isLowest = fullBids.sort((a, b) => a.total_price - b.total_price)[0]?.id === bid.id;
  const isFastest = [...bids].sort((a, b) => a.lead_time_days - b.lead_time_days)[0]?.id === bid.id;
  const isPartial = bid.fulfillment_summary?.partial;
  const cov = bid.fulfillment_summary?.coverage_ratio ?? 1;

  // Compare to lowest price among full-coverage bids
  const lowestPrice = fullBids.length > 0 ? Math.min(...fullBids.map(b => b.total_price)) : bid.total_price;
  const priceDiff = bid.total_price - lowestPrice;
  const priceDiffStr = priceDiff === 0 ? '↓ Lowest' : `+${fmtK(priceDiff)}`;

  return (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart(bid.id); }}
      className={`group cursor-grab rounded-xl border bg-white shadow-sm transition-all active:cursor-grabbing active:opacity-80 active:scale-95
        ${lane?.id === 'preferred' ? 'border-teal-200 ring-1 ring-teal-100' : 'border-stone-200'}
        hover:shadow-md`}
    >
      {/* Color bar */}
      <div className={`h-1 rounded-t-xl ${lane?.color ?? 'bg-stone-200'}`} />

      <div className="p-3.5">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <p className="text-sm font-bold text-stone-950 leading-tight">{bid.vendor_name}</p>
          <div className="flex flex-col gap-1 items-end shrink-0">
            {isLowest && <span className="rounded bg-teal-500 px-1.5 py-0.5 text-[9px] font-bold text-white">★ BEST</span>}
            {isFastest && !isLowest && <span className="rounded bg-amber-500 px-1.5 py-0.5 text-[9px] font-bold text-white">⚡ FAST</span>}
          </div>
        </div>

        {/* Price + lead */}
        <div className="flex items-baseline justify-between mb-2.5">
          <span className={`text-xl font-bold ${isPartial ? 'text-amber-700' : 'text-stone-950'}`}>{fmtK(bid.total_price)}</span>
          <span className="text-xs text-stone-400">{bid.lead_time_days}d lead</span>
        </div>

        {/* Price delta vs lowest */}
        {!isLowest && !isPartial && (
          <p className="mb-2 text-[10px] font-semibold text-stone-500">{priceDiffStr} vs. lowest</p>
        )}
        {isPartial && (
          <p className="mb-2 text-[10px] font-semibold text-orange-600">Partial — {Math.round(cov * 100)}% coverage</p>
        )}

        {/* Coverage dots */}
        <CovDots responses={bid.line_item_responses} />

        {/* Source + terms */}
        <div className="mt-2.5 flex items-center gap-1.5">
          <SourcePip bid={bid} />
          {bid.terms?.payment_terms && (
            <span className="text-[10px] text-stone-400">{bid.terms.payment_terms}</span>
          )}
        </div>

        {/* Risk flags */}
        {bid.risk_flags?.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {bid.risk_flags.map(f => (
              <span key={f.code} className="rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700">⚠ {f.label}</span>
            ))}
          </div>
        )}

        {/* Decision rationale snippet */}
        {bid.decision_rationale && tweaks.showRationale && (
          <p className="mt-2 line-clamp-2 text-[10px] text-stone-400 italic">{bid.decision_rationale}</p>
        )}

        {/* Action row */}
        <div className="mt-3 flex gap-1.5">
          <button
            onClick={() => onOpenDetail(bid)}
            className="flex-1 rounded-lg border border-stone-200 py-1.5 text-[10px] font-semibold text-stone-600 hover:bg-stone-50 transition-colors"
          >
            Details
          </button>
          {bid.source !== 'email' && lane?.id === 'preferred' && (
            <button className="flex-1 rounded-lg bg-teal-600 py-1.5 text-[10px] font-semibold text-white hover:bg-teal-700 transition-colors">
              Award PO
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function SkuDrawer({ rfq, bids, open, onClose }) {
  if (!open) return null;
  return (
    <div className="fixed bottom-0 left-56 right-0 z-40 flex flex-col rounded-t-2xl border-t border-stone-200 bg-white shadow-2xl" style={{ maxHeight: '55vh' }}>
      <div className="flex items-center justify-between border-b border-stone-100 px-5 py-3">
        <div>
          <h3 className="text-sm font-semibold text-stone-900">Item-by-Item Comparison</h3>
          <p className="text-xs text-stone-400">{rfq.line_items.length} items · {bids.length} vendors</p>
        </div>
        <button onClick={onClose} className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-semibold text-stone-600 hover:bg-stone-50">
          Close ↓
        </button>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full border-separate border-spacing-0 text-xs">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="sticky left-0 z-20 border-b border-stone-200 bg-stone-50 px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-stone-400 min-w-[200px]">Item</th>
              {bids.map(bid => (
                <th key={bid.id} className="border-b border-l border-stone-200 bg-stone-50 px-4 py-2.5 min-w-[140px]">
                  <p className="text-left font-bold text-stone-900 truncate">{bid.vendor_name}</p>
                  <p className="mt-0.5 text-left text-stone-500">{fmtK(bid.total_price)} · {bid.lead_time_days}d</p>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rfq.line_items.map(item => {
              const prices = bids.map(bid => {
                const resp = bid.line_item_responses.find(r => r.line_item_id === item.id);
                return resp && resp.availability !== 'unavailable' ? resp.total_price : null;
              });
              const validPrices = prices.filter(p => p !== null);
              const minPrice = validPrices.length ? Math.min(...validPrices) : null;

              return (
                <tr key={item.id} className="group">
                  <th className="sticky left-0 z-10 border-b border-stone-100 bg-white px-4 py-2.5 text-left align-top group-hover:bg-stone-50 transition-colors">
                    <p className="font-semibold text-stone-900 leading-tight">{item.description}</p>
                    <p className="mt-0.5 font-mono text-[10px] text-stone-400">{item.sku}</p>
                    <p className="mt-0.5 text-[10px] text-stone-500">{item.quantity} {item.unit}</p>
                  </th>
                  {bids.map((bid, bidIdx) => {
                    const resp = bid.line_item_responses.find(r => r.line_item_id === item.id);
                    const unavail = !resp || resp.availability === 'unavailable';
                    const isMin = !unavail && resp.total_price === minPrice && validPrices.length > 1;
                    return (
                      <td key={bid.id} className={`border-b border-l border-stone-100 px-3 py-2.5 text-right align-top
                        ${unavail ? 'bg-stone-50' : isMin ? 'bg-teal-50' : ''}`}>
                        {unavail ? (
                          <span className="text-stone-300">—</span>
                        ) : (
                          <>
                            <p className={`font-bold ${isMin ? 'text-teal-700' : 'text-stone-900'}`}>{fmtK(resp.total_price)}</p>
                            <p className="mt-0.5 text-stone-400">{fmtK(resp.unit_price)}/{item.unit}</p>
                            <p className={`mt-0.5 font-medium ${resp.availability === 'can_source' ? 'text-amber-600' : 'text-stone-400'}`}>
                              {resp.availability === 'can_source' ? 'Needs sourcing' : `${resp.lead_time_days}d`}
                            </p>
                          </>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {/* Totals */}
            <tr className="bg-stone-50 font-semibold">
              <th className="sticky left-0 z-10 border-t border-stone-200 bg-stone-100 px-4 py-2.5 text-left text-[10px] uppercase tracking-wider text-stone-500">Total</th>
              {bids.map(bid => {
                const prices = bids.map(b => b.total_price);
                const isMin = bid.total_price === Math.min(...prices);
                return (
                  <td key={bid.id} className={`border-l border-t border-stone-200 px-3 py-2.5 text-right ${isMin ? 'bg-teal-50 text-teal-700' : 'text-stone-900'}`}>
                    <p className="text-sm font-bold">{fmtK(bid.total_price)}</p>
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BidDetailModal({ bid, rfq, bids, onClose }) {
  if (!bid) return null;
  const fullBids = bids.filter(b => !b.fulfillment_summary?.partial && (b.fulfillment_summary?.coverage_ratio ?? 1) >= 1);
  const isLowest = fullBids.sort((a, b) => a.total_price - b.total_price)[0]?.id === bid.id;
  const isFastest = [...bids].sort((a, b) => a.lead_time_days - b.lead_time_days)[0]?.id === bid.id;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 p-4" onClick={onClose}>
      <div className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-stone-200 px-6 py-5">
          <div>
            <h3 className="text-lg font-semibold text-stone-950">{bid.vendor_name}</h3>
            <div className="mt-1 flex items-center gap-2">
              {isLowest && <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-700">★ Lowest complete bid</span>}
              {isFastest && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">⚡ Fastest</span>}
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-semibold text-stone-600 hover:bg-stone-50">Close</button>
        </div>
        <div className="grid grid-cols-3 gap-3 p-5">
          <div className="rounded-xl bg-stone-50 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">Total</p>
            <p className="mt-1 text-2xl font-bold text-stone-950">{fmtK(bid.total_price)}</p>
          </div>
          <div className="rounded-xl bg-stone-50 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">Lead Time</p>
            <p className="mt-1 text-2xl font-bold text-stone-950">{bid.lead_time_days}d</p>
          </div>
          <div className="rounded-xl bg-stone-50 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">Coverage</p>
            <p className="mt-1 text-2xl font-bold text-stone-950">{Math.round((bid.fulfillment_summary?.coverage_ratio ?? 1) * 100)}%</p>
          </div>
        </div>
        <div className="border-t border-stone-100 px-5 pb-2">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">
                <th className="py-2 text-left">Item</th>
                <th className="py-2 text-right">Unit $</th>
                <th className="py-2 text-right">Total</th>
                <th className="py-2 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {rfq.line_items.map(item => {
                const resp = bid.line_item_responses.find(r => r.line_item_id === item.id);
                const unavail = !resp || resp.availability === 'unavailable';
                return (
                  <tr key={item.id}>
                    <td className="py-2 font-medium text-stone-900">{item.description}</td>
                    <td className="py-2 text-right text-stone-700">{unavail ? '—' : fmtK(resp.unit_price)}</td>
                    <td className="py-2 text-right font-semibold text-stone-950">{unavail ? '—' : fmtK(resp.total_price)}</td>
                    <td className="py-2 text-right">
                      {unavail
                        ? <span className="rounded bg-red-100 px-1.5 text-red-700">N/A</span>
                        : resp.availability === 'can_source'
                          ? <span className="rounded bg-amber-50 px-1.5 text-amber-700">Source</span>
                          : <span className="rounded bg-teal-50 px-1.5 text-teal-700">Stock</span>
                      }
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {bid.source !== 'email' && (
          <div className="border-t border-stone-100 p-5">
            <button className="w-full rounded-xl bg-stone-950 py-2.5 text-sm font-semibold text-white hover:bg-stone-800 transition-colors">
              Award PO to {bid.vendor_name}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function V3KanbanDashboard({ tweaks }) {
  const bids = window.MOCK_BIDS;
  const rfq = window.MOCK_RFQ;
  const project = window.MOCK_PROJECT;
  const [positions, setPositions] = useState(() =>
    Object.fromEntries(bids.map(b => [b.id, b.buyer_decision_status]))
  );
  const [dragId, setDragId] = useState(null);
  const [overLane, setOverLane] = useState(null);
  const [skuOpen, setSkuOpen] = useState(false);
  const [detailBid, setDetailBid] = useState(null);

  function getBidsForLane(laneId) {
    return bids.filter(b => (positions[b.id] ?? null) === laneId);
  }

  function handleDrop(laneId) {
    if (!dragId) return;
    setPositions(prev => ({ ...prev, [dragId]: laneId }));
    setDragId(null);
    setOverLane(null);
  }

  const preferredBids = getBidsForLane('preferred');
  const fullCoverPreferred = preferredBids.filter(b => !b.fulfillment_summary?.partial && (b.fulfillment_summary?.coverage_ratio ?? 1) >= 1);

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

          <main className={`flex flex-col overflow-hidden bg-[radial-gradient(circle_at_top_left,#ccfbf1_0,transparent_28rem),linear-gradient(180deg,#fafaf9_0,#f3f0e8_100%)] transition-all`}
            style={{ height: 'calc(100vh - 56px)' }}>
            <div className="flex-none px-5 pt-4 pb-3">
              <nav className="mb-3 flex items-center gap-1.5 text-xs text-stone-400">
                <span className="cursor-pointer hover:text-stone-600">Projects</span>
                <span>/</span>
                <span className="cursor-pointer hover:text-stone-600">{project.name}</span>
                <span>/</span>
                <span className="font-medium text-stone-700">{rfq.title}</span>
              </nav>

              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-lg font-semibold tracking-tight text-stone-950">{rfq.title}</h1>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span className="rounded bg-stone-900 px-1.5 py-0.5 text-[10px] font-semibold text-white">RFQ</span>
                    <span className="rounded border border-teal-200 bg-teal-50 px-1.5 py-0.5 text-[10px] font-semibold text-teal-700">Active</span>
                    <span className="text-[10px] text-stone-400">Deadline: {rfq.bid_deadline}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSkuOpen(!skuOpen)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold shadow-sm transition-colors
                      ${skuOpen ? 'border-teal-300 bg-teal-50 text-teal-700' : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'}`}
                  >
                    {skuOpen ? 'Hide' : 'Show'} SKU comparison ↕
                  </button>
                </div>
              </div>

              {/* Award nudge */}
              {fullCoverPreferred.length === 1 && (
                <div className="mt-3 flex items-center gap-3 rounded-xl border border-teal-200 bg-teal-50 px-4 py-2.5">
                  <div className="h-2 w-2 rounded-full bg-teal-500 animate-pulse" />
                  <p className="text-xs font-semibold text-teal-800">
                    Ready to award: <span className="font-bold">{fullCoverPreferred[0].vendor_name}</span> — {fmtK(fullCoverPreferred[0].total_price)} · {fullCoverPreferred[0].lead_time_days}d
                  </p>
                  <button className="ml-auto rounded-lg bg-teal-600 px-3 py-1 text-xs font-bold text-white hover:bg-teal-700 transition-colors">
                    Award PO
                  </button>
                </div>
              )}

              <nav className="mt-3 flex gap-1.5 rounded-xl border border-stone-200 bg-white p-1.5 shadow-sm w-fit">
                {['Bid Comparison', 'Mailbox & Quote Sync', 'Purchase Order'].map((tab, i) => (
                  <button key={tab} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors
                    ${i === 0 ? 'bg-stone-950 text-white' : 'text-stone-500 hover:bg-stone-100'}`}>{tab}</button>
                ))}
              </nav>
            </div>

            {/* Kanban board */}
            <div className="flex flex-1 gap-3 overflow-x-auto overflow-y-hidden px-5 pb-4" style={{ paddingBottom: skuOpen ? '56vh' : undefined }}>
              {LANES.map(lane => {
                const laneBids = getBidsForLane(lane.id);
                const isOver = overLane === lane.id;
                return (
                  <div
                    key={String(lane.id)}
                    className={`flex h-full w-64 shrink-0 flex-col rounded-2xl border transition-all
                      ${isOver ? `${lane.light} ${lane.border} ring-2 ${lane.border.replace('border', 'ring')}` : `${lane.light} ${lane.border}`}`}
                    onDragOver={e => { e.preventDefault(); setOverLane(lane.id); }}
                    onDragLeave={() => setOverLane(null)}
                    onDrop={() => handleDrop(lane.id)}
                  >
                    {/* Lane header */}
                    <div className="flex-none px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className={`h-2.5 w-2.5 rounded-full ${lane.color}`} />
                        <p className={`text-xs font-bold ${lane.text}`}>{lane.label}</p>
                        <span className={`ml-auto rounded-full ${lane.light} border ${lane.border} px-2 py-0.5 text-[10px] font-bold ${lane.text}`}>
                          {laneBids.length}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[10px] text-stone-400">{lane.desc}</p>
                    </div>

                    {/* Cards */}
                    <div className="flex-1 space-y-3 overflow-y-auto px-3 pb-3">
                      {laneBids.map(bid => (
                        <KanbanCard key={bid.id} bid={bid} bids={bids} lane={lane}
                          onDragStart={setDragId}
                          onOpenDetail={setDetailBid}
                          tweaks={tweaks} />
                      ))}
                      {laneBids.length === 0 && (
                        <div className={`flex h-20 items-center justify-center rounded-xl border-2 border-dashed ${lane.border} text-[10px] text-stone-400`}>
                          Drop vendor here
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </main>
        </div>
      </div>

      {/* SKU comparison drawer */}
      <SkuDrawer rfq={rfq} bids={bids} open={skuOpen} onClose={() => setSkuOpen(false)} />

      {/* Detail modal */}
      {detailBid && <BidDetailModal bid={detailBid} rfq={rfq} bids={bids} onClose={() => setDetailBid(null)} />}
    </div>
  );
}

Object.assign(window, { V3KanbanDashboard });
