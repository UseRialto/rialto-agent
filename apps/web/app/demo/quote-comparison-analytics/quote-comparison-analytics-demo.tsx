'use client'

import { useEffect, useMemo } from 'react'
import { Bot, Lightbulb, MessageSquareText } from 'lucide-react'
import { BidDashboard } from '@/app/contractor/projects/[projectId]/rfqs/[rfqId]/_components/BidDashboard'
import { normalizeComparisonSheetView, type ComparisonSheetView } from '@/lib/procurement/comparison-sheet-state'
import type { ContractorBid, ContractorRFQ } from '@/lib/types/contractor'

interface QuoteComparisonAnalyticsDemoProps {
  rfq: ContractorRFQ
  bids: ContractorBid[]
  initialView: ComparisonSheetView
}

export function QuoteComparisonAnalyticsDemo({ rfq, bids, initialView }: QuoteComparisonAnalyticsDemoProps) {
  const storageKey = useMemo(() => `rialto:comparison-view:demo-user:${rfq.id}`, [rfq.id])

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(normalizeComparisonSheetView(initialView)))
  }, [initialView, storageKey])

  const openAssistant = (prompt?: string) => {
    window.dispatchEvent(new CustomEvent('rialto:bid-comparison-assistant', {
      detail: { open: true, prompt },
    }))
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Local demo</p>
            <h1 className="text-xl font-semibold text-slate-950">Building 14 Quote Comparison</h1>
            <p className="mt-1 text-sm text-slate-600">120 items · 4 vendors · analytics flags seeded from the wide quote fixture</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => openAssistant()}
              className="inline-flex items-center gap-2 rounded-md bg-[#1e3a2f] px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#2d5a49]"
            >
              <Bot className="h-4 w-4" />
              AI Assistant
            </button>
            <button
              type="button"
              onClick={() => openAssistant('summary')}
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-100"
            >
              <MessageSquareText className="h-4 w-4" />
              Ask summary
            </button>
          </div>
        </div>
        <div className="mx-auto flex max-w-[1800px] items-center gap-2 px-4 pb-3 text-xs text-slate-600">
          <Lightbulb className="h-4 w-4 text-purple-600" />
          Purple cells include hover reasoning for suspected pricing mistakes, alongside alternates and spec issues in the normal comparison sheet.
        </div>
      </div>
      <BidDashboard
        projectId="project-building-14-demo"
        projectName="Building 14"
        rfq={rfq}
        bids={bids}
        demoMode
        section="comparison"
        userKey="demo-user"
      />
    </main>
  )
}
