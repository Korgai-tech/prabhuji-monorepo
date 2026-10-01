import type { IKuldevtaApi, PersonaIdentity } from "./kuldevta.api.js";

/** Thin adapter — the facade shape over the identity loader. */
export class KuldevtaApi implements IKuldevtaApi {
  constructor(private readonly loadIdentity: (userId: string) => Promise<PersonaIdentity | null>) {}

  getPersonaIdentity(userId: string): Promise<PersonaIdentity | null> {
    return this.loadIdentity(userId);
  }
}
