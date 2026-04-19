# OpenAPI Registration Reference

Packages used: `@asteasolutions/zod-to-openapi`, `@redocly/cli`

---

## Global registry

All routes register into the singleton `registry` from `@/utils/openapi.util`:

```typescript
// src/utils/openapi.util.ts
import { OpenAPIRegistry, extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z); // extends Zod with .openapi() metadata support

export const registry = new OpenAPIRegistry();
```

`extendZodWithOpenApi(z)` runs once at module load — it enables OpenAPI metadata on all Zod schemas.

---

## Registering a route in schema.ts

Call `registry.registerPath()` inside each `schema.ts` file. Registration happens at import time, which is how `scripts/generate-openapi.ts` collects all routes.

### GET — query parameters

```typescript
import { registry } from '@/utils/openapi.util';

registry.registerPath({
  method: 'get',
  path: '/resource',
  summary: 'List resources',
  description: 'Paginated search by keyword',
  tags: ['Resource'],
  request: {
    query: queryParamsSchema,
  },
  responses: {
    200: {
      description: 'Success',
      content: { 'application/json': { schema: responseSchema } },
    },
    400: { description: 'Bad request' },
    500: { description: 'Internal server error' },
  },
});
```

### POST — request body

```typescript
registry.registerPath({
  method: 'post',
  path: '/resource',
  summary: 'Create resource',
  tags: ['Resource'],
  request: {
    body: {
      content: { 'application/json': { schema: requestBodySchema } },
    },
  },
  responses: {
    201: {
      description: 'Created',
      content: { 'application/json': { schema: responseSchema } },
    },
    400: { description: 'Bad request' },
    500: { description: 'Internal server error' },
  },
});
```

### PUT — path parameters + body

```typescript
registry.registerPath({
  method: 'put',
  path: '/resource/{id}',
  summary: 'Update resource',
  tags: ['Resource'],
  request: {
    params: pathParamsSchema,
    body: {
      content: { 'application/json': { schema: requestBodySchema } },
    },
  },
  responses: {
    200: { description: 'Updated', content: { 'application/json': { schema: responseSchema } } },
    400: { description: 'Bad request' },
    404: { description: 'Not found' },
    500: { description: 'Internal server error' },
  },
});
```

### DELETE — path parameters

```typescript
registry.registerPath({
  method: 'delete',
  path: '/resource/{id}',
  summary: 'Delete resource',
  tags: ['Resource'],
  request: {
    params: pathParamsSchema,
  },
  responses: {
    204: { description: 'Deleted' },
    404: { description: 'Not found' },
    500: { description: 'Internal server error' },
  },
});
```

---

## Register the schema file in the generation script

After creating a new `schema.ts`, add an import to `scripts/generate-openapi.ts`:

```typescript
import '@/functions/resource/add/schema';
import '@/functions/resource/query/schema';
import '@/functions/resource/update/schema';
import '@/functions/resource/delete/schema';
```

Then regenerate:

```bash
bun run openapi:generate   # writes docs/openapi.json
bun run openapi:html       # writes docs/api-docs.html
```

---

## Conventions

**Tags**: use a single capitalized noun per resource (e.g. `['Book']`, `['Category']`). All endpoints for the same resource share the same tag — Redoc groups them together.

**Standard responses to always include**:
- Success response with schema (except `204` — no `content` needed)
- `400: { description: 'Bad request' }` on all endpoints
- `404` only on endpoints that look up a specific record by ID
- `500: { description: 'Internal server error' }` on all endpoints
