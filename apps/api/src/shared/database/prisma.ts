import { PrismaClient } from "@prisma/client";
import { createModuleLogger } from "../logs/index.js";

const log = createModuleLogger("database:prisma");
let client: PrismaClient | undefined;

export function getPrisma(): PrismaClient {
  if (!client) {
    client = new PrismaClient();
  }
  return client;
}

export async function connectPrisma(): Promise<void> {
  await getPrisma().$connect();
  log.info("prisma connected");
}

export async function disconnectPrisma(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = undefined;
    log.info("prisma disconnected");
  }
}
