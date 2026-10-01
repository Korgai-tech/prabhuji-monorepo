import createClient from "openapi-fetch";
import type { paths } from "./types.js";

export function createApiClient(baseUrl: string) {
  return createClient<paths>({ baseUrl });
}

export type { paths } from "./types.js";
