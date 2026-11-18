import { sql } from "drizzle-orm";
import { pathToFileURL } from "node:url";
import { loadDbEnv } from "../config/db-env";
import { createDb, type Database } from "./client";
import { conversations, kbArticles, messages, users } from "./schema";

type UserInsert = typeof users.$inferInsert;
type ArticleInsert = typeof kbArticles.$inferInsert;
type ConversationInsert = typeof conversations.$inferInsert;
type MessageInsert = typeof messages.$inferInsert;

const HOUR_MS = 60 * 60 * 1000;

// Mesmos ids dos funcionários do seed do serviço de chamados.
export const SEED_USERS: UserInsert[] = [
  {
    id: "ana.souza",
    email: "ana.souza@nexo.com.br",
    name: "Ana Souza",
    role: "employee",
    department: "Financeiro",
    deviceModel: "Dell Latitude 5440",
    deviceOs: "Windows 11",
  },
  {
    id: "carla.mendes",
    email: "carla.mendes@nexo.com.br",
    name: "Carla Mendes",
    role: "employee",
    department: "Recursos Humanos",
    deviceModel: "Lenovo ThinkPad E14",
    deviceOs: "Windows 11",
  },
  {
    id: "bruno.tavares",
    email: "bruno.tavares@nexo.com.br",
    name: "Bruno Tavares",
    role: "employee",
    department: "Comercial",
    deviceModel: "MacBook Air M2",
    deviceOs: "macOS 14",
  },
  {
    id: "diego.ramos",
    email: "diego.ramos@nexo.com.br",
    name: "Diego Ramos",
    role: "employee",
    department: "Engenharia",
    deviceModel: "Dell Precision 3581",
    deviceOs: "Ubuntu 22.04",
  },
  {
    id: "elisa.prado",
    email: "elisa.prado@nexo.com.br",
    name: "Elisa Prado",
    role: "employee",
    department: "Marketing",
    deviceModel: "HP EliteBook 840",
    deviceOs: "Windows 11",
  },
  {
    id: "fabio.nunes",
    email: "fabio.nunes@nexo.com.br",
    name: "Fábio Nunes",
    role: "employee",
    department: "Logística",
    deviceModel: "Dell Latitude 3420",
    deviceOs: "Windows 10",
  },
  {
    id: "gabriela.rocha",
    email: "gabriela.rocha@nexo.com.br",
    name: "Gabriela Rocha",
    role: "employee",
    department: "Jurídico",
    deviceModel: "Lenovo ThinkPad T14",
    deviceOs: "Windows 11",
  },
  {
    id: "rafael.lima",
    email: "rafael.lima@nexo.com.br",
    name: "Rafael Lima",
    role: "analyst",
    department: "Service Desk N1",
  },
  {
    id: "julia.castro",
    email: "julia.castro@nexo.com.br",
    name: "Júlia Castro",
    role: "analyst",
    department: "Service Desk N2",
  },
];

export const SEED_ARTICLES: ArticleInsert[] = [
  {
    slug: "vpn-erro-809",
    title: "VPN com erro 809",
    body: "VPN com erro 809: reinstale o cliente de VPN pelo portal de softwares e reinicie o computador. Vale apenas para Windows 10; no Windows 11, abra um chamado.",
    tags: ["vpn", "rede", "erro 809", "windows 10"],
  },
  {
    slug: "horario-do-service-desk",
    title: "Horário do service desk",
    body: "Horário do service desk: de segunda a sexta, das 8h às 18h. Chamados críticos têm plantão 24 horas.",
    tags: ["horário", "plantão", "atendimento", "service desk"],
  },
  {
    slug: "redefinir-senha-de-rede",
    title: "Como redefinir a senha de rede",
    body: "Acesse o portal de autoatendimento, escolha Esqueci minha senha e confirme sua identidade pelo código enviado ao celular cadastrado. A nova senha precisa ter ao menos 12 caracteres. Se a conta estiver bloqueada, abra um chamado de Acesso.",
    tags: ["senha", "acesso", "conta bloqueada", "autoatendimento"],
  },
  {
    slug: "configurar-email-no-celular",
    title: "Configurar o e-mail corporativo no celular",
    body: "Instale o aplicativo Outlook, toque em Adicionar conta e entre com seu e-mail corporativo. Aceite a política de segurança do dispositivo quando solicitada. Em caso de erro de autenticação, confirme a senha de rede e tente de novo.",
    tags: ["e-mail", "celular", "outlook", "configuração"],
  },
  {
    slug: "solicitar-software-pelo-portal",
    title: "Solicitar um software pelo portal",
    body: "Abra o portal de softwares, procure o programa no catálogo e clique em Solicitar. Programas do catálogo padrão são instalados automaticamente; os demais passam pela aprovação do gestor e geram uma requisição.",
    tags: ["software", "instalação", "portal", "requisição"],
  },
  {
    slug: "impressora-nao-imprime",
    title: "A impressora não imprime",
    body: "Confira se a impressora está ligada e conectada à rede, esvazie a fila de impressão e selecione de novo a impressora do seu andar. Se a fila continuar travada, reinicie o serviço de spooler ou abra um chamado de Hardware informando o modelo.",
    tags: ["impressora", "fila de impressão", "hardware"],
  },
  {
    slug: "wi-fi-de-visitantes",
    title: "Wi-Fi para visitantes",
    body: "Visitantes usam a rede Nexo-Visitantes. O anfitrião gera uma senha temporária no portal de visitantes, válida por 24 horas. A rede de visitantes não acessa sistemas internos.",
    tags: ["wi-fi", "visitantes", "rede"],
  },
  {
    slug: "notebook-lento-apos-atualizacao",
    title: "Notebook lento após atualização",
    body: "Reinicie o notebook para concluir as atualizações pendentes, feche programas que iniciam com o Windows e libere espaço em disco. Se a lentidão continuar por mais de um dia, abra um chamado de Hardware informando quando ela começou.",
    tags: ["notebook", "lentidão", "atualização", "windows"],
  },
];

// Ids fixos para o seed ser idempotente (rodar de novo não duplica nada).
const CONVERSATION_IDS = {
  waitingAnalyst: "0b1f6a52-3c1e-4d7a-9a55-1d6f3e0a0001",
  agent: "0b1f6a52-3c1e-4d7a-9a55-1d6f3e0a0002",
  closed: "0b1f6a52-3c1e-4d7a-9a55-1d6f3e0a0003",
} as const;

export function buildSeedConversations(now: Date): {
  conversations: ConversationInsert[];
  messages: MessageInsert[];
} {
  const ago = (hours: number): Date => new Date(now.getTime() - hours * HOUR_MS);
  const msg = (
    n: number,
    conversationId: string,
    author: MessageInsert["author"],
    authorId: string | null,
    content: string,
    hours: number,
  ): MessageInsert => ({
    id: `7c2d8e10-5a4b-4f6c-8b21-${String(n).padStart(12, "0")}`,
    conversationId,
    author,
    authorId,
    content,
    createdAt: ago(hours),
  });

  return {
    conversations: [
      {
        id: CONVERSATION_IDS.waitingAnalyst,
        employeeId: "ana.souza",
        state: "waiting_analyst",
        handoffReason: "O chamado está aguardando o analista há dias.",
        handoffSummary:
          "Ana relata notebook lento após a atualização do Windows; o chamado INC-20311 aguarda retorno do analista.",
        linkedTicketCode: "INC-20311",
        createdAt: ago(30),
        updatedAt: ago(28),
      },
      {
        id: CONVERSATION_IDS.agent,
        employeeId: "carla.mendes",
        state: "agent",
        createdAt: ago(3),
        updatedAt: ago(2),
      },
      {
        id: CONVERSATION_IDS.closed,
        employeeId: "fabio.nunes",
        state: "closed",
        createdAt: ago(72),
        updatedAt: ago(70),
      },
    ],
    messages: [
      msg(1, CONVERSATION_IDS.waitingAnalyst, "employee", "ana.souza", "Meu notebook ficou muito lento depois da última atualização. Tem novidade no meu chamado?", 30),
      msg(2, CONVERSATION_IDS.waitingAnalyst, "agent", null, "O chamado INC-20311 está aguardando um analista. Vou encaminhar a conversa para o time de suporte.", 29.9),
      msg(3, CONVERSATION_IDS.waitingAnalyst, "system", null, "Conversa encaminhada ao analista.", 28),
      msg(4, CONVERSATION_IDS.agent, "employee", "carla.mendes", "Como faço para configurar meu e-mail no celular?", 3),
      msg(5, CONVERSATION_IDS.agent, "agent", null, "Instale o aplicativo Outlook, toque em Adicionar conta e entre com seu e-mail corporativo. Conseguiu?", 2.9),
      msg(6, CONVERSATION_IDS.closed, "employee", "fabio.nunes", "A VPN mostra o erro 809.", 72),
      msg(7, CONVERSATION_IDS.closed, "agent", null, "No Windows 10, reinstale o cliente de VPN pelo portal de softwares e reinicie o computador.", 71.9),
      msg(8, CONVERSATION_IDS.closed, "employee", "fabio.nunes", "Funcionou, obrigado!", 70),
    ],
  };
}

export async function seedApp(db: Database, now: Date = new Date()): Promise<void> {
  await db
    .insert(users)
    .values(SEED_USERS)
    .onConflictDoUpdate({
      target: users.id,
      set: {
        email: sql`excluded.email`,
        name: sql`excluded.name`,
        role: sql`excluded.role`,
        department: sql`excluded.department`,
        deviceModel: sql`excluded.device_model`,
        deviceOs: sql`excluded.device_os`,
      },
    });

  await db
    .insert(kbArticles)
    .values(SEED_ARTICLES)
    .onConflictDoUpdate({
      target: kbArticles.slug,
      set: {
        title: sql`excluded.title`,
        body: sql`excluded.body`,
        tags: sql`excluded.tags`,
      },
    });

  // Conversas de demonstração: só entram na primeira vez, para não apagar o que o console já alterou.
  const demo = buildSeedConversations(now);
  await db.insert(conversations).values(demo.conversations).onConflictDoNothing();
  await db.insert(messages).values(demo.messages).onConflictDoNothing();
}

async function main(): Promise<void> {
  const { db, pool } = createDb(loadDbEnv().APP_DATABASE_URL);
  try {
    await seedApp(db);
    console.log("Seed do app aplicado.");
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
