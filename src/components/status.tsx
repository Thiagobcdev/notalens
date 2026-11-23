import { Badge } from "@/components/ui";
import type { StatusDocumento, TipoDocumento } from "@/generated/prisma/enums";

const STATUS: Record<StatusDocumento, { rotulo: string; tom: "pos" | "neg" | "warn" | "neutro" }> = {
  APROVADO_AUTO: { rotulo: "Aprovado automático", tom: "pos" },
  APROVADO: { rotulo: "Aprovado na revisão", tom: "pos" },
  EM_REVISAO: { rotulo: "Em revisão", tom: "warn" },
  REJEITADO: { rotulo: "Rejeitado", tom: "neg" },
  FALHA_EXTRACAO: { rotulo: "Falha na leitura", tom: "neg" },
};

export const rotuloStatus = (s: StatusDocumento) => STATUS[s].rotulo;

export function BadgeStatus({ status }: { status: StatusDocumento }) {
  return <Badge tom={STATUS[status].tom}>{STATUS[status].rotulo}</Badge>;
}

export const rotuloTipo = (t: TipoDocumento | null) => (t === "NFE" ? "NF-e" : t === "BOLETO" ? "Boleto" : "—");
