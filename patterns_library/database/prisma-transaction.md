# Pattern: Prisma Transaction (Repository Layer)

> Stack pattern (monorepo-boilerplate). Prisma is only ever touched inside `repositories/` — transactions included.

## Use Case

Multiple database writes that must succeed or fail together (e.g. create a record + write an audit row, multi-table updates).

## The Pattern

Transactions live in a repository method; services call the repository like any other operation:

```typescript
// apps/api/src/core/<mod>/repositories/<mod>.repository.ts
import { getPrisma } from "@api/shared/database";

export class OrderRepository {
  async createWithAudit(input: CreateOrderInput, actorId: string) {
    const prisma = getPrisma();
    return prisma.$transaction(async (tx) => {
      const order = await tx.order.create({ data: input });
      await tx.auditLog.create({
        data: {
          entity: "order",
          entityId: order.id,
          action: "create",
          actorId,
        },
      });
      return order;
    });
  }
}
```

## Rules

- The `$transaction` callback uses `tx`, not the root client — every operation inside must go through `tx` or it escapes the transaction.
- Keep transactions short: no external calls (HTTP, `performServiceCall`), no logging-heavy work inside the callback — do that before/after.
- Services never see Prisma types; the repository returns domain-shaped data.
- Failures throw — let the service map them to `AppError` with a meaningful message.

## Testing

Cover the atomicity in an integration test (`*.integration.test.ts`, real Postgres via testcontainers): force the second write to fail and assert the first was rolled back.

```bash
pnpm nx test api --configuration=integration
```
