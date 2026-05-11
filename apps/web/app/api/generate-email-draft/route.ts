import { NextRequest, NextResponse } from 'next/server'
import { generateVendorOutreachDraft } from '@/lib/ai/request-authoring'

interface LineItem {
  sku?: string
  description: string
  quantity: number
  unit: string
  specs?: string
  certifications?: string[]
  notes?: string
  contractor_budget?: number
  suggested_lead_time_days?: number
}

interface GenerateEmailDraftRequest {
  rfqTitle: string
  projectName: string
  projectLocation: string
  items: LineItem[]
  senderName?: string
  bidDeadline?: string
  currentDraft?: string
  refinementPrompt?: string
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as GenerateEmailDraftRequest
    const draft = await generateVendorOutreachDraft(body)
    return NextResponse.json({ draft })
  } catch (error) {
    console.error('Email draft generation failed:', error)
    return NextResponse.json({ error: 'Failed to generate email draft' }, { status: 500 })
  }
}
