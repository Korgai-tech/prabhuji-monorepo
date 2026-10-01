import type { IAartiApi } from "@api/core/aarti/api";
import type { IAuthApi } from "@api/core/auth/api";
import type { IBooksApi } from "@api/core/books/api";
import type { IChatApi } from "@api/core/chat/api";
import type { IDeityApi } from "@api/core/deity/api";
import type { IEngagementApi } from "@api/core/engagement/api";
import type { IKuldevtaApi } from "@api/core/kuldevta/api";
import type { IHomeApi } from "@api/core/home/api";
import type { IHoroscopeApi } from "@api/core/horoscope/api";
import type { IMantrasApi } from "@api/core/mantras/api";
import type { IMediaApi } from "@api/core/media/api";
import type { IPaymentApi } from "@api/core/payment/api";
import type { IPaywallApi } from "@api/core/paywall/api";
import type { IPinnedContentApi } from "@api/core/pinned-content/api";
import type { IRingtoneApi } from "@api/core/ringtone/api";
import type { IStatusApi } from "@api/core/status/api";
import type { ISubscriptionApi } from "@api/core/subscription/api";
import type { IUsersApi } from "@api/core/users/api";
import type { IWallpaperApi } from "@api/core/wallpaper/api";
import { AppError } from "../errors/index.js";

// The single place `shared/` may reference module `api/` interfaces (type-only).
// The Nx module generator adds one line here per new module.
export interface GlobalServiceMap {
  aarti: IAartiApi;
  auth: IAuthApi;
  books: IBooksApi;
  chat: IChatApi;
  deity: IDeityApi;
  engagement: IEngagementApi;
  kuldevta: IKuldevtaApi;
  home: IHomeApi;
  horoscope: IHoroscopeApi;
  mantras: IMantrasApi;
  media: IMediaApi;
  payment: IPaymentApi;
  paywall: IPaywallApi;
  pinnedContent: IPinnedContentApi;
  ringtone: IRingtoneApi;
  status: IStatusApi;
  subscription: ISubscriptionApi;
  users: IUsersApi;
  wallpaper: IWallpaperApi;
}

const services = new Map<keyof GlobalServiceMap, unknown>();

export function registerGlobalService<K extends keyof GlobalServiceMap>(
  key: K,
  impl: GlobalServiceMap[K]
): void {
  services.set(key, impl);
}

export function getGlobalService<K extends keyof GlobalServiceMap>(
  key: K
): GlobalServiceMap[K] | null {
  return (services.get(key) as GlobalServiceMap[K] | undefined) ?? null;
}

export function clearGlobalServices(): void {
  services.clear();
}

export async function performServiceCall<K extends keyof GlobalServiceMap, R>(
  key: K,
  op: (svc: GlobalServiceMap[K]) => Promise<R> | R,
  context: string,
  failureMessage: string
): Promise<R> {
  const svc = getGlobalService(key);
  if (!svc) {
    throw new AppError(
      `${failureMessage} (service '${String(key)}' not registered)`,
      500,
      "SERVICE_UNAVAILABLE"
    );
  }
  try {
    return await op(svc);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(`${failureMessage} [${context}]`, 500, "SERVICE_CALL_FAILED");
  }
}
