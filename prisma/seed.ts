/**
 * Seed do Grupo Vértice (fictício) — reprodutível (PRNG com semente fixa).
 *   npm run db:reset   (recria o banco e roda este seed)
 *
 * 1. Gera ~65 NF-e e seus boletos (set–nov/2026) como PDFs, com defeitos de propósito.
 * 2. Grava a "resposta da IA" de cada PDF (ExtracaoGravada) — em alguns, a IA "lê errado".
 * 3. Passa cada PDF pelo MESMO pipeline da aplicação (ExtratorGravado → regras → documento).
 * 4. Resolve as revisões antigas como uma pessoa faria (corrige, aprova, rejeita) e deixa
 *    as da última semana na fila.
 * 5. Gera `amostras/`: PDFs novos para testar o upload, com as respostas já gravadas.
 *
 * Login (todos): senha "vertice123" — só para uso local.
 */
import bcrypt from "bcryptjs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { completarCnpj, paraBruto, somarDias, type Boleto, type Documento, type Nfe } from "../src/domain/documentos";
import { criarPrisma } from "../src/server/db";
import { ExtratorGravado } from "../src/server/extracao/extrator";
import { processarDocumento } from "../src/server/pipeline";
import { aprovar, corrigir, rejeitar } from "../src/server/revisao";
import { hashDe } from "../src/server/storage";
import {
  ATIVOS,
  FORNECEDORES,
  GRUPO,
  boletoDaParcela,
  destinatarioDe,
  entre,
  ERRO_DA_IA,
  escolher,
  nomeBoleto,
  nomeNota,
  novaNota,
  trocarDigito,
  type Defeito,
  type Evento,
  type FornecedorSeed,
} from "./seed/cenario";
import { gerarBoleto, gerarDanfe } from "./seed/pdf";

const db = criarPrisma();
const SENHA = "vertice123";
const INICIO = "2026-09-01";
const RECENTE = "2026-11-17"; // a partir daqui, as revisões ficam na fila
const HOJE = "2026-11-23";
/** Beneficiário dos boletos falsos: CNPJ válido no formato, fora do cadastro. */
const CNPJ_GOLPE = completarCnpj("479609500001");

const clonar = <T>(x: T): T => structuredClone(x);
const datasEntre = (de: string, ate: string, n: number) => {
  const dias = Math.round((Date.parse(ate) - Date.parse(de)) / 86_400_000);
  return Array.from({ length: n }, () => somarDias(de, entre(0, dias))).sort();
};
const minIso = (a: string, b: string) => (a < b ? a : b);

// ───────────────────────────── 1. eventos ─────────────────────────────

function montarEventos(): Evento[] {
  const notas: Evento[] = [];
  const emissoes = [...datasEntre(INICIO, "2026-11-14", 50), ...datasEntre(RECENTE, "2026-11-21", 16)];
  const grandes = new Set([4, 13, 22, 31, 40, 55, 60]);
  emissoes.forEach((emissao, i) => {
    const f = escolher(ATIVOS);
    const n = novaNota(f, emissao, { grande: grandes.has(i) });
    notas.push({
      verdade: n,
      lida: clonar(n),
      recebidoEm: minIso(somarDias(emissao, entre(0, 2)), "2026-11-21"),
      nomeArquivo: nomeNota(n, f),
      fornecedor: f,
      destinatario: destinatarioDe(n),
    });
  });

  /** A nota de onde saiu um boleto (mesmo fornecedor e nº de parcela). */
  const notaDoBoleto = (e: Evento) =>
    notas.find((x) => x.fornecedor === e.fornecedor && (x.verdade as Nfe).duplicatas.some((d) => d.numero === (e.verdade as Boleto).numeroDocumento))!
      .verdade as Nfe;
  const parcelaDo = (e: Evento) => Number((e.verdade as Boleto).numeroDocumento!.split("/")[1]) - 1;

  const historico = (e: Evento) => e.recebidoEm < RECENTE;
  const recente = (e: Evento) => e.recebidoEm >= RECENTE;
  const livre = (e: Evento) => !e.defeito && (e.verdade.tipo !== "NFE" || (e.verdade.totalNotaCentavos ?? 0) <= 1_000_000);
  const pegar = (lista: Evento[], quando: (e: Evento) => boolean, defeito: Defeito) => {
    const candidatos = lista.filter((e) => quando(e) && livre(e));
    if (candidatos.length === 0) throw new Error(`Sem candidato para ${defeito}`);
    const e = escolher(candidatos);
    e.defeito = defeito;
    return e;
  };

  // ── defeitos reais nas notas (a nota está errada; não terá boletos) ──
  for (const quando of [historico, historico, recente]) {
    const e = pegar(notas, quando, "ITEM_ERRADO");
    const n = e.verdade as Nfe;
    n.itens[0].valorTotalCentavos! += entre(2, 90) * 100; // o total do item foi impresso errado
    e.lida = clonar(n);
  }
  for (const quando of [historico, recente]) {
    const e = pegar(notas, quando, "TOTAL_ERRADO");
    const n = e.verdade as Nfe;
    n.totalNotaCentavos! += 10_000;
    n.duplicatas[n.duplicatas.length - 1].valorCentavos! += 10_000; // parcelas acompanham o total errado
    e.lida = clonar(n);
  }

  // ── a IA leu errado (a nota está certa) ──
  const leituraNota: [Defeito, (n: Nfe) => void][] = [
    ["IA_CAMPO_ILEGIVEL", (n) => (n.totalNotaCentavos = null)],
    ["IA_CNPJ", (n) => (n.emitenteCnpj = trocarDigito(n.emitenteCnpj!, 5))],
    ["IA_QUANTIDADE", (n) => (n.itens[0].quantidade = n.itens[0].quantidade! * 10)],
  ];
  for (const [defeito, errar] of leituraNota) {
    for (const quando of [historico, historico, recente]) errar(pegar(notas, quando, defeito).lida as Nfe);
  }

  // ── boletos de cada parcela, recebidos junto com a nota ──
  const boletos: Evento[] = [];
  for (const e of notas) {
    if (e.defeito && !ERRO_DA_IA(e.defeito)) continue;
    const n = e.verdade as Nfe;
    n.duplicatas.forEach((_, i) => {
      const b = boletoDaParcela(n, e.fornecedor!, i);
      boletos.push({ verdade: b, lida: clonar(b), recebidoEm: e.recebidoEm, nomeArquivo: nomeBoleto(b), fornecedor: e.fornecedor, destinatario: e.destinatario, nota: e });
    });
  }

  // ── defeitos reais nos boletos ──
  for (const quando of [(e: Evento) => historico(e) && (e.verdade as Boleto).vencimento! < "2026-11-01", (e: Evento) => (e.verdade as Boleto).vencimento! >= "2026-11-12" && (e.verdade as Boleto).vencimento! <= "2026-11-18"]) {
    const e = pegar(boletos, quando, "BOLETO_VENCIDO");
    const atrasado = somarDias((e.verdade as Boleto).vencimento!, entre(2, 4)); // chegou depois do vencimento
    const vencimento = (e.verdade as Boleto).vencimento!;
    // o 1º fica no histórico; o 2º (vencido em meados de nov) chega na semana da fila
    e.recebidoEm = vencimento < "2026-11-01" ? atrasado : minIso(atrasado > RECENTE ? atrasado : RECENTE, HOJE);
  }
  for (const quando of [historico, recente]) {
    const e = pegar(boletos, quando, "BOLETO_SEM_NOTA");
    const b = e.verdade as Boleto;
    const juros = entre(5, 90) * 100;
    const novo = boletoDaParcela(notaDoBoleto(e), e.fornecedor!, parcelaDo(e), { valorCentavos: b.valorCentavos! + juros });
    e.verdade = novo;
    e.lida = clonar(novo);
  }

  // ── a IA leu errado o boleto ──
  const leituraBoleto: [Defeito, (b: Boleto) => void][] = [
    ["IA_DIGITO_LINHA", (b) => (b.linhaDigitavel = trocarDigito(b.linhaDigitavel!, entre(12, 30)))],
    ["IA_VALOR", (b) => (b.valorCentavos = Number(trocarDigito(String(b.valorCentavos), 0)))],
    ["IA_VENCIMENTO", (b) => (b.vencimento = somarDias(b.vencimento!, 1))],
  ];
  for (const [defeito, errar] of leituraBoleto) {
    for (const quando of [historico, historico, recente]) errar(pegar(boletos, quando, defeito).lida as Boleto);
  }

  const extras: Evento[] = [];

  // ── boleto falso: beneficiário desconhecido com o nome de um fornecedor real, valor de uma parcela real ──
  for (const quando of [historico, recente]) {
    const base = escolher(boletos.filter((e) => quando(e) && !e.defeito));
    const falso = boletoDaParcela(notaDoBoleto(base), base.fornecedor!, parcelaDo(base), { beneficiarioCnpj: CNPJ_GOLPE });
    extras.push({ ...base, verdade: falso, lida: clonar(falso), nomeArquivo: `Boleto_atualizado_${falso.numeroDocumento!.replace("/", "-")}.pdf`, defeito: "BOLETO_FALSO", recebidoEm: minIso(somarDias(base.recebidoEm, 3), HOJE) });
  }

  // ── reenvios da mesma nota: um no histórico, um na fila ──
  const notasLimpas = notas.filter((e) => !e.defeito && e.recebidoEm < "2026-11-10");
  const reenvios: [Evento, string][] = [
    [notasLimpas[3], somarDias(notasLimpas[3].recebidoEm, 8)],
    [notasLimpas[notasLimpas.length - 1], "2026-11-18"],
  ];
  for (const [base, data] of reenvios) {
    extras.push({ ...base, lida: clonar(base.verdade), segundaVia: true, defeito: "NOTA_DUPLICADA", recebidoEm: data });
  }
  const copias: [Evento, string][] = [
    [notasLimpas[8], somarDias(notasLimpas[8].recebidoEm, 4)],
    [notasLimpas[notasLimpas.length - 2], "2026-11-19"],
  ];
  for (const [base, data] of copias) extras.push({ ...base, copiaDe: base, defeito: "ARQUIVO_DUPLICADO", recebidoEm: data });

  // ── fornecedor descredenciado ──
  const inativo = FORNECEDORES.find((f) => !f.ativo)!;
  for (const data of ["2026-10-20", "2026-11-19"]) {
    const n = novaNota(inativo, data);
    extras.push({ verdade: n, lida: clonar(n), recebidoEm: somarDias(data, 1), nomeArquivo: nomeNota(n, inativo), fornecedor: inativo, destinatario: destinatarioDe(n), defeito: "FORNECEDOR_INATIVO" });
  }

  // Ordem de chegada; no mesmo dia, notas antes dos boletos (vêm no mesmo e-mail).
  const todos = [...notas, ...boletos, ...extras];
  return todos
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.recebidoEm.localeCompare(b.e.recebidoEm) || (a.e.verdade.tipo === b.e.verdade.tipo ? a.i - b.i : a.e.verdade.tipo === "NFE" ? -1 : 1))
    .map(({ e }) => e);
}

// ───────────────────────────── 2. PDFs ─────────────────────────────

async function renderizar(e: Evento): Promise<Uint8Array> {
  if (e.verdade.tipo === "NFE") {
    return gerarDanfe(e.verdade, {
      emitenteEndereco: e.fornecedor?.endereco ?? "",
      destinatarioNome: e.destinatario.nome,
      destinatarioEndereco: e.destinatario.endereco,
      segundaVia: e.segundaVia,
    });
  }
  const f = e.fornecedor!;
  return gerarBoleto(e.verdade, { bancoNome: f.banco[1], pagadorNome: e.destinatario.nome, dataDocumento: e.recebidoEm });
}

async function gravarResposta(bytes: Uint8Array, lida: Documento) {
  const hash = hashDe(bytes);
  const bruto = paraBruto(lida);
  await db.extracaoGravada.upsert({ where: { hashArquivo: hash }, create: { hashArquivo: hash, bruto }, update: { bruto } });
}

// ───────────────────────────── 3/4. pipeline + revisão ─────────────────────────────

const MOTIVOS: Partial<Record<Defeito, string>> = {
  ITEM_ERRADO: "Erro de cálculo no item. Pedida nova nota ao fornecedor.",
  TOTAL_ERRADO: "Total da nota não fecha. Pedida carta de correção ao fornecedor.",
  NOTA_DUPLICADA: "Nota já lançada (segunda via).",
  ARQUIVO_DUPLICADO: "Arquivo já enviado.",
  FORNECEDOR_INATIVO: "Fornecedor descredenciado em out/2026.",
  BOLETO_SEM_NOTA: "Valor não confere com a parcela da nota. Pedido boleto correto.",
  BOLETO_FALSO: "Beneficiário não cadastrado: possível fraude. Fornecedor avisado por telefone.",
};

async function main() {
  console.time("seed");
  await db.auditoria.deleteMany();
  await db.correcao.deleteMany();
  await db.resultadoRegra.deleteMany();
  await db.extracao.deleteMany();
  await db.documento.deleteMany();
  await db.extracaoGravada.deleteMany();
  await db.fornecedor.deleteMany();
  await db.cnpj.deleteMany();
  await db.empresa.deleteMany();
  await db.usuario.deleteMany();
  await rm(path.join(process.cwd(), "storage"), { recursive: true, force: true });

  await db.empresa.create({
    data: { nome: GRUPO.nome, cnpjs: { create: [GRUPO.matriz, GRUPO.filial].map(({ cnpj, descricao }) => ({ cnpj, descricao })) } },
  });
  await db.fornecedor.createMany({ data: FORNECEDORES.map((f) => ({ cnpj: f.cnpj, nome: f.nome, ativo: f.ativo })) });
  const senhaHash = await bcrypt.hash(SENHA, 10);
  const [paula, rafael, carla] = await Promise.all(
    [
      { nome: "Paula Mendes", email: "paula.mendes@vertice.test", papel: "ANALISTA" as const },
      { nome: "Rafael Souza", email: "rafael.souza@vertice.test", papel: "ANALISTA" as const },
      { nome: "Carla Nogueira", email: "carla.nogueira@vertice.test", papel: "GESTOR" as const },
    ].map((u) => db.usuario.create({ data: { ...u, senhaHash } })),
  );
  const analistas = [paula, rafael];
  const gestor = { id: carla.id, papel: "GESTOR" as const };

  const eventos = montarEventos();
  const bytesDe = new Map<Evento, Uint8Array>();
  for (const e of eventos) {
    const bytes = e.copiaDe ? bytesDe.get(e.copiaDe) ?? (await renderizar(e.copiaDe)) : await renderizar(e);
    bytesDe.set(e, bytes);
    await gravarResposta(bytes, e.lida);
  }

  const extrator = new ExtratorGravado(db);
  const contagem: Record<string, number> = {};
  const inesperados: string[] = [];
  for (const e of eventos) {
    const analista = escolher(analistas);
    const r = await processarDocumento(db, extrator, {
      bytes: bytesDe.get(e)!,
      nomeArquivo: e.nomeArquivo,
      usuarioId: analista.id,
      recebidoEm: e.recebidoEm,
    });
    const codigos = r.decisao?.violacoes.map((v) => v.codigo) ?? [];
    // Boleto de uma nota que a IA leu com o CNPJ errado e ainda não foi corrigida: fica sem nota (V6) até a correção.
    const esperaNota = e.nota?.defeito === "IA_CNPJ" && e.nota.recebidoEm >= RECENTE;
    const aceitos = esperaNota ? ["ACIMA_DA_ALCADA", "SEM_NOTA"] : ["ACIMA_DA_ALCADA"];
    if (r.status === "EM_REVISAO" && !e.defeito && codigos.some((c) => !aceitos.includes(c))) inesperados.push(`${e.nomeArquivo}: ${codigos}`);
    if (r.status === "APROVADO_AUTO" && e.defeito) inesperados.push(`${e.nomeArquivo}: ${e.defeito} passou direto`);

    if (r.status !== "EM_REVISAO" || e.recebidoEm >= RECENTE) continue;
    const em = new Date(`${somarDias(e.recebidoEm, 1)}T13:${String(entre(0, 59)).padStart(2, "0")}:00Z`);
    const quem = { id: analista.id, papel: "ANALISTA" as const, em };
    if (ERRO_DA_IA(e.defeito)) {
      const decisao = await corrigir(db, r.documentoId, e.verdade, quem);
      await aprovar(db, r.documentoId, decisao.exigeGestor ? { ...gestor, em } : quem);
    } else if (e.defeito === "BOLETO_VENCIDO") {
      await aprovar(db, r.documentoId, { ...gestor, em }, "Pago com juros: o fornecedor enviou o boleto com atraso.");
    } else if (e.defeito) {
      await rejeitar(db, r.documentoId, quem, MOTIVOS[e.defeito]!);
    } else {
      await aprovar(db, r.documentoId, { ...gestor, em }); // só alçada (V9)
    }
    contagem[e.defeito ?? "ALCADA"] = (contagem[e.defeito ?? "ALCADA"] ?? 0) + 1;
  }

  await gerarAmostras(eventos, bytesDe);

  const porStatus = await db.documento.groupBy({ by: ["status"], _count: true });
  const naFila = await db.resultadoRegra.groupBy({ by: ["codigo"], where: { documento: { status: "EM_REVISAO" } }, _count: true });
  console.log(`Documentos: ${eventos.length}`, Object.fromEntries(porStatus.map((s) => [s.status, s._count])));
  console.log("Revisões resolvidas no histórico:", contagem);
  console.log("Regras na fila atual:", Object.fromEntries(naFila.map((s) => [s.codigo, s._count])));
  if (inesperados.length) {
    console.error("Resultados inesperados:\n " + inesperados.join("\n "));
    process.exitCode = 1;
  }
  console.timeEnd("seed");
}

// ───────────────────────────── 5. amostras para o upload ─────────────────────────────

/** Data de hoje em Brasília, para as amostras valerem no dia em que o seed roda. */
const hojeSP = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

async function gerarAmostras(eventos: Evento[], bytesDe: Map<Evento, Uint8Array>) {
  const dir = path.join(process.cwd(), "amostras");
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const hoje = hojeSP();
  const salvar = async (nome: string, bytes: Uint8Array, lida: Documento) => {
    await writeFile(path.join(dir, nome), bytes);
    await gravarResposta(bytes, lida);
  };
  const porNome = (nome: string) => FORNECEDORES.find((f) => f.nome.startsWith(nome))!;
  const extrasNota = (f: FornecedorSeed, n: Nfe) => ({ emitenteEndereco: f.endereco, destinatarioNome: destinatarioDe(n).nome, destinatarioEndereco: destinatarioDe(n).endereco });

  // 1 e 2: nota limpa e o boleto da 1ª parcela → aprovados sozinhos
  const cimento = porNome("Cimentos");
  let n = novaNota(cimento, hoje);
  while (n.totalNotaCentavos! > 1_000_000) n = novaNota(cimento, hoje);
  await salvar(`1-nfe-${n.numero}-limpa.pdf`, await gerarDanfe(n, extrasNota(cimento, n)), n);
  const b = boletoDaParcela(n, cimento, 0);
  await salvar(`2-boleto-${b.numeroDocumento!.replace("/", "-")}-limpo.pdf`, await gerarBoleto(b, { bancoNome: cimento.banco[1], pagadorNome: destinatarioDe(n).nome, dataDocumento: hoje }), b);

  // 3: a IA lê a quantidade errada (25,0000 em vez de 2,5000) → V3, corrigir na revisão
  const areal = porNome("Areal");
  let n3 = novaNota(areal, hoje);
  while (n3.totalNotaCentavos! > 1_000_000) n3 = novaNota(areal, hoje);
  const lida3 = clonar(n3);
  lida3.itens[0].quantidade = n3.itens[0].quantidade! * 10;
  await salvar(`3-nfe-${n3.numero}-ia-leu-quantidade-errada.pdf`, await gerarDanfe(n3, extrasNota(areal, n3)), lida3);

  // 4: boleto falso — nome de fornecedor real, CNPJ desconhecido
  const falso = { ...b, beneficiarioCnpj: CNPJ_GOLPE, linhaDigitavel: boletoDaParcela(n, cimento, 0).linhaDigitavel };
  await salvar(`4-boleto-falso-beneficiario-desconhecido.pdf`, await gerarBoleto(falso, { bancoNome: cimento.banco[1], pagadorNome: destinatarioDe(n).nome, dataDocumento: hoje }), falso);

  // 5: acima da alçada (V9) → só o gestor aprova
  const aco = porNome("Aço");
  let n5 = novaNota(aco, hoje, { grande: true });
  while (n5.totalNotaCentavos! <= 1_000_000) n5 = novaNota(aco, hoje, { grande: true });
  await salvar(`5-nfe-${n5.numero}-acima-da-alcada.pdf`, await gerarDanfe(n5, extrasNota(aco, n5)), n5);

  // 6: cópia exata de um PDF já recebido → V4
  const antigo = eventos.find((e) => e.verdade.tipo === "NFE" && !e.defeito && e.recebidoEm < RECENTE)!;
  await salvar(`6-copia-de-${antigo.nomeArquivo}`, bytesDe.get(antigo)!, antigo.lida);

  console.log(`Amostras para upload em amostras/ (datadas de ${hoje}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());

