const STATS = [
  { value: "8 s", label: "primeira resposta, em média", online: false },
  { value: "72%", label: "resolvidos sem fila", online: false },
  { value: "6", label: "analistas online agora", online: true },
] as const;

export function ShowcasePanel() {
  return (
    <aside className="hidden flex-col justify-between gap-10 bg-ink px-16 pb-12 pt-10 lg:flex lg:w-[55%] lg:max-w-[800px]">
      <div className="flex items-center gap-2.5">
        <div className="flex size-6 items-center justify-center rounded-md bg-brand text-[13px] font-bold text-white">
          N
        </div>
        <span className="text-[17px] font-bold tracking-[-0.2px] text-white">Nexo Assist</span>
      </div>

      <div className="flex flex-col gap-9">
        <div className="flex flex-col gap-[18px]">
          <p className="text-[13.5px] font-medium text-white/55">Service desk de TI da Nexo</p>
          <h1 className="font-serif text-[54px]/[56px] font-normal tracking-[-1.2px] text-white">
            Seu problema de TI, resolvido em uma conversa.
          </h1>
          <p className="max-w-[520px] text-[16px]/[25px] text-white/65">
            Descreva o que está acontecendo. O assistente consulta seus chamados, busca na central de
            ajuda e chama um analista quando precisa.
          </p>
        </div>

        <div className="flex max-w-[520px] flex-col gap-3.5" aria-hidden="true">
          <div className="flex justify-end">
            <div className="rounded-[12px_12px_4px_12px] bg-white px-3.5 py-[9px] text-[13.5px] text-ink">
              Meu notebook não conecta na VPN. Erro 809.
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 text-[12.5px]">
              <span className="font-semibold text-white/80">Nexo Assist</span>
              <span className="text-white/45">consultou seus chamados · criou um chamado</span>
            </div>
            <div className="max-w-[380px] rounded-[4px_12px_12px_12px] bg-white/[0.08] px-3.5 py-2.5 text-[13.5px]/[20px] text-white">
              Pronto: abri o chamado com prioridade alta. Um analista fala com você em até 4 h úteis.
            </div>
            <div className="flex w-fit items-center gap-2 rounded-xl bg-white px-3 py-[7px] text-[12.5px]">
              <span className="size-[7px] rounded-full bg-warn" />
              <span className="font-semibold text-ink">INC-20517</span>
              <span className="text-muted">Rede e VPN · Alta · em até 4 h</span>
            </div>
          </div>
        </div>
      </div>

      <dl className="flex border-t border-white/10 pt-6">
        {STATS.map((stat, index) => (
          <div
            key={stat.label}
            className={`flex flex-1 flex-col gap-1.5 ${index > 0 ? "border-l border-white/10 pl-6" : ""}`}
          >
            <dd className="order-1 flex items-center gap-2 font-serif text-[34px] tracking-[-0.6px] text-white">
              {stat.value}
              {stat.online ? <span className="size-2 rounded-full bg-ok" /> : null}
            </dd>
            <dt className="order-2 text-[13.5px] text-white/55">{stat.label}</dt>
          </div>
        ))}
      </dl>
    </aside>
  );
}
