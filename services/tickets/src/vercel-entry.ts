import { getRequestListener } from "@hono/node-server";
import { createServerApp } from "./server-app";

const { app } = createServerApp();

// Entrada da função na Vercel (launcher Node): a plataforma exige o listener como export default.
export default getRequestListener(app.fetch);
