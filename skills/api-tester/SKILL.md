---
name: api-tester
description: >
  Guide for writing unit and integration tests for Lambda handlers in this project using
  Vitest and Testcontainers. Use this skill when the user wants to add or modify tests under
  tests/, configure vitest.config.ts, set up database test containers, write unit tests with
  mocked DB, write integration tests with a real DB, set up coverage reporting, or test any
  handler under src/functions/.
---

# API Tester

Two test layers — keep them separate:

| Layer | Speed | DB | Purpose |
|---|---|---|---|
| **Unit** | Fast | Mocked | Logic branches, error paths, edge cases |
| **Integration** | Slow | Real container | Full handler chain, SQL correctness, actual responses |

---

## File structure

```
tests/
├── global-setup.ts           — start DB container once, run migrations, provide URI
├── setup.ts                  — set DB env vars before each test file (integration only)
├── helpers/
│   └── event.ts              — build mock APIGateway proxy events
├── unit/
│   └── functions/
│       └── book/
│           └── get.test.ts   — unit tests (DB mocked)
└── integration/
    └── functions/
        └── book/
            └── get.test.ts   — integration tests (real DB)
vitest.config.ts
```

---

## Install dependencies

```bash
# Core
bun add -d vitest vite-tsconfig-paths

# PostgreSQL container
bun add -d @testcontainers/postgresql

# MySQL container
bun add -d @testcontainers/mysql
```

---

## vitest.config.ts

```typescript
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globalSetup: './tests/global-setup.ts',
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/functions/**'],
      exclude: ['src/functions/**/schema.ts'],  // schema files are config, not logic
      thresholds: {
        lines: 80,
        branches: 75,
        functions: 80,
      },
      reporter: ['text', 'lcov'],
    },
  },
});
```

---

## tests/global-setup.ts

Starts the DB container **once** for the whole run, runs migrations, then provides the
connection URI to test files via `provide()`.

### PostgreSQL

```typescript
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';

let container: StartedPostgreSqlContainer;

export async function setup({ provide }: { provide: (key: string, value: unknown) => void }) {
  container = await new PostgreSqlContainer('postgres:16').start();
  provide('dbUri', container.getConnectionUri());
  await runMigrations(container.getConnectionUri());
}

export async function teardown() {
  await container?.stop();
}
```

### MySQL

```typescript
import { MySqlContainer, type StartedMySqlContainer } from '@testcontainers/mysql';

let container: StartedMySqlContainer;

export async function setup({ provide }: { provide: (key: string, value: unknown) => void }) {
  container = await new MySqlContainer('mysql:8').start();
  provide('dbUri', container.getConnectionUri());
  await runMigrations(container.getConnectionUri());
}

export async function teardown() {
  await container?.stop();
}
```

### Migration — Kysely

```typescript
import { FileMigrationProvider, Kysely, Migrator, PostgresDialect } from 'kysely';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Pool } from 'pg'; // or mysql2 for MySQL

async function runMigrations(uri: string) {
  const pool = new Pool({ connectionString: uri });
  const db = new Kysely<any>({ dialect: new PostgresDialect({ pool }) });

  const { error } = await new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.resolve('.config/migrations'),
    }),
  }).migrateToLatest();

  if (error) throw error;
  await db.destroy();
}
```

### Migration — Drizzle

```typescript
import { drizzle } from 'drizzle-orm/node-postgres'; // or drizzle-orm/mysql2
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

async function runMigrations(uri: string) {
  const pool = new Pool({ connectionString: uri });
  const db = drizzle(pool);
  await migrate(db, { migrationsFolder: './drizzle' });
  await pool.end();
}
```

---

## tests/setup.ts

Runs in **each worker before any test file is imported**. Parses the URI and sets
`process.env.DB_*` so the handler's module-level DB call reads the right values.

```typescript
import { inject } from 'vitest';

// Only needed for integration tests — unit tests mock the DB
if (inject('dbUri')) {
  const uri = inject('dbUri') as string;
  const url = new URL(uri);

  process.env.DB_HOST = url.hostname;
  process.env.DB_PORT = url.port;
  process.env.DB_NAME = url.pathname.slice(1);
  process.env.DB_USER = url.username;
  process.env.DB_PASSWORD = decodeURIComponent(url.password);
  process.env.SERVICE_NAME = 'test';
}
```

---

## tests/helpers/event.ts

```typescript
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';

type EventOptions = {
  pathParameters?: Record<string, string>;
  queryStringParameters?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string>;
};

export function buildEvent(options: EventOptions = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    path: '/',
    resource: '/',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    multiValueHeaders: {},
    queryStringParameters: options.queryStringParameters ?? null,
    multiValueQueryStringParameters: null,
    pathParameters: options.pathParameters ?? null,
    stageVariables: null,
    body: options.body !== undefined ? JSON.stringify(options.body) : null,
    isBase64Encoded: false,
    requestContext: {
      accountId: '123456789012',
      apiId: 'test-api-id',
      httpMethod: 'GET',
      identity: {
        accessKey: null, accountId: null, apiKey: null, apiKeyId: null,
        caller: null, clientCert: null, cognitoAuthenticationProvider: null,
        cognitoAuthenticationType: null, cognitoIdentityId: null,
        cognitoIdentityPoolId: null, principalOrgId: null, sourceIp: '127.0.0.1',
        user: null, userAgent: 'test', userArn: null,
      },
      path: '/',
      protocol: 'HTTP/1.1',
      requestId: 'test-request-id',
      requestTimeEpoch: Date.now(),
      resourceId: 'test-resource-id',
      resourcePath: '/',
      stage: 'test',
    },
  };
}

export const mockContext: Context = {
  callbackWaitsForEmptyEventLoop: false,
  functionName: 'test-function',
  functionVersion: '$LATEST',
  invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function',
  memoryLimitInMB: '1024',
  awsRequestId: 'test-request-id',
  logGroupName: '/aws/lambda/test-function',
  logStreamName: '2024/01/01/[$LATEST]test',
  getRemainingTimeInMillis: () => 60000,
  done: () => {},
  fail: () => {},
  succeed: () => {},
};
```

---

## Unit test template

Mock the DB module so tests run without a container. Focus on logic branches and error paths.

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock before importing the handler — module order matters
vi.mock('@/database', () => ({
  createKysely: vi.fn(),
}));

import { createKysely } from '@/database';
import { handler } from '@/functions/book/get';

import { buildEvent, mockContext } from '../../helpers/event';

const mockDb = {
  selectFrom: vi.fn().mockReturnThis(),
  innerJoin: vi.fn().mockReturnThis(),
  selectAll: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  executeTakeFirst: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createKysely).mockReturnValue(mockDb as any);
});

describe('GET /book/{id} — unit', () => {
  it('returns 200 when book exists', async () => {
    const book = { id: 'abc', bookName: 'Test', categoryName: 'Fiction' };
    mockDb.executeTakeFirst.mockResolvedValue(book);

    const response = await handler(buildEvent({ pathParameters: { id: 'abc' } }), mockContext);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body as string)).toMatchObject({ bookName: 'Test' });
  });

  it('returns 404 when book is not found', async () => {
    mockDb.executeTakeFirst.mockResolvedValue(undefined);

    const response = await handler(buildEvent({ pathParameters: { id: 'missing' } }), mockContext);

    expect(response.statusCode).toBe(404);
  });
});
```

---

## Integration test template

Use a real DB container. Insert seed data per test; truncate in `beforeEach`.

```typescript
import { Kysely, PostgresDialect } from 'kysely'; // or Drizzle equivalent
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, inject } from 'vitest';

import { handler } from '@/functions/book/get';

import { buildEvent, mockContext } from '../../helpers/event';

let db: Kysely<any>;

beforeAll(() => {
  db = new Kysely({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: inject('dbUri') as string }) }) });
});

afterAll(() => db.destroy());

// Truncate in FK-safe order (child tables first)
beforeEach(async () => {
  await db.deleteFrom('book_tbl').execute();
  await db.deleteFrom('category_tbl').execute();
});

describe('GET /book/{id} — integration', () => {
  it('returns book with category name', async () => {
    const categoryId = crypto.randomUUID();
    await db.insertInto('category_tbl').values({ id: categoryId, categoryName: 'Fiction', createdAt: new Date() }).execute();

    const bookId = crypto.randomUUID();
    await db.insertInto('book_tbl').values({
      id: bookId, categoryId, bookName: 'Test Book', description: 'Desc', createdAt: new Date(),
    }).execute();

    const response = await handler(buildEvent({ pathParameters: { id: bookId } }), mockContext);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body as string);
    expect(body).toMatchObject({ id: bookId, bookName: 'Test Book', categoryName: 'Fiction' });
  });

  it('returns 404 for unknown ID', async () => {
    const response = await handler(buildEvent({ pathParameters: { id: '00000000-0000-0000-0000-000000000000' } }), mockContext);
    expect(response.statusCode).toBe(404);
  });
});
```

---

## Coverage strategy

### What to cover

| Path | Target | Rationale |
|---|---|---|
| `src/functions/**/index.ts` | ≥ 80% lines, ≥ 75% branches | All handler logic and error paths |
| `src/utils/*.ts` | ≥ 80% lines | Shared utilities |
| `src/functions/**/schema.ts` | Excluded | Declarative config, no branches to test |
| `src/database/**` | Integration tests cover it | Tested implicitly via handler calls |

### Unit vs integration split

- **Unit tests** cover: conditional branches (`if (!result)`), error throws (`createError.NotFound`), response shape.
- **Integration tests** cover**: SQL correctness, JOIN results, constraint violations, migration validity.
- Avoid duplicating coverage: if a branch is fully exercised by unit tests, integration tests don't need to repeat it — focus integration tests on DB-specific behavior.

### Run with coverage

```bash
bun run test --coverage
```

---

## Key rules

### response.body is a string
`serializer()` runs as part of the Middy chain. Always `JSON.parse(response.body as string)` before asserting on fields.

### vi.mock before handler import
`vi.mock('@/database', ...)` must appear **before** `import { handler }` in unit test files — Vitest hoists `vi.mock` calls automatically, but the explicit ordering makes intent clear.

### inject() only inside hooks or tests
`inject()` returns `undefined` at module level. Call it inside `beforeAll`, `beforeEach`, or test bodies.

### POST/PUT body
Handlers with `JSONStringified(bodySchema)` expect `event.body` as a JSON **string**. `buildEvent({ body: {...} })` handles this automatically.

### Add test scripts to package.json

```json
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage"
}
```
