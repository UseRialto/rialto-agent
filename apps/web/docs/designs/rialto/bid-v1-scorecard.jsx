
// V1: Scorecard Command Center
// Each vendor gets a card with score ring, key metrics, and a decision strip.
// The SKU table lives in a slide-over drawer.

const { useState, useMemo } = React;

function fmtPrice(n) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return `$${n.toLocaleString()}`;
}

function relTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  return 'just now';
}

const DECISION_CONFIG = {
  preferred:   { label: 'Preferred',   bg: 'bg-teal-600',   text: 'text-white',        ring: 'ring-teal-600' },
  alternate:   { label: 'Alternate',   bg: 'bg-stone-700',  text: 'text-white',        ring: 'ring-stone-700' },
  hold:        { label: 'Hold',        bg: 'bg-amber-500',  text: 'text-stone-950',    ring: 'ring-amber-500' },
  do_not_use:  { label: 'Pass',        bg: 'bg-red-100',    text: 'text-red-700',      ring: 'ring-red-300' },
};

function ScoreRing({ score, size = 56 }) {
  const r = (size / 2) - 5;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = score >= 80 ? '#0d9488' : score >= 60 ? '#d97706' : '#e11d48';
  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e7e5e4" strokeWidth="4" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="4"
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle"
        className="rotate-90" style={{ fontSize: size * 0.22, fontWeight: 700, fill: color, transform: `rotate(90deg) translate(0, 0)` }}
      />
    </svg>
  );
}

function ScoreRingLabel({ score, size = 56 }) {
  const r = (size / 2) - 5;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = score >= 80 ? '#0d9488' : score >= 60 ? '#d97706' : '#e11d48';
  return (
    <svg width={size} height={size} className="shrink-0">
      <g transform={`rotate(-90, ${size/2}, ${size/2})`}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e7e5e4" strokeWidth="4.5" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="4.5"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
      </g>
      <text x="50%" y="50%" textAnchor="middle" dy="0.35em"
        style={{ fontSize: size * 0.26, fontWeight: 700, fill: color, fontFamily: 'inherit' }}
      >{score}</text>
    </svg>
  );
}

function computeScore(bid, bids) {
  const allPrices = bids.map(b => b.total_price);
  const minPrice = Math.min(...allPrices);
  const maxPrice = Math.max(...allPrices);
  const allLeads = bids.map(b => b.lead_time_days);
  const minLead = Math.min(...allLeads);
  const maxLead = Math.max(...allLeads);
  const coverage = bid.fulfillment_summary?.coverage_ratio ?? 1;
  const priceScore = maxPrice === minPrice ? 100 : ((maxPrice - bid.total_price) / (maxPrice - minPrice)) * 100;
  const leadScore = maxLead === minLead ? 100 : ((maxLead - bid.lead_time_days) / (maxLead - minLead)) * 100;
  const coverageScore = coverage * 100;
  const riskPenalty = (bid.risk_flags?.length ?? 0) * 8;
  return Math.round(Math.min(100, (priceScore * 0.45 + leadScore * 0.30 + coverageScore * 0.25) - riskPenalty));
}

function SourceBadge({ bid }) {
  if (bid.source === 'email') return <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-500">Email</span>;
  if (bid.source === 'magic_form') return <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-semibold text-teal-700">Magic Form</span>;
  if (bid.is_invited) return <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Invited</span>;
  return <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-500">Marketplace</span>;
}

function CoverageBar({ ratio }) {
  const pct = Math.min(100, Math.round(ratio * 100));
  const color = pct === 100 ? 'bg-teal-500' : pct >= 70 ? 'bg-amber-400' : 'bg-red-400';
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-100">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-9 text-right text-xs font-semibold text-stone-600">{pct}%</span>
    </div>
  );
}

function DecisionButton({ status, active, onClick }) {
  const cfg = DECISION_CONFIG[status];
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-lg border py-1.5 text-xs font-semibold transition-all
        ${active ? `${cfg.bg} ${cfg.text} border-transparent shadow-sm` : 'border-stone-200 text-stone-500 hover:border-stone-300 hover:text-stone-700'}`}
    >
      {cfg.label}
    </button>
  );
}

function BidCard({ bid, bids, onOpenDrawer, tweaks }) {
  const [decision, setDecision] = useState(bid.buyer_decision_status);
  const score = computeScore(bid, bids);
  const cfg = decision ? DECISION_CONFIG[decision] : null;
  const lowestFull = bids.filter(b => !b.fulfillment_summary?.partial && (b.fulfillment_summary?.coverage_ratio ?? 1) >= 1)
    .sort((a, b) => a.total_price - b.total_price)[0];
  const isLowest = lowestFull?.id === bid.id;
  const isFastest = bids.slice().sort((a, b) => a.lead_time_days - b.lead_time_days)[0]?.id === bid.id;
  const isPartial = bid.fulfillment_summary?.partial;
  const coverage = bid.fulfillment_summary?.coverage_ratio ?? 1;

  return (
    <div className={`relative flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg
      ${decision === 'preferred' ? 'border-teal-300 ring-1 ring-teal-200' : 'border-stone-200'}`}
    >
      {/* Status bar top */}
      <div className={`h-1 w-full ${
        decision === 'preferred' ? 'bg-teal-500' :
        decision === 'alternate' ? 'bg-stone-600' :
        decision === 'hold' ? 'bg-amber-400' :
        decision === 'do_not_use' ? 'bg-red-300' :
        'bg-stone-200'}`}
      />

      <div className="flex flex-col gap-4 p-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-stone-950 leading-tight">{bid.vendor_name}</h3>
              {isLowest && <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-700 ring-1 ring-teal-200">★ Best Value</span>}
              {isFastest && !isLowest && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 ring-1 ring-amber-200">⚡ Fastest</span>}
              {isPartial && <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-bold text-orange-600 ring-1 ring-orange-200">Partial</span>}
            </div>
            <div className="mt-1 flex items-center gap-2">
              <SourceBadge bid={bid} />
              {bid.designer_name && <span className="text-xs text-stone-400">{bid.designer_name}</span>}
              <span className="text-xs text-stone-400">{relTime(bid.submitted_at)}</span>
            </div>
          </div>
          <ScoreRingLabel score={score} size={tweaks.compactCards ? 44 : 52} />
        </div>

        {/* Key metrics */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-stone-50 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">Total</p>
            <p className={`mt-1 text-lg font-bold leading-none ${isPartial ? 'text-amber-700' : 'text-stone-950'}`}>{fmtPrice(bid.total_price)}</p>
            {isPartial && <p className="mt-0.5 text-[10px] text-amber-600">Partial bid</p>}
          </div>
          <div className="rounded-xl bg-stone-50 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">Lead Time</p>
            <p className={`mt-1 text-lg font-bold leading-none ${isFastest ? 'text-amber-700' : 'text-stone-950'}`}>{bid.lead_time_days}d</p>
            <p className="mt-0.5 text-[10px] text-stone-400">days</p>
          </div>
          <div className="rounded-xl bg-stone-50 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">Coverage</p>
            <p className={`mt-1 text-lg font-bold leading-none ${coverage < 1 ? 'text-orange-600' : 'text-teal-700'}`}>{Math.round(coverage * 100)}%</p>
            <p className="mt-0.5 text-[10px] text-stone-400">{bid.line_item_responses.filter(r => r.availability !== 'unavailable').length}/{bid.line_item_responses.length} items</p>
          </div>
        </div>

        {/* Coverage bar */}
        <CoverageBar ratio={coverage} />

        {/* Terms row */}
        {tweaks.showTerms && bid.terms?.payment_terms && (
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-stone-200 px-2.5 py-1 text-[10px] font-medium text-stone-500">{bid.terms.payment_terms}</span>
            {bid.terms.deposit_terms && <span className="rounded-full border border-stone-200 px-2.5 py-1 text-[10px] font-medium text-stone-500">{bid.terms.deposit_terms}</span>}
            {bid.terms.shipping_terms && <span className="rounded-full border border-stone-200 px-2.5 py-1 text-[10px] font-medium text-stone-500">{bid.terms.shipping_terms}</span>}
          </div>
        )}

        {/* Compliance & risk */}
        {(bid.compliance_declarations?.length > 0 || bid.risk_flags?.length > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {bid.compliance_declarations?.map(d => (
              <span key={d.code} className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-semibold text-teal-700">{d.label}</span>
            ))}
            {bid.risk_flags?.map(f => (
              <span key={f.code} className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">⚠ {f.label}</span>
            ))}
          </div>
        )}

        {/* Decision strip */}
        <div className="flex gap-1.5 pt-1">
          {Object.keys(DECISION_CONFIG).map(status => (
            <DecisionButton key={status} status={status} active={decision === status}
              onClick={() => setDecision(decision === status ? null : status)} />
          ))}
        </div>

        {/* View details */}
        <button
          onClick={() => onOpenDrawer(bid)}
          className="mt-1 w-full rounded-xl border border-stone-200 py-2 text-xs font-semibold text-stone-600 transition-colors hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700"
        >
          View line items →
        </button>
      </div>
    </div>
  );
}

function LineItemDrawer({ bid, rfq, onClose }) {
  if (!bid) return null;
  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="flex-1 bg-stone-950/40" />
      <aside
        className="flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-stone-200 px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Line Items</p>
            <h3 className="mt-1 text-xl font-semibold text-stone-950">{bid.vendor_name}</h3>
            <p className="mt-1 text-sm text-stone-500">{fmtPrice(bid.total_price)} · {bid.lead_time_days}d lead</p>
          </div>
          <button onClick={onClose} className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-semibold text-stone-600 hover:bg-stone-50">Close</button>
        </div>
        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-stone-50 text-xs font-semibold uppercase tracking-wider text-stone-400">
              <tr>
                <th className="px-5 py-3 text-left">Item</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-right">Unit $</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">Lead</th>
                <th className="px-4 py-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {rfq.line_items.map(item => {
                const resp = bid.line_item_responses.find(r => r.line_item_id === item.id);
                const unavail = resp?.availability === 'unavailable';
                return (
                  <tr key={item.id} className={unavail ? 'bg-red-50' : ''}>
                    <td className="px-5 py-3">
                      <p className="font-semibold text-stone-900">{item.description}</p>
                      <p className="mt-0.5 font-mono text-[10px] text-stone-400">{item.sku}</p>
                    </td>
                    <td className="px-4 py-3 text-right text-stone-600">{item.quantity} {item.unit}</td>
                    <td className="px-4 py-3 text-right font-semibold text-stone-800">{resp && !unavail ? fmtPrice(resp.unit_price) : '—'}</td>
                    <td className="px-4 py-3 text-right font-bold text-stone-950">{resp && !unavail ? fmtPrice(resp.total_price) : '—'}</td>
                    <td className="px-4 py-3 text-right text-stone-600">{resp && !unavail ? `${resp.lead_time_days}d` : '—'}</td>
                    <td className="px-4 py-3">
                      {unavail
                        ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">Unavailable</span>
                        : resp?.availability === 'can_source'
                          ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Needs sourcing</span>
                          : <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-semibold text-teal-700">In stock</span>
                      }
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* Summary footer */}
        <div className="border-t border-stone-200 bg-stone-50 px-6 py-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-stone-600">Total</span>
            <span className="text-xl font-bold text-stone-950">{fmtPrice(bid.total_price)}</span>
          </div>
          {bid.source !== 'email' && (
            <button className="mt-3 w-full rounded-xl bg-stone-950 py-2.5 text-sm font-semibold text-white hover:bg-stone-800 transition-colors">
              Award PO to {bid.vendor_name}
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}

function SummaryBar({ bids, tweaks }) {
  const fullBids = bids.filter(b => !b.fulfillment_summary?.partial && (b.fulfillment_summary?.coverage_ratio ?? 1) >= 1);
  const lowest = fullBids.sort((a, b) => a.total_price - b.total_price)[0];
  const fastest = bids.slice().sort((a, b) => a.lead_time_days - b.lead_time_days)[0];
  const completePct = Math.round((fullBids.length / bids.length) * 100);
  return (
    <div className="mb-6 grid grid-cols-4 gap-3">
      {[
        { label: 'Bids received', value: bids.length, sub: `${fullBids.length} complete`, accent: 'text-stone-950' },
        { label: 'Lowest complete', value: lowest ? fmtPrice(lowest.total_price) : 'None', sub: lowest?.vendor_name ?? 'No full bid', accent: 'text-teal-700' },
        { label: 'Fastest lead', value: `${fastest?.lead_time_days}d`, sub: fastest?.vendor_name, accent: 'text-amber-700' },
        { label: 'Full coverage', value: `${completePct}%`, sub: `${fullBids.length}/${bids.length} vendors`, accent: 'text-stone-700' },
      ].map(item => (
        <div key={item.label} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">{item.label}</p>
          <p className={`mt-1.5 text-2xl font-bold ${item.accent}`}>{item.value}</p>
          <p className="mt-0.5 truncate text-xs text-stone-500">{item.sub}</p>
        </div>
      ))}
    </div>
  );
}

function V1ScorecardDashboard({ tweaks }) {
  const bids = window.MOCK_BIDS;
  const rfq = window.MOCK_RFQ;
  const project = window.MOCK_PROJECT;
  const [drawerBid, setDrawerBid] = useState(null);
  const [sortBy, setSortBy] = useState('score');

  const sortedBids = useMemo(() => {
    return [...bids].sort((a, b) => {
      if (sortBy === 'score') return computeScore(b, bids) - computeScore(a, bids);
      if (sortBy === 'price') return a.total_price - b.total_price;
      if (sortBy === 'lead') return a.lead_time_days - b.lead_time_days;
      return 0;
    });
  }, [sortBy]);

  const cols = tweaks.compactCards ? 'grid-cols-2 xl:grid-cols-4' : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-2';

  return (
    <div className="flex min-h-screen flex-col bg-[#f7f5f0]">
      {/* App shell sidebar */}
      <div className="flex flex-1">
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
            {[
              { icon: '🏗', label: 'Projects', active: true },
              { icon: '📦', label: 'Track Orders' },
            ].map(item => (
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

        {/* Main content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Top header */}
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
            {/* Breadcrumb */}
            <nav className="mb-4 flex items-center gap-1.5 text-xs text-stone-400">
              <span className="hover:text-stone-600 cursor-pointer">Projects</span>
              <span>/</span>
              <span className="hover:text-stone-600 cursor-pointer">{project.name}</span>
              <span>/</span>
              <span className="font-medium text-stone-700">{rfq.title}</span>
            </nav>

            {/* RFQ Header */}
            <div className="mb-5 flex items-start justify-between">
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-stone-950">{rfq.title}</h1>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="rounded bg-stone-900 px-2 py-0.5 text-[10px] font-semibold text-white">RFQ</span>
                  <span className="rounded border border-teal-200 bg-teal-50 px-2 py-0.5 text-[10px] font-semibold text-teal-700">Active</span>
                  <span className="rounded border border-stone-200 bg-stone-50 px-2 py-0.5 text-[10px] font-medium text-stone-500">{rfq.category}</span>
                  <span className="text-xs text-stone-400">Deadline: {rfq.bid_deadline}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <button className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-600 shadow-sm hover:bg-stone-50">Download PDF</button>
              </div>
            </div>

            {/* Section tabs */}
            <nav className="mb-5 flex gap-1.5 rounded-xl border border-stone-200 bg-white p-1.5 shadow-sm w-fit">
              {['Bid Comparison', 'Mailbox & Quote Sync', 'Purchase Order'].map((tab, i) => (
                <button key={tab} className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition-colors
                  ${i === 0 ? 'bg-stone-950 text-white' : 'text-stone-500 hover:bg-stone-100'}`}>{tab}</button>
              ))}
            </nav>

            {/* Summary bar */}
            <SummaryBar bids={bids} tweaks={tweaks} />

            {/* Sort controls */}
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-stone-950">
                Bids Received <span className="ml-1 text-sm font-normal text-stone-400">({bids.length})</span>
              </h2>
              <div className="flex items-center gap-2">
                <span className="text-xs text-stone-400">Sort by</span>
                <div className="flex rounded-lg border border-stone-200 bg-white p-0.5">
                  {[['score', 'Score'], ['price', 'Price'], ['lead', 'Lead time']].map(([val, lbl]) => (
                    <button key={val} onClick={() => setSortBy(val)}
                      className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${sortBy === val ? 'bg-stone-950 text-white' : 'text-stone-500 hover:text-stone-800'}`}>
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Bid cards grid */}
            <div className={`grid gap-4 ${cols}`}>
              {sortedBids.map(bid => (
                <BidCard key={bid.id} bid={bid} bids={bids} onOpenDrawer={setDrawerBid} tweaks={tweaks} />
              ))}
            </div>
          </main>
        </div>
      </div>

      {/* Line item drawer */}
      {drawerBid && <LineItemDrawer bid={drawerBid} rfq={rfq} onClose={() => setDrawerBid(null)} />}
    </div>
  );
}

Object.assign(window, { V1ScorecardDashboard });
