import { createClient } from '@/lib/supabase/server-client'
import OlistConfigForm from '@/components/financeiro/olist-config-form'
import OlistSyncButton from '@/components/financeiro/olist-sync-button'

export default async function IntegracoesPage() {
  const supabase = await createClient()

  const { data: integracao } = await supabase
    .from('integracoes_olist')
    .select('*')
    .eq('nome', 'olist_tiny')
    .maybeSingle()

  const { data: logs } = await supabase
    .from('logs_integracao')
    .select('*')
    .eq('integracao', 'tiny')
    .order('created_at', { ascending: false })
    .limit(10)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-[#0b1733]">Integrações</h1>
        <p className="mt-2 text-slate-500">
          Conecte sistemas externos para alimentar o Ergotex One com dados operacionais e financeiros.
        </p>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex rounded-full bg-blue-50 px-4 py-2 text-sm font-extrabold uppercase tracking-[0.12em] text-[#1b4fd6]">
              Olist / Tiny ERP
            </div>
            <h2 className="mt-4 text-2xl font-black text-[#0b1733]">Integração com ERP</h2>
            <p className="mt-3 text-slate-600">
              Essa integração traz pedidos, contas a pagar, contas a receber, clientes e notas fiscais para o Ergotex One.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-[#f8fafc] px-4 py-3 text-sm">
            <p className="font-semibold text-slate-500">Status atual</p>
            <p className="mt-1 text-base font-bold text-[#0b1733]">
              {integracao?.status ?? 'nao_configurado'}
            </p>
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl bg-[#eef3fb] p-4">
            <p className="text-sm font-semibold text-slate-500">Integração</p>
            <p className="mt-2 text-lg font-black text-[#0b1733]">Olist / Tiny</p>
          </div>
          <div className="rounded-2xl bg-[#eef3fb] p-4">
            <p className="text-sm font-semibold text-slate-500">Ativa</p>
            <p className="mt-2 text-lg font-black text-[#0b1733]">{integracao?.ativo ? 'Sim' : 'Não'}</p>
          </div>
          <div className="rounded-2xl bg-[#eef3fb] p-4">
            <p className="text-sm font-semibold text-slate-500">Último sync</p>
            <p className="mt-2 text-lg font-black text-[#0b1733]">
              {integracao?.ultimo_sync_em
                ? new Date(integracao.ultimo_sync_em).toLocaleString('pt-BR')
                : 'Nunca executado'}
            </p>
          </div>
          <div className="rounded-2xl bg-[#eef3fb] p-4">
            <p className="text-sm font-semibold text-slate-500">Observações</p>
            <p className="mt-2 text-lg font-black text-[#0b1733]">
              {integracao?.observacoes || 'Sem observações'}
            </p>
          </div>
        </div>
      </div>

      <OlistConfigForm
        tokenInicial={integracao?.token || ''}
        statusInicial={integracao?.status || 'nao_configurado'}
        ativoInicial={integracao?.ativo || false}
        observacoesIniciais={integracao?.observacoes || ''}
      />

      <OlistSyncButton />

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-2xl font-black text-[#0b1733]">Últimos logs da integração</h3>
        <div className="mt-6 space-y-3">
          {logs && logs.length > 0 ? (
            logs.map((log: any) => (
              <div key={log.id} className="rounded-2xl border border-slate-200 bg-[#f8fafc] p-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-500">Integração</p>
                    <p className="text-base font-black text-[#0b1733]">{log.integracao}</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-500">Recurso</p>
                    <p className="text-base font-black text-[#0b1733]">{log.recurso || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-500">Status</p>
                    <p className="text-base font-black text-[#0b1733]">{log.status}</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-500">Data</p>
                    <p className="text-base font-black text-[#0b1733]">
                      {new Date(log.created_at).toLocaleString('pt-BR')}
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-sm text-slate-600">{log.mensagem || 'Sem mensagem'}</p>
              </div>
            ))
          ) : (
            <div className="rounded-2xl bg-[#eef3fb] p-4 text-sm font-medium text-slate-600">
              Ainda não existem logs de sincronização.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
