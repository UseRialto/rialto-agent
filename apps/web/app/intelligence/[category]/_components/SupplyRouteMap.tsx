interface Props {
  mapUrl?: string
  category: string
}

export function SupplyRouteMap({ mapUrl, category }: Props) {
  if (mapUrl) {
    // Phase 2: render actual Mapbox map here
    return (
      <div className="overflow-hidden rounded-lg border border-gray-200">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={mapUrl} alt={`${category} supply route map`} className="h-48 w-full object-cover" />
      </div>
    )
  }

  // MVP: placeholder
  return (
    <div className="flex h-44 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50">
      <div className="text-center">
        <p className="text-2xl">🗺</p>
        <p className="mt-1 text-sm font-medium text-gray-500">Supply Route Map</p>
        <p className="text-xs text-gray-400">
          Interactive origin & route visualization - Phase 2
        </p>
        <p className="mt-1 text-xs text-gray-400">
          Shows where materials originate and how they reach your project site
        </p>
      </div>
    </div>
  )
}
