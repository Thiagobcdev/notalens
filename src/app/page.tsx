import { redirect } from "next/navigation";

/** O proxy já redireciona "/" para a área do papel; isto é só a rede de segurança. */
export default function Home() {
  redirect("/login");
}
