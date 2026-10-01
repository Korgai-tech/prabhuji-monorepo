# Phase 5 Task 1 — floci-gcp Verification

Records what was actually confirmed by running `floci/floci-gcp:latest` locally (Docker 28.5.1, macOS/arm64), so Tasks 2-6 can build on verified facts instead of assumptions.

## Environment

`docker run --rm -d -p 4588:4588 -v /var/run/docker.sock:/var/run/docker.sock -v <data>:/app/data -e FLOCI_GCP_HOSTNAME=floci-gcp -e FLOCI_GCP_BASE_URL=http://localhost:4588 floci/floci-gcp:latest`
Container reported healthy in ~5s. `GET /_floci-gcp/health` → `{"services":{...,"kafka":"running",...,"secretmanager":"running",...},"version":"0.4.0"}`. All 16 registered services report `running` at boot, including `kafka` and `secretmanager` — but "running" only means the service is registered in floci's `ServiceRegistry`, not that every RPC on that service is implemented (see Kafka finding below).

## Secret Manager — CONFIRMED WORKING

`@google-cloud/secret-manager` v6.2.0 + `@grpc/grpc-js` v1.x, temporarily installed in a scratch dir (not committed).
**Client construction note (deviates from the brief's suggested config):** passing `apiEndpoint: "localhost:4588"` as a single string fails — newer `google-gax` (v5.0.7) splits host/port and defaults the port to 443 when the endpoint string doesn't parse as expected, producing `UNAVAILABLE: Name resolution failed for target dns:localhost:4588:443`. The working construction splits them explicitly:

```js
new SecretManagerServiceClient({
  apiEndpoint: 'localhost',
  port: 4588,
  sslCreds: grpc.credentials.createInsecure(),
});
```

Round-trip confirmed: `createSecret` → `addSecretVersion` → `accessSecretVersion` against project `floci-local` returned the exact payload written (`hello-from-phase5-smoke`). floci logs show the gRPC calls landing on `google.cloud.secretmanager.v1.SecretManagerService/{CreateSecret,AddSecretVersion,AccessSecretVersion}`, each completing in single-digit milliseconds.
**Task-3 default:** `SECRET_MANAGER_EMULATOR_HOST=localhost:4588`, `SECRET_MANAGER_PROJECT_ID=floci-local` — but the Node client must be constructed with separate `apiEndpoint`/`port` fields (or an emulator-host helper that does the split), not a single `host:port` string.

## Kafka — NOT CONFIRMED (floci does not implement the Managed Kafka gRPC surface)

**No redpanda sidecar was ever spawned.** Docker `ps` before/after every Kafka attempt showed no new container, and floci's own logs show no Docker Engine API calls despite the socket being mounted — confirming the sidecar is provisioned lazily, on a request floci never received successfully (see below).

Two paths were attempted:

1. **`google.cloud.managedkafka.v1.ManagedKafka` gRPC service** (via `@google-cloud/managedkafka`, temporarily installed), constructed the same way as the working Secret Manager client (`apiEndpoint: 'localhost', port: 4588`). Every method tried — `ListClusters`, `GetCluster`, `CreateCluster`, `ListTopics`, `CreateTopic` — returned gRPC code `12 UNIMPLEMENTED`: `"Method not found: google.cloud.managedkafka.v1.ManagedKafka/<Method>"`. floci's request log confirms the calls reached its gRPC router (`POST /google.cloud.managedkafka.v1.ManagedKafka/ListClusters, content-type=application/grpc` → routed, 0ms) — so the service name resolves, but no method handler is wired up in this floci build (`0.4.0`). This is very likely why `kafka` still shows `"running"` in `/_floci-gcp/health`: the registry entry exists, the RPC implementations do not (yet, in this version).
2. **REST `/kafka` path:** `GET /kafka` → `405`, `OPTIONS /kafka` → `200` (empty), `POST /kafka` with `application/json` → `405`. This confirms `/kafka` is a gRPC-only route (HTTP/2 + `application/grpc` content-type), not a plain REST admin API — there is no alternate REST path to provision a topic that was found.

**False positive to flag explicitly:** an initial kafkajs produce→consume smoke against `localhost:9092` (the redpanda default) returned `SUCCESS` and listed topics `call`, `wallet`, `key.events.raw`, `phase5-smoke-topic`, `features.push`. Those topic names belong to an unrelated, pre-existing `confluentinc/cp-kafka` container (`docker ps` name `kafka`, image `confluentinc/cp-kafka:7.7.0.arm64`) already running on this machine for a different project — **not** anything spawned by floci. Port 9092 was occupied before floci ever started. This result must be disregarded; it does not verify floci's Kafka emulation.

**Conclusion:** floci-gcp `0.4.0`'s Managed Kafka emulation is not host-side reachable via the standard `@google-cloud/managedkafka` client in this build — either the sidecar-spawn trigger is a different RPC/REST call not yet found, or Kafka emulation is incomplete in this floci version. Per the bounded-effort instruction, this was not pursued further after exhausting the standard `ManagedKafka` proto surface and the obvious REST paths.

**Task-2 default (pending Task 6):** `KAFKA_BROKERS=localhost:9092` — carried forward as the planned/likely address per the brief (redpanda's conventional default), **not verified against floci in this task**. Task 6 must re-attempt the live round-trip — starting points for that investigation: (a) check for a newer floci-gcp image/tag with Kafka RPCs implemented, (b) inspect floci's own source/docs (not available in the native-image container filesystem — it's a compiled Quarkus native binary with no shell) for the actual sidecar-trigger mechanism, (c) try `docker logs -f` on floci while retrying each `ManagedKafka` method to see if any non-standard method name is expected.

## Test scope note
No dedicated Kafka smoke should be treated as passing until Task 6 gets a real round-trip against a floci-spawned broker; `KAFKA_BROKERS=localhost:9092` is a placeholder default, not a verified value.

## Cleanup
All smoke-test scripts ran from a scratch dir outside the repo; `@google-cloud/secret-manager`, `@google-cloud/managedkafka`, `@grpc/grpc-js`, and `kafkajs` were never added to this repo's `package.json`/`pnpm-lock.yaml`. The `floci-gcp` container used for verification was removed after this task (`docker rm -f`); it is not left running.
