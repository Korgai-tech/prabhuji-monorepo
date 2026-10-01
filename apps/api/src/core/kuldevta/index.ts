import { loadRegistry } from "@prabhuji/kuldevta-registry";
import type { FastifyInstance } from "fastify";

import { getPrisma } from "@api/shared/database";
import { loadEnv } from "@api/shared/config";
import { createModuleLogger } from "@api/shared/logs";
import { registerGlobalService } from "@api/shared/workspace";
import { KuldevtaApi } from "@api/core/kuldevta/api";
import { KuldevtaController } from "@api/core/kuldevta/controllers";
import { callParserAgent, makeKuldevtaRepository } from "@api/core/kuldevta/repositories";
import { registerKuldevtaRoutes } from "@api/core/kuldevta/routes";
import type { PersonaIdentity } from "@api/core/kuldevta/api";

const log = createModuleLogger("kuldevta:bootstrap");

/**
 * Loads the deity/archetype identity `chatAsKuldevta` needs for one user,
 * joining `UserKuldevta.kuldevtaSlug` (Prisma) against the static registry
 * (deity row + its archetype's `voiceDirection`). Lives here, not in
 * `/services/`, for the same reason `saveAssignment` does: the service layer
 * must stay Prisma-free (arch-boundaries.json).
 */
export function makeLoadDeity(repo: ReturnType<typeof makeKuldevtaRepository>) {
  return async (userId: string): Promise<PersonaIdentity | null> => {
    const assignment = await repo.findAssignment(userId);
    // NULL, never a throw — `IKuldevtaApi.getPersonaIdentity` documents this as
    // its contract, and both callers in `core/chat` depend on it. Throwing here
    // broke both: `sendMessage` surfaced this module's 404 instead of the 409
    // the chat route declares, and `hasKuldevta` — which catches, because it
    // sits on the `GET /users/me` launch path — logged a
    // `kuldevta_assignment_lookup_failed` warning for every user who simply has
    // not answered the six questions yet, making an ordinary state
    // indistinguishable from a real kuldevta outage in the logs.
    //
    // Not having a kuldevta is not this module's error to classify: only the
    // caller knows whether it is a 409, a CTA, or a `false` in a launch
    // payload.
    if (!assignment) return null;

    const registry = loadRegistry();
    const deity = registry.deities.find((d) => d.id === assignment.kuldevtaSlug);
    if (!deity) throw new Error(`Assigned slug not found in registry: ${assignment.kuldevtaSlug}`);
    const archetype = registry.archetypes.find((a) => a.id === deity.archetype);
    if (!archetype) throw new Error(`Deity archetype not found in registry: ${deity.archetype}`);

    return {
      slug: deity.id,
      nameRoman: deity.nameRoman,
      gender: deity.gender,
      toneNotes: deity.toneNotes,
      archetypeVoice: archetype.voiceDirection,
      niyam: deity.niyam,
      mantra: deity.mantra,
      templeVillage: deity.templeVillage,
    };
  };
}

/**
 * Where a kuldevta's artwork lives, per environment.
 *
 * The key is derived from the slug — `kuldevta/kuldevta/<slug>.webp` — rather
 * than stored, because the 33 images are static registry art with a 1:1 slug
 * mapping, not editor-uploaded content. That makes the upload re-runnable and
 * the URL readable, where the `<uuid>.<ext>` shape `core/media` mints for
 * editor uploads would need a lookup table nobody edits.
 *
 * The HOST comes from `MEDIA_PUBLIC_BASE_URL`, never from the registry:
 * `deities.json` ships to every environment, so a baked-in CDN host would make
 * production serve stage's bucket.
 *
 * The prefix matches `keyPrefixFor("kuldevta", "kuldevta")` in
 * `core/media/media.allowlist.ts` so both paths agree if these images are ever
 * managed through the admin upload flow.
 */
function kuldevtaImageUrl(slug: string): string {
  return `${loadEnv().MEDIA_PUBLIC_BASE_URL}/kuldevta/kuldevta/${slug}.webp`;
}

/**
 * Composition root for the kuldevta module (TAM-165).
 *
 * Wires the layered dependencies (repo → controller, with the service
 * imported directly by the controller) and mounts `POST /kuldevta/identify`.
 * The persona turn is NOT a route here — it is served by `POST /chat/messages`
 * in `core/chat`, which reaches the session and identity deps below through
 * the `IKuldevtaApi` facade. This is the ONLY place Prisma-backed deps
 * (`saveAssignment`, `findAssignment`, `getSessionId`, `saveSessionId`) and
 * the network/registry deps meet the Prisma-free `identifyKuldevta`
 * service — both `/controllers/` and `/services/` are
 * forbidden from importing `@prisma/client` or the repository directly
 * (arch-boundaries.json), so the combined deps object is assembled here and
 * handed to the controller.
 */
export function initKuldevtaModule(app: FastifyInstance): void {
  const repo = makeKuldevtaRepository(getPrisma());
  const controller = new KuldevtaController({
    callParser: callParserAgent,
    loadRegistry,
    saveAssignment: (row) => repo.saveAssignment(row),
    imageUrlFor: kuldevtaImageUrl,
  });

  // The persona conversation is served by `core/chat`, not here: it needs a
  // transcript, history and a session model, all of which that module already
  // has. This facade is the only thing it needs from us — the deity, never the
  // family's lineage profile.
  registerGlobalService("kuldevta", new KuldevtaApi(makeLoadDeity(repo)));

  void app.register((scoped) => {
    registerKuldevtaRoutes(scoped, controller);
  });

  log.info("kuldevta module initialised");
}
