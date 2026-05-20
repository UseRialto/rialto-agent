import Image from 'next/image'
import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f7f2ec] text-[#17382f]">
      <section className="relative overflow-hidden bg-[#17382f] text-white">
        <div className="mx-auto flex min-h-[86vh] max-w-7xl flex-col justify-between px-6 py-8 sm:px-10 lg:px-14">
          <header className="flex items-center justify-between gap-6">
            <Link href="/" className="flex items-center gap-3" aria-label="Rialto home">
              <Image
                src="/Rialto_Icon_CLEAR.png"
                alt=""
                width={40}
                height={40}
                priority
                className="h-10 w-10"
              />
              <span className="font-serif text-2xl font-semibold tracking-normal">Rialto</span>
            </Link>
            <Link
              href="/app"
              className="rounded-full border border-white/25 px-4 py-2 text-sm font-semibold text-white transition hover:border-white hover:bg-white hover:text-[#17382f]"
            >
              Open app
            </Link>
          </header>

          <div className="grid items-end gap-10 py-16 lg:grid-cols-[1.08fr_0.92fr]">
            <div className="max-w-3xl">
              <p className="mb-5 font-mono text-xs font-medium uppercase text-[#ffb071]">
                Construction procurement
              </p>
              <h1 className="text-5xl font-semibold leading-[1.04] text-white sm:text-6xl lg:text-7xl">
                Quote requests, responses, and comparisons in one calm workflow.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-white/78">
                Rialto helps estimators request material quotes, collect vendor responses, and compare bids without
                rebuilding the same spreadsheet every time.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Link
                  href="/app"
                  className="rounded-full bg-[#fa6b04] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#ff7f22]"
                >
                  Launch Rialto
                </Link>
                <a
                  href="mailto:hello@userialto.com"
                  className="rounded-full border border-white/25 px-6 py-3 text-sm font-bold text-white transition hover:border-white hover:bg-white/10"
                >
                  Contact us
                </a>
              </div>
            </div>

            <div className="rounded-lg border border-white/14 bg-white p-4 text-[#17382f] shadow-2xl shadow-black/20">
              <div className="rounded-md border border-[#e3ddd4] bg-[#fbfaf8] p-5">
                <div className="mb-5 flex items-center justify-between border-b border-[#e3ddd4] pb-4">
                  <div>
                    <p className="text-sm font-bold">Bid comparison</p>
                    <p className="text-xs text-[#60756d]">Acoustic panels package</p>
                  </div>
                  <span className="rounded-full bg-[#dff4e8] px-3 py-1 text-xs font-bold text-[#1f6b45]">Live</span>
                </div>
                <div className="space-y-3">
                  {[
                    ['Vendor', 'Total', 'Coverage'],
                    ['Northline Supply', '$48,920', '100%'],
                    ['Metro Interiors', '$51,180', '94%'],
                    ['Acme Building', '$52,440', '100%'],
                  ].map((row) => (
                    <div
                      key={row.join('-')}
                      className="grid grid-cols-3 gap-3 rounded-md bg-white px-4 py-3 text-sm shadow-sm ring-1 ring-[#eee6dc]"
                    >
                      {row.map((cell) => (
                        <span key={cell} className={row[0] === 'Vendor' ? 'font-bold text-[#60756d]' : 'font-medium'}>
                          {cell}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white px-6 py-16 sm:px-10 lg:px-14">
        <div className="mx-auto grid max-w-7xl gap-6 md:grid-cols-3">
          {[
            ['Request quotes', 'Build RFQs from files or manual line items, then send clean vendor outreach.'],
            ['Collect responses', 'Capture mailbox replies, magic-link submissions, and uploaded quote files.'],
            ['Compare clearly', 'Turn messy vendor pricing into a reviewable comparison sheet.'],
          ].map(([title, body]) => (
            <article key={title} className="rounded-lg border border-[#e3ddd4] p-6">
              <h2 className="text-2xl font-semibold">{title}</h2>
              <p className="mt-3 leading-7 text-[#556b62]">{body}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}
