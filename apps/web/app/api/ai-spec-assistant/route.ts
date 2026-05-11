import { NextRequest, NextResponse } from 'next/server'
import { generateSpecAssistantOutput } from '@/lib/ai/request-authoring'
import type { ProcurementLineItemAttribute } from '@/lib/types/procurement'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      requestType?: 'rfq' | 'rfp'
      category?: string
      projectName?: string
      selectedSpec?: string
      lineItems?: Array<{
        description: string
        quantity?: number
        unit?: string
        specs?: string
        constraints?: string
        attributes?: ProcurementLineItemAttribute[]
      }>
      pmQuestion?: string
    }

    const result = await generateSpecAssistantOutput(body)
    return NextResponse.json(result)
  } catch (error) {
    console.error('AI spec assistant failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate spec assistant output.' },
      { status: 500 },
    )
  }
}
