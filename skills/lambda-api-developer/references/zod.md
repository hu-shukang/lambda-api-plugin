# Zod v4 Reference

This project uses Zod v4 (`zod@4.x`). Some APIs differ from v3 — use the v4 forms below.

## Import

```typescript
import z from 'zod';
```

---

## Reusable fields — SCHEMA

Always prefer the shared fields from `@/utils/schema.util` to keep schemas consistent across endpoints:

```typescript
import { SCHEMA } from '@/utils/schema.util';

SCHEMA.common.id          // z.uuid()
SCHEMA.common.createdAt   // z.iso.datetime()
SCHEMA.common.updatedAt   // z.iso.datetime()
SCHEMA.common.offset      // z.coerce.number().nonnegative().default(0)
SCHEMA.common.limit       // z.coerce.number().nonnegative().default(10)
SCHEMA.common.keyword     // z.string().max(100)

SCHEMA.category.categoryId    // z.uuid()
SCHEMA.category.categoryName  // z.string().max(255)

SCHEMA.book.bookName     // z.string().max(255)
SCHEMA.book.description  // z.string().max(1000)
```

---

## Common types (Zod v4)

### Strings

```typescript
z.string().max(255).describe('field label')
z.string().min(1).max(1000).describe('content')

// v4 top-level validators (preferred over deprecated method forms)
z.email().describe('email address')      // z.string().email() is deprecated in v4
z.url().describe('URL')
z.uuid().describe('UUID')
z.iso.datetime().describe('ISO 8601 datetime')
z.iso.date().describe('ISO 8601 date')
z.base64().describe('base64 encoded')
z.ipv4().describe('IPv4 address')
```

### Numbers

```typescript
z.number().describe('count')
z.number().int().positive().describe('positive integer')
z.number().nonnegative().describe('non-negative number')

// Query parameters arrive as strings — always use coerce
z.coerce.number().nonnegative().default(0).describe('offset')
z.coerce.number().positive().describe('page number')
```

In Zod v4, `z.coerce` input type is `unknown` (was `string` in v3) — this is fine for query params.

### Booleans

```typescript
z.boolean().describe('enabled flag')
z.coerce.boolean().describe('boolean from query param')
// For env-style string booleans ("true"/"false"/"yes"/"no"/"1"/"0"):
z.stringbool().describe('string boolean')
```

### Enums

```typescript
z.enum(['active', 'inactive']).describe('status')
```

### Optional / nullable

```typescript
z.string().optional()           // string | undefined
z.string().nullable()           // string | null
z.string().nullish()            // string | null | undefined
z.string().optional().default('default')
```

### Objects

```typescript
const schema = z.object({
  id: z.uuid().describe('record ID'),
  name: z.string().max(255).describe('name'),
  count: z.number().int().describe('count'),
});

// Extend (v4 is more performant than v3 for this)
const extended = schema.extend({
  extra: z.string().optional().describe('extra field'),
});

// Type inference
type Schema = z.infer<typeof schema>;
```

### Arrays

```typescript
z.array(z.string()).describe('tag list')
z.array(itemSchema).min(1).describe('at least one item')
```

---

## Key rule: always add `.describe()`

Every field must have `.describe('...')`. These descriptions are used directly in the generated OpenAPI spec. Without them, the spec will have no field-level documentation.

---

## Manual validation (when not using parser middleware)

```typescript
const result = schema.safeParse(input);
if (!result.success) {
  throw new createError.BadRequest(result.error.message);
}
const data = result.data; // typed and validated
```

---

## v3 → v4 migration cheatsheet

| v3 | v4 |
|----|----|
| `z.string().uuid()` | `z.uuid()` ✅ |
| `z.string().email()` | `z.email()` ✅ |
| `z.string().url()` | `z.url()` ✅ |
| `z.string().datetime()` | `z.iso.datetime()` ✅ |
| `z.coerce` input: `string` | `z.coerce` input: `unknown` |
