# Drizzle + Lambda Integration Reference

Patterns for using Drizzle ORM inside Lambda handlers following the `lambda-api-developer` skill conventions.

---

## Database singleton in src/db/index.ts

The Drizzle instance is created **once at module load time** and reused across warm Lambda invocations.
This is the same pattern the `api-tester` skill relies on when mocking `@/db`.

```typescript
// src/db/index.ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 1,
  idleTimeoutMillis: 0,
});

export const db = drizzle(pool, { schema });
```

**Why module-level?** Lambda reuses the execution environment between invocations (warm starts).
A module-level pool is initialised once and then reused, avoiding a new TCP handshake on every request.

---

## Handler pattern — GET (single resource)

```typescript
// src/functions/user/get/index.ts
import { injectLambdaContext } from '@aws-lambda-powertools/logger/middleware';
import { parser } from '@aws-lambda-powertools/parser/middleware';
import middy from '@middy/core';
import httpErrorHandler from '@middy/http-error-handler';
import createError from 'http-errors';
import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { users } from '@/db/schema';
import { logger } from '@/utils/logger.util';
import { serializer } from '@/utils/response.util';
import { schema } from './schema';

export const handler = middy()
  .use(injectLambdaContext(logger, { logEvent: true, correlationIdPath: 'requestContext.requestId' }))
  .use(httpErrorHandler())
  .use(serializer())
  .use(parser({ schema }))
  .handler(async (event) => {
    const { id } = event.pathParameters;

    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .then((rows) => rows[0]);

    if (!user) throw new createError.NotFound('User not found');

    return { statusCode: 200, body: user };
  });
```

---

## Handler pattern — GET (list with pagination)

```typescript
// src/functions/user/list/index.ts
import { asc } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';

export const handler = middy()
  /* ... middleware chain ... */
  .handler(async (event) => {
    const { offset, limit } = event.queryStringParameters;

    const items = await db
      .select()
      .from(users)
      .orderBy(asc(users.createdAt))
      .limit(limit)
      .offset(offset);

    return { statusCode: 200, body: { items, total: items.length } };
  });
```

---

## Handler pattern — POST (create)

```typescript
// src/functions/user/create/index.ts
import { db } from '@/db';
import { users } from '@/db/schema';

export const handler = middy()
  /* ... middleware chain ... */
  .handler(async (event) => {
    const { name, email } = event.body;

    const [created] = await db
      .insert(users)
      .values({ name, email })
      .returning();

    return { statusCode: 201, body: { id: created.id } };
  });
```

---

## Handler pattern — PUT (update)

```typescript
// src/functions/user/update/index.ts
import { eq } from 'drizzle-orm';
import createError from 'http-errors';
import { db } from '@/db';
import { users } from '@/db/schema';

export const handler = middy()
  /* ... middleware chain ... */
  .handler(async (event) => {
    const { id } = event.pathParameters;
    const { name } = event.body;

    const [updated] = await db
      .update(users)
      .set({ name })
      .where(eq(users.id, id))
      .returning();

    if (!updated) throw new createError.NotFound('User not found');

    return { statusCode: 200, body: updated };
  });
```

---

## Handler pattern — DELETE

```typescript
// src/functions/user/delete/index.ts
import { eq } from 'drizzle-orm';
import createError from 'http-errors';
import { db } from '@/db';
import { users } from '@/db/schema';

export const handler = middy()
  /* ... middleware chain ... */
  .handler(async (event) => {
    const { id } = event.pathParameters;

    const [deleted] = await db
      .delete(users)
      .where(eq(users.id, id))
      .returning();

    if (!deleted) throw new createError.NotFound('User not found');

    return { statusCode: 204 };
  });
```

---

## schema.ts pattern — paired with handler

Each handler folder contains a `schema.ts` that validates the incoming event.
The Drizzle schema lives separately in `src/db/schema.ts` — do not confuse the two.

```typescript
// src/functions/user/get/schema.ts  ← Zod/Powertools event schema
import { APIGatewayProxyEventSchema } from '@aws-lambda-powertools/parser/schemas/api-gateway';
import z from 'zod';
import { registry } from '@/utils/openapi.util';
import { SCHEMA } from '@/utils/schema.util';

const pathParamsSchema = z.object({ id: SCHEMA.common.id });

registry.registerPath({
  method: 'get',
  path: '/users/{id}',
  summary: 'Get a user by ID',
  tags: ['User'],
  request: { params: pathParamsSchema },
  responses: {
    200: { description: 'User found', content: { 'application/json': { schema: z.object({ id: z.string(), name: z.string() }) } } },
    404: { description: 'User not found' },
  },
});

export const schema = APIGatewayProxyEventSchema.extend({
  pathParameters: pathParamsSchema,
});
```

---

## Unit test — mocking @/db

The `api-tester` skill's unit test pattern mocks `@/db` at the module level.
Mock the `db` object with the chained methods your handler uses.

```typescript
// tests/unit/functions/user/get.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    then: vi.fn(),
  },
}));

import { db } from '@/db';
import { handler } from '@/functions/user/get';
import { buildEvent, mockContext } from '../../../helpers/event';

beforeEach(() => vi.clearAllMocks());

describe('GET /users/{id}', () => {
  it('returns 200 when user exists', async () => {
    vi.mocked(db.select().from(users).where(eq(users.id, '')).then)
      .mockResolvedValue([{ id: 'abc', name: 'Alice' }]);

    const response = await handler(
      buildEvent({ pathParameters: { id: 'abc' } }),
      mockContext,
    );

    expect(response.statusCode).toBe(200);
  });

  it('returns 404 when user is not found', async () => {
    vi.mocked(db.select().from(users).where(eq(users.id, '')).then)
      .mockResolvedValue([]);

    const response = await handler(
      buildEvent({ pathParameters: { id: 'missing' } }),
      mockContext,
    );

    expect(response.statusCode).toBe(404);
  });
});
```

> **Tip**: For simpler mocking, extract the DB call into a thin repository function and mock that instead of chaining mocks on the drizzle builder.

---

## Integration test — real DB container

The `api-tester` skill's `tests/global-setup.ts` starts a Testcontainers DB and passes `dbUri` via `provide()`.
In Drizzle integration tests, use the URI to create a direct drizzle connection — bypassing the module-level pool.

```typescript
// tests/integration/functions/user/get.test.ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import * as schema from '@/db/schema';
import { users } from '@/db/schema';
import { handler } from '@/functions/user/get';
import { buildEvent, mockContext } from '../../../helpers/event';

let pool: Pool;
let db: ReturnType<typeof drizzle>;

beforeAll(async () => {
  pool = new Pool({ connectionString: inject('dbUri') as string });
  db = drizzle(pool, { schema });
  await migrate(db, { migrationsFolder: './drizzle' });
});

afterAll(() => pool.end());

beforeEach(() => db.delete(users).execute());

describe('GET /users/{id} — integration', () => {
  it('returns user from DB', async () => {
    const [user] = await db
      .insert(users)
      .values({ name: 'Alice', email: 'alice@example.com' })
      .returning();

    const response = await handler(
      buildEvent({ pathParameters: { id: user.id } }),
      mockContext,
    );

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body as string)).toMatchObject({ name: 'Alice' });
  });

  it('returns 404 for unknown id', async () => {
    const response = await handler(
      buildEvent({ pathParameters: { id: '00000000-0000-0000-0000-000000000000' } }),
      mockContext,
    );
    expect(response.statusCode).toBe(404);
  });
});
```

---

## Environment variables

All DB connection values are read from environment variables. Set these in Lambda function configuration (CDK / SAM / Console):

| Variable | Example |
|---|---|
| `DB_HOST` | `my-db.cluster-xxx.us-east-1.rds.amazonaws.com` |
| `DB_PORT` | `5432` (pg) / `3306` (mysql) |
| `DB_NAME` | `myapp` |
| `DB_USER` | `lambda_user` |
| `DB_PASSWORD` | (from Secrets Manager via CDK) |

For local dev, put them in a `.env` file and load with `dotenv` or Bun's built-in env support.
