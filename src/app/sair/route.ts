import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_SESSAO } from "@/server/token";

/** Encerra uma sessão que não vale mais (usuário removido ou papel alterado) e volta ao login. */
export async function GET() {
  (await cookies()).delete(COOKIE_SESSAO);
  redirect("/login");
}
