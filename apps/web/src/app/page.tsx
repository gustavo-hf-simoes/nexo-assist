import { redirect } from "next/navigation";

// O proxy já direciona "/" por papel; este redirect cobre o acesso sem o proxy.
export default function Home() {
  redirect("/login");
}
