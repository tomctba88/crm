export default function RelatoriosPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-2">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-600">
            Central de relatórios
          </p>
          <h1 className="text-3xl font-black text-slate-900">
            Relatórios
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Escolha abaixo o painel que deseja visualizar.
          </p>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <a
          href="/relatorios/comercial"
          className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-emerald-600">
            Comercial
          </p>
          <h2 className="mt-2 text-2xl font-black text-slate-900">
            Dashboard Comercial
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Indicadores de vendas, ticket médio, conversão e performance geral.
          </p>
        </a>

        <a
          href="/relatorios/marketing"
          className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-orange-600">
            Marketing
          </p>
          <h2 className="mt-2 text-2xl font-black text-slate-900">
            Marketing Geral
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Leads, orçamentos, pedidos e desempenho por canal de origem.
          </p>
        </a>

        <a
          href="/relatorios/marketing/google"
          className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-blue-600">
            Google
          </p>
          <h2 className="mt-2 text-2xl font-black text-slate-900">
            Marketing Google
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Painel específico para leads e resultados vindos do Google.
          </p>
        </a>

        <a
          href="/relatorios/marketing/organico-retorno"
          className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-emerald-600">
            Orgânico / Retorno
          </p>
          <h2 className="mt-2 text-2xl font-black text-slate-900">
            Marketing Orgânico / Retorno
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Leads e resultados vindos de recompra, indicação, retorno e orgânico.
          </p>
        </a>
      </section>
    </div>
  )
}