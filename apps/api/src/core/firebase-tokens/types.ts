export type FirebasePlatform = "ios" | "android";

export interface FirebaseTokenUpsertInput {
  userId: string;
  token: string;
  deviceId: string;
  platform: FirebasePlatform;
}

export interface FirebaseTokenDeleteInput {
  userId: string;
  deviceId: string;
}
