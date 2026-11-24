import "server-only";
import { hojeISO, isoDeData } from "@/lib/formato";
import { acertoPorCampo, custoEstimado, diasEntre, mediana, motivosNaChegada, porSemana, semCorrecao } from "@/lib/metricas";
import { prisma } from "@/server/db";

export const PERIODOS = { "30": "30 dias", "90": "90 dias", tudo: "Tudo" } as const;
export type Periodo = keyof typeof PERIODOS;

export const lerPeriodo = (v: string | string[] | undefined): Periodo => (typeof v === "string" && v in PERIODOS ? (v as Periodo) : "90");

function desde(p: Periodo, hoje: string): Date | null {
  if (p === "tudo") return null;
  const d = new Date(`${hoje}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - Number(p) + 1);
  return d;
}

/** Tudo o que o painel mostra, para o período escolhido (pela data de recebimento). */
export async function getPainel(periodo: Periodo) {
  const hoje = hojeISO();
  const inicio = desde(periodo, hoje);
  const noPeriodo = inicio ? { recebidoEm: { gte: inicio } } : {};

  const [docs, correcoes, recebimentos, alcada, naAlcada] = await Promise.all([
    prisma.documento.findMany({
      where: noPeriodo,
      select: {
        id: true,
        tipo: true,
        status: true,
        recebidoEm: true,
        decididoEm: true,
        motivo: true,
        extracao: { select: { origem: true, modelo: true, tokensEntrada: true, tokensSaida: true, duracaoMs: true } },
      },
    }),
    prisma.correcao.findMany({
      where: { documento: { ...noPeriodo, status: { in: ["APROVADO_AUTO", "APROVADO"] } } },
      select: { documentoId: true, campo: true },
    }),
    // As regras que barraram cada documento NA CHEGADA ficam na auditoria (as violações atuais mudam com as correções).
    prisma.auditoria.findMany({
      where: { acao: "DOCUMENTO_RECEBIDO", entidade: "Documento", ...(inicio ? { em: { gte: new Date(inicio.getTime() - 86_400_000) } } : {}) },
      select: { entidadeId: true, dados: true },
    }),
    prisma.documento.findMany({
      where: { status: "EM_REVISAO", exigeGestor: true },
      orderBy: [{ urgente: "desc" }, { recebidoEm: "asc" }, { criadoEm: "asc" }],
      take: 8,
      select: { id: true, tipo: true, numero: true, valorCentavos: true, vencimento: true, urgente: true, recebidoEm: true, fornecedor: { select: { nome: true } } },
    }),
    prisma.documento.count({ where: { status: "EM_REVISAO", exigeGestor: true } }),
  ]);

  // ---- volume e aprovação automática
  const contar = (...s: string[]) => docs.filter((d) => s.includes(d.status)).length;
  const falhas = contar("FALHA_EXTRACAO");
  const lidos = docs.length - falhas;
  const automaticos = contar("APROVADO_AUTO");
  const status = {
    APROVADO_AUTO: automaticos,
    APROVADO: contar("APROVADO"),
    EM_REVISAO: contar("EM_REVISAO"),
    REJEITADO: contar("REJEITADO"),
    FALHA_EXTRACAO: falhas,
  };
  const semanas = porSemana(docs.map((d) => ({ recebidoEm: isoDeData(d.recebidoEm), status: d.status })));

  // ---- acerto da IA (base: aprovados, o valor final foi conferido)
  const aprovados = docs.flatMap((d) => (d.tipo && (d.status === "APROVADO_AUTO" || d.status === "APROVADO") ? [{ id: d.id, tipo: d.tipo }] : []));
  const campos = acertoPorCampo(aprovados, correcoes);
  const aprovadosSemCorrecao = semCorrecao(aprovados, correcoes);

  // ---- motivos na chegada
  const ids = new Set(docs.map((d) => d.id));
  const motivos = motivosNaChegada(
    recebimentos
      .filter((r) => ids.has(r.entidadeId))
      .map((r) => ({ codigos: Array.isArray((r.dados as { regras?: unknown })?.regras) ? ((r.dados as { regras: string[] }).regras) : [] })),
  );
  const foramParaRevisao = docs.filter((d) => d.status !== "APROVADO_AUTO" && d.status !== "FALHA_EXTRACAO").length;

  // ---- leitura pela IA
  const extracoes = docs.flatMap((d) => (d.extracao ? [d.extracao] : []));
  const reais = extracoes.filter((e) => e.origem === "CLAUDE");
  const custos = reais.map((e) => custoEstimado(e.modelo, e.tokensEntrada, e.tokensSaida)).filter((c): c is number => c !== null);
  const media = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  const leitura = {
    reais: reais.length,
    gravadas: extracoes.length - reais.length,
    modelos: [...new Set(reais.map((e) => e.modelo).filter(Boolean))] as string[],
    duracaoMedianaMs: mediana(reais.flatMap((e) => (e.duracaoMs === null ? [] : [e.duracaoMs]))),
    tokensEntradaMedio: media(reais.flatMap((e) => (e.tokensEntrada === null ? [] : [e.tokensEntrada]))),
    tokensSaidaMedio: media(reais.flatMap((e) => (e.tokensSaida === null ? [] : [e.tokensSaida]))),
    custoMedio: media(custos),
    custoTotal: custos.reduce((a, b) => a + b, 0),
  };

  // ---- revisão humana
  const decididos = docs.filter((d) => (d.status === "APROVADO" || d.status === "REJEITADO") && d.decididoEm);
  const revisao = {
    decididos: decididos.length,
    diasAteDecisao: mediana(decididos.map((d) => diasEntre(isoDeData(d.recebidoEm), hojeISO(d.decididoEm!)))),
    aprovadosComJustificativa: docs.filter((d) => d.status === "APROVADO" && d.motivo).length,
    rejeitados: status.REJEITADO,
  };

  return {
    hoje,
    inicio: inicio ? isoDeData(inicio) : docs.reduce<string | null>((m, d) => (m === null || isoDeData(d.recebidoEm) < m ? isoDeData(d.recebidoEm) : m), null),
    total: docs.length,
    lidos,
    automaticos,
    taxaAuto: lidos ? automaticos / lidos : 0,
    status,
    semanas,
    aprovados: aprovados.length,
    aprovadosSemCorrecao,
    campos,
    motivos,
    foramParaRevisao,
    leitura,
    revisao,
    alcada: alcada.map((d) => ({ ...d, recebidoEm: isoDeData(d.recebidoEm), vencimento: d.vencimento ? isoDeData(d.vencimento) : null })),
    naAlcada,
  };
}

export type Painel = Awaited<ReturnType<typeof getPainel>>;
