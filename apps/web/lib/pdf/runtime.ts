let pdfRuntimeReady: Promise<void> | undefined

class PdfDOMMatrix {
  a = 1
  b = 0
  c = 0
  d = 1
  e = 0
  f = 0

  scaleSelf(scaleX = 1, scaleY = scaleX) {
    this.a *= scaleX
    this.d *= scaleY
    return this
  }

  translateSelf(x = 0, y = 0) {
    this.e += x
    this.f += y
    return this
  }

  multiplySelf(other: Partial<PdfDOMMatrix>) {
    const a = this.a * (other.a ?? 1) + this.c * (other.b ?? 0)
    const b = this.b * (other.a ?? 1) + this.d * (other.b ?? 0)
    const c = this.a * (other.c ?? 0) + this.c * (other.d ?? 1)
    const d = this.b * (other.c ?? 0) + this.d * (other.d ?? 1)
    const e = this.a * (other.e ?? 0) + this.c * (other.f ?? 0) + this.e
    const f = this.b * (other.e ?? 0) + this.d * (other.f ?? 0) + this.f
    this.a = a
    this.b = b
    this.c = c
    this.d = d
    this.e = e
    this.f = f
    return this
  }
}

class PdfDOMPoint {
  constructor(
    public x = 0,
    public y = 0,
    public z = 0,
    public w = 1,
  ) {}
}

class PdfDOMRect {
  constructor(
    public x = 0,
    public y = 0,
    public width = 0,
    public height = 0,
  ) {}
}

class PdfImageData {
  constructor(
    public data: Uint8ClampedArray,
    public width: number,
    public height: number,
  ) {}
}

class PdfPath2D {}

export async function ensurePdfRuntime() {
  pdfRuntimeReady ??= (async () => {
    const globalWithCanvas = globalThis as Record<string, unknown>

    if (typeof globalWithCanvas.DOMMatrix !== 'function') globalWithCanvas.DOMMatrix = PdfDOMMatrix
    if (typeof globalWithCanvas.DOMPoint !== 'function') globalWithCanvas.DOMPoint = PdfDOMPoint
    if (typeof globalWithCanvas.DOMRect !== 'function') globalWithCanvas.DOMRect = PdfDOMRect
    if (typeof globalWithCanvas.ImageData !== 'function') globalWithCanvas.ImageData = PdfImageData
    if (typeof globalWithCanvas.Path2D !== 'function') globalWithCanvas.Path2D = PdfPath2D
  })()

  await pdfRuntimeReady
}

export async function loadPdfJs() {
  await ensurePdfRuntime()
  const runtimeImport = new Function('specifier', 'return import(specifier)') as <T>(specifier: string) => Promise<T>
  const pdfjs = await runtimeImport<typeof import('pdfjs-dist/legacy/build/pdf.mjs')>('pdfjs-dist/legacy/build/pdf.mjs')
  return pdfjs
}
