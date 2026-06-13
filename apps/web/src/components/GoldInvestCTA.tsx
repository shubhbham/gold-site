import { INVEST_OPTIONS } from "../lib/site-invest";

export default function GoldInvestCTA({ countryCode }: { countryCode: string }) {
  const cards = INVEST_OPTIONS[countryCode] ?? INVEST_OPTIONS.IN;

  return (
    <section className="rounded-4xl border border-gray-200 bg-white p-6 shadow-[0_24px_80px_-44px_rgba(17,24,39,0.3)] md:p-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-amber-700">Investment options</p>
          <h2 className="mt-2 text-3xl font-semibold text-gray-950">Different ways to get gold exposure.</h2>
        </div>
        <p className="max-w-xl text-sm leading-7 text-gray-600">
          Compare the daily benchmark here first, then decide whether physical jewellery, listed products, or structured savings tools fit your goal and holding period.
        </p>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {cards.map((card) => (
          <a
            key={card.title}
            href={card.href}
            target="_blank"
            rel="noreferrer"
            className="rounded-3xl border border-amber-100 bg-[linear-gradient(180deg,rgba(255,251,235,0.95),#ffffff)] p-5 transition hover:-translate-y-0.5 hover:border-amber-300"
          >
            <h3 className="text-lg font-semibold text-gray-950">{card.title}</h3>
            <p className="mt-3 text-sm leading-7 text-gray-600">{card.copy}</p>
            <span className="mt-4 inline-flex text-sm font-semibold text-amber-700">Learn more</span>
          </a>
        ))}
      </div>
    </section>
  );
}