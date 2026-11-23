/**
 * PDFs de demonstração: um DANFE simplificado e um boleto, ambos marcados como fictícios.
 * Gerados de forma determinística (sem data de criação nos metadados), então o mesmo documento
 * sempre dá o mesmo hash — é assim que o ExtratorGravado encontra a resposta da "IA".
 */
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import {
  formatarCnpj,
  formatarChave,
  formatarLinhaDigitavel,
  imprimirCentavos,
  imprimirData,
  imprimirDecimal4,
  lerLinhaDigitavel,
  type Boleto,
  type Nfe,
} from "../../src/domain/documentos";

const A4: [number, number] = [595.28, 841.89];
const M = 36; // margem
const LARGURA = A4[0] - 2 * M;
const CINZA = rgb(0.35, 0.37, 0.4);
const LINHA = rgb(0.6, 0.62, 0.65);
const AVISO = "DOCUMENTO FICTÍCIO GERADO PARA DEMONSTRAÇÃO — SEM VALOR FISCAL";

type Fontes = { normal: PDFFont; negrito: PDFFont; mono: PDFFont };

async function novo(titulo: string) {
  const pdf = await PDFDocument.create({ updateMetadata: false });
  pdf.setTitle(titulo, { showInWindowTitleBar: false });
  const fontes: Fontes = {
    normal: await pdf.embedFont(StandardFonts.Helvetica),
    negrito: await pdf.embedFont(StandardFonts.HelveticaBold),
    mono: await pdf.embedFont(StandardFonts.Courier),
  };
  const pagina = pdf.addPage(A4);
  return { pdf, pagina, fontes };
}

/** Desenha em coordenadas "de cima para baixo" (y = distância do topo). */
function pincel(p: PDFPage, f: Fontes) {
  const topo = A4[1];
  return {
    texto(t: string, x: number, y: number, o: { tam?: number; fonte?: keyof Fontes; cor?: ReturnType<typeof rgb>; direita?: number } = {}) {
      const fonte = f[o.fonte ?? "normal"];
      const tam = o.tam ?? 8;
      const xx = o.direita !== undefined ? o.direita - fonte.widthOfTextAtSize(t, tam) : x;
      p.drawText(t, { x: xx, y: topo - y - tam, size: tam, font: fonte, color: o.cor ?? rgb(0.08, 0.09, 0.11) });
    },
    caixa(x: number, y: number, w: number, h: number, rotulo?: string, valor?: string, o: { tamValor?: number; direita?: boolean; mono?: boolean } = {}) {
      p.drawRectangle({ x, y: topo - y - h, width: w, height: h, borderColor: LINHA, borderWidth: 0.6 });
      if (rotulo) this.texto(rotulo.toUpperCase(), x + 3, y + 2.5, { tam: 5.5, cor: CINZA });
      if (valor !== undefined) {
        this.texto(valor, x + 3, y + h - (o.tamValor ?? 9) - 3, {
          tam: o.tamValor ?? 9,
          fonte: o.mono ? "mono" : "negrito",
          direita: o.direita ? x + w - 3 : undefined,
        });
      }
    },
    barra(x: number, y: number, w: number, h: number) {
      p.drawRectangle({ x, y: topo - y - h, width: w, height: h, color: rgb(0, 0, 0) });
    },
    marcaDagua() {
      p.drawText("SEM VALOR FISCAL", {
        x: 120,
        y: 300,
        size: 54,
        font: f.negrito,
        color: rgb(0.85, 0.2, 0.2),
        opacity: 0.08,
        rotate: degrees(35),
      });
      this.texto(AVISO, 0, A4[1] - M + 6, { tam: 6.5, cor: rgb(0.7, 0.15, 0.15), direita: A4[0] - M });
    },
  };
}

const salvar = (pdf: PDFDocument) => pdf.save({ useObjectStreams: false });

// ───────────────────────────── DANFE ─────────────────────────────

export type ExtrasDanfe = {
  emitenteEndereco: string;
  destinatarioNome: string;
  destinatarioEndereco: string;
  /** Reenvio da mesma nota (muda o PDF, não a nota). */
  segundaVia?: boolean;
};

export async function gerarDanfe(n: Nfe, x: ExtrasDanfe): Promise<Uint8Array> {
  const { pdf, pagina, fontes } = await novo(`DANFE ${n.numero}`);
  const p = pincel(pagina, fontes);
  const tx = (v: number | null) => (v === null ? "" : imprimirCentavos(v));

  // Cabeçalho
  p.caixa(M, M, 250, 78);
  p.texto(n.emitenteNome ?? "", M + 8, M + 10, { tam: 12, fonte: "negrito" });
  p.texto(x.emitenteEndereco, M + 8, M + 28, { tam: 7.5 });
  p.texto(`CNPJ ${n.emitenteCnpj ? formatarCnpj(n.emitenteCnpj) : ""}`, M + 8, M + 40, { tam: 7.5 });

  p.caixa(M + 250, M, 110, 78);
  p.texto("DANFE", M + 262, M + 8, { tam: 14, fonte: "negrito" });
  p.texto("Documento Auxiliar da", M + 262, M + 26, { tam: 6.5 });
  p.texto("Nota Fiscal Eletrônica", M + 262, M + 34, { tam: 6.5 });
  p.texto("1 - SAÍDA", M + 262, M + 46, { tam: 7 });
  p.texto(`Nº ${n.numero === null ? "" : String(n.numero).padStart(9, "0").replace(/(\d{3})(?=\d)/g, "$1.")}`, M + 262, M + 56, {
    tam: 8,
    fonte: "negrito",
  });
  p.texto(`SÉRIE ${n.serie === null ? "" : String(n.serie).padStart(3, "0")}   FOLHA 1/1`, M + 262, M + 66, { tam: 7 });
  if (x.segundaVia) p.texto("2ª VIA", M + 330, M + 8, { tam: 7, fonte: "negrito", cor: rgb(0.7, 0.15, 0.15) });

  p.caixa(M + 360, M, LARGURA - 360, 78, "Consulta de autenticidade");
  p.texto("www.nfe.fazenda.gov.br/portal", M + 366, M + 20, { tam: 7.5, fonte: "negrito" });
  p.texto("ou pelo app da SEFAZ do emitente", M + 366, M + 31, { tam: 7 });

  // Chave de acesso (linha inteira: 44 dígitos em blocos de 4)
  let y = M + 84;
  p.caixa(M, y, LARGURA, 28, "Chave de acesso", n.chaveAcesso ? formatarChave(n.chaveAcesso) : "", { tamValor: 10.5, mono: true });

  // Natureza / emissão
  y += 34;
  p.caixa(M, y, 330, 26, "Natureza da operação", "VENDA DE MERCADORIA");
  p.caixa(M + 330, y, LARGURA - 330, 26, "Protocolo de autorização", `1532600${String(n.numero ?? 0).padStart(8, "0")}`, { mono: true });

  // Destinatário
  y += 32;
  p.texto("DESTINATÁRIO / REMETENTE", M, y, { tam: 7, fonte: "negrito" });
  y += 10;
  p.caixa(M, y, 300, 26, "Nome / razão social", x.destinatarioNome);
  p.caixa(M + 300, y, 140, 26, "CNPJ / CPF", n.destinatarioCnpj ? formatarCnpj(n.destinatarioCnpj) : "");
  p.caixa(M + 440, y, LARGURA - 440, 26, "Data da emissão", n.dataEmissao ? imprimirData(n.dataEmissao) : "");
  y += 26;
  p.caixa(M, y, LARGURA, 24, "Endereço", x.destinatarioEndereco, { tamValor: 8 });

  // Fatura / duplicatas
  y += 30;
  p.texto("FATURA / DUPLICATAS", M, y, { tam: 7, fonte: "negrito" });
  y += 10;
  const larguraDup = LARGURA / 4;
  if (n.duplicatas.length === 0) p.caixa(M, y, LARGURA, 26, "Pagamento", "À VISTA");
  n.duplicatas.forEach((d, i) => {
    const xx = M + i * larguraDup;
    p.caixa(xx, y, larguraDup, 34);
    p.texto(`Nº ${d.numero ?? ""}`, xx + 4, y + 4, { tam: 7 });
    p.texto(`Venc. ${d.vencimento ? imprimirData(d.vencimento) : ""}`, xx + 4, y + 13, { tam: 7 });
    p.texto(`Valor R$ ${tx(d.valorCentavos)}`, xx + 4, y + 22, { tam: 7.5, fonte: "negrito" });
  });

  // Cálculo do imposto
  y += 40;
  p.texto("CÁLCULO DO IMPOSTO", M, y, { tam: 7, fonte: "negrito" });
  y += 10;
  const totais: [string, number | null][] = [
    ["Valor total dos produtos", n.totalProdutosCentavos],
    ["Valor do frete", n.freteCentavos],
    ["Desconto", n.descontoCentavos],
    ["Valor total do IPI", n.ipiCentavos],
    ["Valor total da nota", n.totalNotaCentavos],
  ];
  const lt = LARGURA / totais.length;
  totais.forEach(([r, v], i) => p.caixa(M + i * lt, y, lt, 28, r, tx(v), { direita: true, tamValor: i === totais.length - 1 ? 10 : 9 }));

  // Itens
  y += 34;
  p.texto("DADOS DOS PRODUTOS / SERVIÇOS", M, y, { tam: 7, fonte: "negrito" });
  y += 10;
  const cols: [string, number][] = [
    ["Cód.", 40],
    ["Descrição do produto / serviço", 230],
    ["NCM", 50],
    ["Un.", 30],
    ["Quant.", 55],
    ["Valor unit.", 60],
    ["Valor total", LARGURA - 465],
  ];
  let cx = M;
  for (const [r, w] of cols) {
    p.caixa(cx, y, w, 14, r);
    cx += w;
  }
  y += 14;
  n.itens.forEach((it, i) => {
    const valores = [
      String(1001 + i),
      it.descricao ?? "",
      "2523.29.10",
      it.descricao?.includes("m³") ? "M3" : "UN",
      it.quantidade === null ? "" : imprimirDecimal4(it.quantidade),
      it.valorUnitario === null ? "" : imprimirDecimal4(it.valorUnitario),
      tx(it.valorTotalCentavos),
    ];
    let xx = M;
    cols.forEach(([, w], c) => {
      pagina.drawRectangle({ x: xx, y: A4[1] - y - 16, width: w, height: 16, borderColor: LINHA, borderWidth: 0.4 });
      const numerico = c >= 4;
      p.texto(valores[c], xx + 3, y + 4.5, { tam: 7.5, direita: numerico ? xx + w - 3 : undefined });
      xx += w;
    });
    y += 16;
  });

  y += 14;
  p.caixa(M, y, LARGURA, 40, "Informações complementares", "Documento fictício do projeto NotaLens. CNPJs válidos no formato, porém inventados.", {
    tamValor: 7.5,
  });

  p.marcaDagua();
  return salvar(pdf);
}

// ───────────────────────────── Boleto ─────────────────────────────

const ITF = ["nnwwn", "wnnnw", "nwnnw", "wwnnn", "nnwnw", "wnwnn", "nwwnn", "nnnww", "wnnwn", "nwnwn"];

/** Código de barras Intercalado 2 de 5 (o padrão dos boletos), desenhado com retângulos. */
function codigoDeBarras(p: ReturnType<typeof pincel>, codigo: string, x: number, y: number, h: number) {
  const fino = 0.95;
  const grosso = fino * 3;
  let cx = x;
  const desenhar = (larg: number, barra: boolean) => {
    if (barra) p.barra(cx, y, larg, h);
    cx += larg;
  };
  "nnnn".split("").forEach((_, i) => desenhar(fino, i % 2 === 0)); // início
  for (let i = 0; i < codigo.length; i += 2) {
    const barras = ITF[Number(codigo[i])];
    const espacos = ITF[Number(codigo[i + 1])];
    for (let k = 0; k < 5; k++) {
      desenhar(barras[k] === "w" ? grosso : fino, true);
      desenhar(espacos[k] === "w" ? grosso : fino, false);
    }
  }
  desenhar(grosso, true); // fim: largo, fino, fino
  desenhar(fino, false);
  desenhar(fino, true);
}

/** Dígito do código de compensação impresso ao lado do banco (001-9, 237-2…). */
const DV_BANCO: Record<string, string> = { "001": "9", "033": "7", "104": "0", "237": "2", "341": "7" };

export type ExtrasBoleto = { bancoNome: string; pagadorNome: string; dataDocumento: string; recibo?: boolean };

export async function gerarBoleto(b: Boleto, x: ExtrasBoleto): Promise<Uint8Array> {
  const { pdf, pagina, fontes } = await novo(`Boleto ${b.numeroDocumento ?? ""}`);
  const p = pincel(pagina, fontes);
  const linha = b.linhaDigitavel ?? "";
  const banco = linha.slice(0, 3);
  const lida = lerLinhaDigitavel(linha);
  const vencimento = b.vencimento ? imprimirData(b.vencimento) : "";
  const valor = b.valorCentavos === null ? "" : imprimirCentavos(b.valorCentavos);

  // Recibo do pagador (parte de cima)
  let y = M;
  p.texto(x.bancoNome, M, y + 4, { tam: 11, fonte: "negrito" });
  p.texto("RECIBO DO PAGADOR", 0, y + 6, { tam: 8, fonte: "negrito", direita: A4[0] - M });
  y += 22;
  p.caixa(M, y, 330, 26, "Beneficiário", `${b.beneficiarioNome ?? ""}`, { tamValor: 8 });
  p.caixa(M + 330, y, 100, 26, "CNPJ", b.beneficiarioCnpj ? formatarCnpj(b.beneficiarioCnpj) : "", { tamValor: 7.5 });
  p.caixa(M + 430, y, LARGURA - 430, 26, "Vencimento", vencimento, { direita: true });
  y += 26;
  p.caixa(M, y, 330, 26, "Pagador", x.pagadorNome, { tamValor: 8 });
  p.caixa(M + 330, y, 100, 26, "Nº do documento", b.numeroDocumento ?? "", { tamValor: 8 });
  p.caixa(M + 430, y, LARGURA - 430, 26, "Valor do documento", valor, { direita: true });

  // Linha de corte
  y += 44;
  for (let cx = M; cx < A4[0] - M; cx += 6) p.barra(cx, y, 3, 0.5);
  p.texto("Corte na linha pontilhada", 0, y + 3, { tam: 6, cor: CINZA, direita: A4[0] - M });

  // Ficha de compensação
  y += 18;
  p.texto(x.bancoNome, M, y + 4, { tam: 11, fonte: "negrito" });
  p.barra(M + 120, y, 0.8, 18);
  p.texto(`${banco}-${DV_BANCO[banco] ?? "0"}`, M + 128, y + 3, { tam: 13, fonte: "negrito" });
  p.barra(M + 172, y, 0.8, 18);
  p.texto(formatarLinhaDigitavel(linha), 0, y + 4, { tam: 10.5, fonte: "negrito", direita: A4[0] - M });
  y += 22;

  const ladoW = 130;
  const corpoW = LARGURA - ladoW;
  p.caixa(M, y, corpoW, 26, "Local de pagamento", "Pagável em qualquer banco até o vencimento", { tamValor: 8 });
  p.caixa(M + corpoW, y, ladoW, 26, "Vencimento", vencimento, { direita: true });
  y += 26;
  p.caixa(M, y, corpoW, 26, "Beneficiário", `${b.beneficiarioNome ?? ""} — CNPJ ${b.beneficiarioCnpj ? formatarCnpj(b.beneficiarioCnpj) : ""}`, {
    tamValor: 8,
  });
  p.caixa(M + corpoW, y, ladoW, 26, "Agência / código beneficiário", "1234 / 0056789-0", { direita: true, tamValor: 8 });
  y += 26;
  const q = corpoW / 4;
  p.caixa(M, y, q, 26, "Data do documento", imprimirData(x.dataDocumento), { tamValor: 8 });
  p.caixa(M + q, y, q, 26, "Nº do documento", b.numeroDocumento ?? "", { tamValor: 8 });
  p.caixa(M + 2 * q, y, q, 26, "Espécie doc.", "DM", { tamValor: 8 });
  p.caixa(M + 3 * q, y, q, 26, "Aceite", "N", { tamValor: 8 });
  p.caixa(M + corpoW, y, ladoW, 26, "Nosso número", lida.codigoBarras?.slice(19, 30) ?? "", { direita: true, tamValor: 8 });
  y += 26;
  p.caixa(M, y, corpoW, 60, "Instruções (texto de responsabilidade do beneficiário)");
  p.texto("Após o vencimento, multa de 2% e juros de 1% ao mês.", M + 6, y + 16, { tam: 8 });
  p.texto("Não receber após 30 dias do vencimento.", M + 6, y + 28, { tam: 8 });
  p.caixa(M + corpoW, y, ladoW, 20, "(=) Valor do documento", valor, { direita: true });
  p.caixa(M + corpoW, y + 20, ladoW, 20, "(-) Desconto / abatimento");
  p.caixa(M + corpoW, y + 40, ladoW, 20, "(=) Valor cobrado");
  y += 60;
  p.caixa(M, y, LARGURA, 30, "Pagador", `${x.pagadorNome} — CNPJ ${b.pagadorCnpj ? formatarCnpj(b.pagadorCnpj) : ""}`, { tamValor: 8 });
  y += 40;
  if (lida.codigoBarras) codigoDeBarras(p, lida.codigoBarras, M, y, 46);
  p.texto("Autenticação mecânica — Ficha de compensação", 0, y + 50, { tam: 6.5, cor: CINZA, direita: A4[0] - M });

  p.marcaDagua();
  return salvar(pdf);
}
