export default function FinanceiroDashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-[#0b1733]">Dashboard Financeiro</h1>
        <p className="mt-2 text-slate-500">Visão geral do sistema financeiro Ergotex.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-3xl bg-white p-6 shadow-sm border border-slate-200">
          <p className="text-sm font-semibold text-slate-500">Saldo em Caixa</p>
          <p className="mt-4 text-3xl font-black text-[#0b1733]">R$ 0,00</p>
        </div>
        <div className="rounded-3xl bg-white p-6 shadow-sm border border-slate-200">
          <p className="text-sm font-semibold text-slate-500">Contas a Receber</p>
          <p className="mt-4 text-3xl font-black text-[#0b1733]">R$ 0,00</p>
        </div>
        <div className="rounded-3xl bg-white p-6 shadow-sm border border-slate-200">
          <p className="text-sm font-semibold text-slate-500">Contas a Pagar</p>
          <p className="mt-4 text-3xl font-black text-[#0b1733]">R$ 0,00</p>
        </div>
        <div className="rounded-3xl bg-white p-6 shadow-sm border border-slate-200">
          <p className="text-sm font-semibold text-slate-500">Fluxo Projetado</p>
          <p className="mt-4 text-3xl font-black text-[#0b1733]">R$ 0,00</p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-xl font-black text-[#0b1733]">Visão executiva</h3>
          <p className="mt-2 text-slate-500">
            Indicadores financeiros principais: faturamento, EBITDA, margem, capital de giro e ponto de equilíbrio.
          </p>
          <div className="mt-6 rounded-3xl bg-[#eef3fb] p-10 text-center text-slate-500">
            Gráfico principal em desenvolvimento
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-xl font-black text-[#0b1733]">Próximas etapas</h3>
          <div className="mt-6 space-y-3">
            {[
              'Estruturar contas a pagar',
              'Estruturar contas a receber',
              'Criar fluxo de caixa',
              'Criar gestão de indicadores',
            ].map((item) => (
              <div key={item} className="rounded-2xl bg-[#eef3fb] px-4 py-3 text-sm font-medium text-slate-700">
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
