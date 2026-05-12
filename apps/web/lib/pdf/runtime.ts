let pdfRuntimeReady: Promise<void> | undefined

export async function ensurePdfRuntime() {
  pdfRuntimeReady ??= (async () => {
    const canvas = await import('@napi-rs/canvas')
    const globalWithCanvas = globalThis as Record<string, unknown>

    globalWithCanvas.DOMMatrix ??= canvas.DOMMatrix
    globalWithCanvas.DOMPoint ??= canvas.DOMPoint
    globalWithCanvas.DOMRect ??= canvas.DOMRect
    globalWithCanvas.ImageData ??= canvas.ImageData
    globalWithCanvas.Path2D ??= canvas.Path2D
  })()

  await pdfRuntimeReady
}

export async function loadPdfJs() {
  await ensurePdfRuntime()
  const [pdfjs, pdfjsWorker] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.mjs'),
  ])
  ;(globalThis as typeof globalThis & { pdfjsWorker?: typeof pdfjsWorker }).pdfjsWorker = pdfjsWorker
  return pdfjs
}
