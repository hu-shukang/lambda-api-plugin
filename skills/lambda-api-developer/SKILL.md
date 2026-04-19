---
name: lambda-api-developer
description: >
  Guide for developing AWS Lambda API handlers in this project. Use this skill whenever
  the user wants to add an endpoint, create or modify a Lambda handler (index.ts) or its
  schema file (schema.ts), write Zod validation schemas, set up Middy middleware, use
  AWS Lambda Powertools Logger or Parser, or register an OpenAPI route. Also invoke this
  skill when reviewing or debugging any file under src/functions/.
---

# Lambda API Developer

This skill guides you to build Lambda handlers following this project's established patterns.
Every endpoint is two files — keep them in sync.

## File structure

```
src/functions/{resource}/{action}/
├── index.ts    — Middy handler with business logic
└── schema.ts   — Zod validation schemas + OpenAPI route registration
```

---

## index.ts — handler template

```typescript
import { injectLambdaContext } from '@aws-lambda-powertools/logger/middleware';
import { parser } from '@aws-lambda-powertools/parser/middleware';
import middy from '@middy/core';
import httpErrorHandler from '@middy/http-error-handler';
import createError from 'http-errors';          // only if this handler can throw 4xx

import { logger } from '@/utils/logger.util';
import { serializer } from '@/utils/response.util';
import { schema } from './schema';

export const handler = middy()
  .use(injectLambdaContext(logger, { logEvent: true, correlationIdPath: 'requestContext.requestId' }))
  .use(httpErrorHandler())
  .use(serializer())
  .use(parser({ schema }))
  .handler(async (event) => {
    // event is fully typed from schema — no JSON.parse, no casting
    return { statusCode: 200, body: { /* result */ } };
  });
```

**Middleware order is fixed** — always exactly this sequence. See `references/middy.md` for why.

### Response shapes

```typescript
return { statusCode: 200, body: { items, total } };  // list
return { statusCode: 201, body: { id } };             // created
return { statusCode: 204 };                            // no content
```

### Throwing errors

```typescript
throw new createError.NotFound();            // 404
throw new createError.BadRequest('reason');  // 400
throw new createError.Conflict();            // 409
```

---

## schema.ts — validation + OpenAPI template

### GET (query params)

```typescript
import { APIGatewayProxyEventSchema } from '@aws-lambda-powertools/parser/schemas/api-gateway';
import z from 'zod';
import { registry } from '@/utils/openapi.util';
import { SCHEMA } from '@/utils/schema.util';

const queryParamsSchema = z.object({
  keyword: SCHEMA.common.keyword,
  offset: SCHEMA.common.offset,
  limit: SCHEMA.common.limit,
});

const responseSchema = z.object({ /* ... */ });

registry.registerPath({
  method: 'get',
  path: '/resource',
  summary: '...',
  tags: ['Resource'],
  request: { query: queryParamsSchema },
  responses: {
    200: { description: 'Success', content: { 'application/json': { schema: responseSchema } } },
    400: { description: 'Bad request' },
    500: { description: 'Internal server error' },
  },
});

export const schema = APIGatewayProxyEventSchema.extend({
  queryStringParameters: queryParamsSchema,
});
```

### POST / PUT (request body)

```typescript
import { JSONStringified } from '@aws-lambda-powertools/parser/helpers';

const requestBodySchema = z.object({ /* ... */ });

export const schema = APIGatewayProxyEventSchema.extend({
  body: JSONStringified(requestBodySchema),
});
```

### DELETE / PUT with path params

```typescript
const pathParamsSchema = z.object({ id: SCHEMA.common.id });

export const schema = APIGatewayProxyEventSchema.extend({
  pathParameters: pathParamsSchema,
  body: JSONStringified(requestBodySchema), // PUT only
});
```

---

## TypeScript config

See `assets/tsconfig.json` for the full config. Key rules that affect how you write code:

- `verbatimModuleSyntax: true` — use `import type` for type-only imports
- `noUncheckedIndexedAccess: true` — array/index access returns `T | undefined`, guard before use: `result[0]?.totalCount ?? 0`
- `@/*` → `./src/*` — always use `@/` for imports from `src/`

---

## After creating a new endpoint

1. Add the schema import to `scripts/generate-openapi.ts`:
   ```typescript
   import '@/functions/resource/action/schema';
   ```
2. Regenerate docs:
   ```bash
   bun run openapi:generate
   ```

---

## Project setup — utility files

When initializing a new project, copy these three files from `assets/` into `src/utils/`:

| Asset | Destination | Purpose |
|---|---|---|
| `assets/tsconfig.json` | `tsconfig.json` | TypeScript config with strict mode, bundler resolution, `@/*` alias |
| `assets/logger.util.ts` | `src/utils/logger.util.ts` | Global logger singleton; reads `SERVICE_NAME` env var |
| `assets/openapi.util.ts` | `src/utils/openapi.util.ts` | OpenAPI registry singleton + `extendZodWithOpenApi` |
| `assets/response.util.ts` | `src/utils/response.util.ts` | `serializer()` Middy middleware for JSON/XML/plain responses |

These files have no project-specific logic and can be used as-is.

---

## Reference files

Read these when you need details on a specific library:

- `references/powertools.md` — Logger singleton pattern, `injectLambdaContext`, Parser, `JSONStringified`
- `references/middy.md` — Middleware chain order, `httpErrorHandler`, `serializer()`, type inference
- `references/zod.md` — Zod v4 types, v3→v4 migration, `SCHEMA` reuse, `.describe()` rule
- `references/openapi.md` — `registry.registerPath()` patterns, response conventions, generation commands
