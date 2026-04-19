---
description: Generate a new Lambda handler with index.ts and schema.ts
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
argument-hint: [resource] [action]
---

Generate a new AWS Lambda handler following the project's established patterns.
The user may have provided a resource and/or action as arguments: $ARGUMENTS

## Step 1 — Collect handler information

Use AskUserQuestion to confirm the details needed to generate the handler.
Pre-fill answers from $ARGUMENTS where possible (first word = resource, second word = action).
Ask all questions in a single call.

Questions to ask:

1. **Resource name** — the entity this handler operates on (e.g. `user`, `order`, `post`)
   - Pre-fill from first word of $ARGUMENTS if available
   - Options: free text

2. **HTTP method** — the method this handler handles
   - Options: GET (single), GET (list), POST, PUT, DELETE

3. **Action name** — the sub-directory name under the resource (e.g. `get`, `list`, `create`, `update`, `delete`)
   - Pre-fill from second word of $ARGUMENTS if available, or suggest based on method:
     GET (single) → get, GET (list) → list, POST → create, PUT → update, DELETE → delete
   - Options: free text

4. **Does this handler use the database?**
   - Options: Yes, No

5. **Path parameters** — comma-separated list of path param names, or leave blank
   - e.g. `id` for `/users/{id}`, `userId,postId` for `/users/{userId}/posts/{postId}`
   - Options: free text (blank = none)

Do not proceed until the user answers.

## Step 2 — Confirm the output path

Before generating files, confirm the output with the user:

```
I'll create the following files:
  src/functions/<resource>/<action>/index.ts
  src/functions/<resource>/<action>/schema.ts

And register the route in:
  scripts/generate-openapi.ts
```

Proceed after confirmation.

## Step 3 — Inspect the project for context

Before generating, gather context from the existing codebase:

1. Check if `src/utils/schema.util.ts` exists — determines whether to use `SCHEMA.common.*` for common field types
2. If DB is needed, read `src/db/schema.ts` to identify the relevant table name and its columns
3. Check `scripts/generate-openapi.ts` to see the existing import pattern so the new import is consistent

```bash
ls src/utils/schema.util.ts 2>/dev/null && echo "EXISTS" || echo "MISSING"
```

## Step 4 — Generate src/functions/<resource>/<action>/schema.ts

Choose the correct template based on the HTTP method.

### GET (single) — path param only

```typescript
import { APIGatewayProxyEventSchema } from '@aws-lambda-powertools/parser/schemas/api-gateway';
import z from 'zod';
import { registry } from '@/utils/openapi.util';

const pathParamsSchema = z.object({
  <param>: z.string().uuid(),   // adjust type based on the param name
});

const responseSchema = z.object({
  // TODO: define response fields based on the DB table columns
  id: z.string().uuid(),
});

registry.registerPath({
  method: 'get',
  path: '/<resource>/{<param>}',
  summary: 'Get a <resource> by <param>',
  tags: ['<Resource>'],
  request: { params: pathParamsSchema },
  responses: {
    200: { description: 'Success', content: { 'application/json': { schema: responseSchema } } },
    404: { description: '<Resource> not found' },
    500: { description: 'Internal server error' },
  },
});

export const schema = APIGatewayProxyEventSchema.extend({
  pathParameters: pathParamsSchema,
});
```

### GET (list) — query params with pagination

```typescript
import { APIGatewayProxyEventSchema } from '@aws-lambda-powertools/parser/schemas/api-gateway';
import z from 'zod';
import { registry } from '@/utils/openapi.util';

const queryParamsSchema = z.object({
  offset: z.coerce.number().int().min(0).default(0),
  limit:  z.coerce.number().int().min(1).max(100).default(20),
});

const responseSchema = z.object({
  items: z.array(z.object({
    // TODO: define item fields based on the DB table columns
    id: z.string().uuid(),
  })),
  total: z.number(),
});

registry.registerPath({
  method: 'get',
  path: '/<resource>',
  summary: 'List <resource>s',
  tags: ['<Resource>'],
  request: { query: queryParamsSchema },
  responses: {
    200: { description: 'Success', content: { 'application/json': { schema: responseSchema } } },
    500: { description: 'Internal server error' },
  },
});

export const schema = APIGatewayProxyEventSchema.extend({
  queryStringParameters: queryParamsSchema,
});
```

### POST — request body

```typescript
import { APIGatewayProxyEventSchema } from '@aws-lambda-powertools/parser/schemas/api-gateway';
import { JSONStringified } from '@aws-lambda-powertools/parser/helpers';
import z from 'zod';
import { registry } from '@/utils/openapi.util';

const requestBodySchema = z.object({
  // TODO: define body fields — map to the DB table's required columns
});

const responseSchema = z.object({
  id: z.string().uuid(),
});

registry.registerPath({
  method: 'post',
  path: '/<resource>',
  summary: 'Create a <resource>',
  tags: ['<Resource>'],
  request: { body: { content: { 'application/json': { schema: requestBodySchema } } } },
  responses: {
    201: { description: 'Created', content: { 'application/json': { schema: responseSchema } } },
    400: { description: 'Invalid request body' },
    500: { description: 'Internal server error' },
  },
});

export const schema = APIGatewayProxyEventSchema.extend({
  body: JSONStringified(requestBodySchema),
});
```

### PUT — path param + request body

```typescript
import { APIGatewayProxyEventSchema } from '@aws-lambda-powertools/parser/schemas/api-gateway';
import { JSONStringified } from '@aws-lambda-powertools/parser/helpers';
import z from 'zod';
import { registry } from '@/utils/openapi.util';

const pathParamsSchema = z.object({
  id: z.string().uuid(),
});

const requestBodySchema = z.object({
  // TODO: define updatable fields
});

const responseSchema = z.object({
  id: z.string().uuid(),
  // TODO: include updated fields in response
});

registry.registerPath({
  method: 'put',
  path: '/<resource>/{id}',
  summary: 'Update a <resource>',
  tags: ['<Resource>'],
  request: {
    params: pathParamsSchema,
    body: { content: { 'application/json': { schema: requestBodySchema } } },
  },
  responses: {
    200: { description: 'Updated', content: { 'application/json': { schema: responseSchema } } },
    400: { description: 'Invalid request body' },
    404: { description: '<Resource> not found' },
    500: { description: 'Internal server error' },
  },
});

export const schema = APIGatewayProxyEventSchema.extend({
  pathParameters: pathParamsSchema,
  body: JSONStringified(requestBodySchema),
});
```

### DELETE — path param only

```typescript
import { APIGatewayProxyEventSchema } from '@aws-lambda-powertools/parser/schemas/api-gateway';
import z from 'zod';
import { registry } from '@/utils/openapi.util';

const pathParamsSchema = z.object({
  id: z.string().uuid(),
});

registry.registerPath({
  method: 'delete',
  path: '/<resource>/{id}',
  summary: 'Delete a <resource>',
  tags: ['<Resource>'],
  request: { params: pathParamsSchema },
  responses: {
    204: { description: 'Deleted' },
    404: { description: '<Resource> not found' },
    500: { description: 'Internal server error' },
  },
});

export const schema = APIGatewayProxyEventSchema.extend({
  pathParameters: pathParamsSchema,
});
```

Replace all `<resource>`, `<Resource>`, `<param>` placeholders with the actual values collected in Step 1.
Fill in `TODO` fields using the DB table columns found in Step 3 where possible; leave them as `TODO` comments if the table is unknown.

## Step 5 — Generate src/functions/<resource>/<action>/index.ts

Choose the correct template based on the HTTP method and whether the handler uses the DB.

### With DB (Drizzle)

```typescript
import { injectLambdaContext } from '@aws-lambda-powertools/logger/middleware';
import { parser } from '@aws-lambda-powertools/parser/middleware';
import middy from '@middy/core';
import httpErrorHandler from '@middy/http-error-handler';
import createError from 'http-errors';
import { eq } from 'drizzle-orm';            // only for methods that filter by a field

import { db } from '@/db';
import { <table> } from '@/db/schema';
import { logger } from '@/utils/logger.util';
import { serializer } from '@/utils/response.util';
import { schema } from './schema';

export const handler = middy()
  .use(injectLambdaContext(logger, { logEvent: true, correlationIdPath: 'requestContext.requestId' }))
  .use(httpErrorHandler())
  .use(serializer())
  .use(parser({ schema }))
  .handler(async (event) => {
    // TODO: implement business logic
    return { statusCode: 200, body: {} };
  });
```

Fill in the handler body based on the method:

- **GET (single)**: `db.select().from(<table>).where(eq(<table>.id, id)).then(r => r[0])` → 404 if undefined
- **GET (list)**: `db.select().from(<table>).orderBy(asc(<table>.createdAt)).limit(limit).offset(offset)` → `{ items, total: items.length }`
- **POST**: `db.insert(<table>).values({...event.body}).returning()` → `{ statusCode: 201, body: { id: created.id } }`
- **PUT**: `db.update(<table>).set({...event.body}).where(eq(<table>.id, id)).returning()` → 404 if `[]`
- **DELETE**: `db.delete(<table>).where(eq(<table>.id, id)).returning()` → 404 if `[]`, else `{ statusCode: 204 }`

### Without DB

Same middleware chain, omit the `db` and `drizzle-orm` imports, implement business logic with a `TODO` comment.

## Step 6 — Register the route in scripts/generate-openapi.ts

Add an import line for the new schema file. Read the existing file and add the import after the last existing schema import, maintaining alphabetical order within the resource group:

```typescript
import '@/functions/<resource>/<action>/schema';
```

## Step 7 — Report completion

```
Created:
  src/functions/<resource>/<action>/index.ts
  src/functions/<resource>/<action>/schema.ts

Registered in:
  scripts/generate-openapi.ts

Next steps:
  • Fill in any TODO fields in index.ts and schema.ts
  • Run `bun run openapi:generate` to update the OpenAPI spec
  • Use the write-tests agent to generate tests for this handler
```
