---
name: drizzle-developer
description: >
  Guide for using Drizzle ORM and Drizzle Kit in this project. Use this skill whenever
  the user wants to define database schemas, write queries (select, insert, update, delete),
  set up a database connection, manage migrations with drizzle-kit generate/migrate/push,
  configure drizzle.config.ts, or work with any file under src/db/.
  Also invoke when the user asks about Drizzle relations, type inference, or Drizzle Studio.
---

# Drizzle Developer

Drizzle ORM is a TypeScript-first ORM with a SQL-like query API and zero dependencies.
Every database interaction in this project goes through a Drizzle instance defined in `src/db/index.ts`.

---

## File structure

```
src/db/
├── index.ts       — Drizzle instance (singleton, reused across Lambda warm starts)
├── schema.ts      — All table definitions and relations
└── types.ts       — Inferred select/insert types exported for use in handlers
drizzle/           — Generated migration SQL files (committed to git)
drizzle.config.ts  — Drizzle Kit configuration
```

---

## Install dependencies

```bash
# PostgreSQL
bun add drizzle-orm postgres
bun add -d drizzle-kit

# MySQL
bun add drizzle-orm mysql2
bun add -d drizzle-kit
```

---

## drizzle.config.ts

Place at project root. Required by all `drizzle-kit` commands.

```typescript
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',   // or 'mysql'
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

---

## src/db/index.ts — database singleton

Create the Drizzle instance at **module level** so it is reused across Lambda warm starts.
Never create a new connection inside the handler function.

### PostgreSQL

```typescript
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 1,              // keep pool size at 1 for Lambda
  idleTimeoutMillis: 0,
});

export const db = drizzle(pool, { schema });

// Export for test mocking
export const createKysely = () => db; // alias used by api-tester mocks — keep if present
```

### MySQL

```typescript
import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as schema from './schema';

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 3306),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  connectionLimit: 1,
});

export const db = drizzle(pool, { schema, mode: 'default' });
```

---

## src/db/schema.ts — table definitions

### PostgreSQL column types

```typescript
import {
  pgTable,
  uuid,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: varchar('email', { length: 256 }).notNull().unique(),
  verified: boolean('verified').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const posts = pgTable('posts', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 256 }).notNull(),
  content: text('content').notNull(),
  authorId: uuid('author_id').references(() => users.id).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Relations (used by relational query API only)
export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
}));

export const postsRelations = relations(posts, ({ one }) => ({
  author: one(users, { fields: [posts.authorId], references: [users.id] }),
}));
```

### MySQL column types

```typescript
import { mysqlTable, varchar, int, boolean, datetime } from 'drizzle-orm/mysql-core';

export const users = mysqlTable('users', {
  id: varchar('id', { length: 36 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 256 }).notNull().unique(),
  verified: boolean('verified').default(false).notNull(),
  createdAt: datetime('created_at').notNull(),
});
```

### Type inference

```typescript
// src/db/types.ts
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import type { users, posts } from './schema';

export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;
export type Post = InferSelectModel<typeof posts>;
export type NewPost = InferInsertModel<typeof posts>;
```

---

## Queries

### SELECT

```typescript
import { db } from '@/db';
import { users, posts } from '@/db/schema';
import { eq, and, like, desc, asc } from 'drizzle-orm';

// Select all
const allUsers = await db.select().from(users);

// Select specific columns
const names = await db.select({ id: users.id, name: users.name }).from(users);

// With WHERE
const user = await db.select().from(users).where(eq(users.id, id));

// Multiple conditions
const results = await db
  .select()
  .from(users)
  .where(and(eq(users.verified, true), like(users.name, '%dan%')));

// ORDER BY + LIMIT + OFFSET (pagination)
const page = await db
  .select()
  .from(users)
  .orderBy(desc(users.createdAt))
  .limit(20)
  .offset(0);

// executeTakeFirst — returns undefined if not found
const found = await db
  .select()
  .from(users)
  .where(eq(users.id, id))
  .then((rows) => rows[0]);
```

### Relational queries (requires `schema` passed to drizzle())

```typescript
// findMany with nested relation
const usersWithPosts = await db.query.users.findMany({
  with: { posts: true },
  limit: 10,
});

// findFirst — returns undefined if not found
const userWithPosts = await db.query.users.findFirst({
  where: eq(users.id, id),
  with: { posts: { limit: 5, orderBy: desc(posts.createdAt) } },
});
```

### INSERT

```typescript
// Insert and return inserted row (PostgreSQL)
const [newUser] = await db
  .insert(users)
  .values({ name: 'Alice', email: 'alice@example.com' })
  .returning();

// Insert multiple rows
await db.insert(users).values([
  { name: 'Alice', email: 'alice@example.com' },
  { name: 'Bob',   email: 'bob@example.com' },
]);
```

### UPDATE

```typescript
import { eq } from 'drizzle-orm';

// Update and return updated row (PostgreSQL)
const [updated] = await db
  .update(users)
  .set({ verified: true })
  .where(eq(users.id, id))
  .returning();

// Check if row existed (returning is empty if WHERE matched nothing)
if (!updated) throw new createError.NotFound();
```

### DELETE

```typescript
// Delete and return deleted row (PostgreSQL)
const [deleted] = await db
  .delete(users)
  .where(eq(users.id, id))
  .returning();

if (!deleted) throw new createError.NotFound();
```

---

## Drizzle Kit commands

| Command | What it does |
|---|---|
| `drizzle-kit generate` | Diff schema against previous migration → produce new SQL file in `drizzle/` |
| `drizzle-kit migrate` | Apply pending SQL files in `drizzle/` to the database |
| `drizzle-kit push` | Apply schema directly to DB without generating a file (dev only) |
| `drizzle-kit pull` | Introspect existing DB and generate schema.ts |
| `drizzle-kit studio` | Open browser-based DB GUI |

### Typical dev workflow

```bash
# 1. Edit src/db/schema.ts
# 2. Generate migration
bunx drizzle-kit generate --name=add-posts-table

# 3. Review the generated SQL in drizzle/
# 4. Apply to local DB
bunx drizzle-kit migrate

# Alternative: push directly (no migration file, dev only)
bunx drizzle-kit push
```

### Add scripts to package.json

```json
{
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:migrate":  "drizzle-kit migrate",
    "db:push":     "drizzle-kit push",
    "db:studio":   "drizzle-kit studio"
  }
}
```

---

## Key rules

### Pool size must be 1 in Lambda
Lambda functions share no connections between instances. Set `max: 1` (pg) or `connectionLimit: 1` (mysql2) to avoid exceeding database connection limits at scale.

### Always use `returning()` for mutations (PostgreSQL)
`.returning()` gives you the full updated/deleted row in one round-trip. Prefer it over a follow-up SELECT.

### `db.query.*` requires schema in drizzle()
Pass `{ schema }` when creating the drizzle instance, otherwise relational queries throw at runtime.

### Use `eq`, `and`, `or`, `like`, `gte`, `lte` from `drizzle-orm`
All filter helpers are imported from `drizzle-orm`, not from the dialect package.

---

## Reference files

- `references/lambda-integration.md` — patterns for using Drizzle inside Lambda handlers and tests
