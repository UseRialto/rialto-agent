import { redirect } from 'next/navigation'

interface Props {
  params: Promise<{ projectId: string; rfqId: string }>
  searchParams: Promise<{ returnTo?: string }>
}

export default async function RFQResponseRedirect({ params, searchParams }: Props) {
  const { rfqId } = await params
  const { returnTo } = await searchParams
  const dest = returnTo
    ? `/vendor/rfqs/${rfqId}?returnTo=${encodeURIComponent(returnTo)}`
    : `/vendor/rfqs/${rfqId}`
  redirect(dest)
}
