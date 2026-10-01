import Redis from "ioredis";
import { loadEnv } from "../config/index.js";
import { createModuleLogger } from "../logs/index.js";

const log = createModuleLogger("database:redis");
let client: Redis | null = null;

export async function initRedis(): Promise<void> {
  const env = loadEnv();
  if (!env.ENABLE_REDIS) {
    log.info("redis disabled (ENABLE_REDIS=false)");
    return;
  }
  if (!env.REDIS_URL) {
    throw new Error("ENABLE_REDIS=true but REDIS_URL is not set");
  }
  client = new Redis(env.REDIS_URL, { lazyConnect: true });
  await client.connect();
  log.info("redis connected");
}

export function getRedis(): Redis | null {
  return client;
}

export function closeRedis(): Promise<void> {
  if (client) {
    client.disconnect();
    client = null;
  }
  return Promise.resolve();
}
