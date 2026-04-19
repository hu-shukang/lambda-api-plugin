import { OpenAPIRegistry, extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

/**
 * Extends Zod with `.openapi()` metadata support required by `@asteasolutions/zod-to-openapi`.
 * Must be called once before any schema uses `.openapi()` — this module-level call ensures it
 * runs at import time, before any schema.ts file is loaded.
 */
extendZodWithOpenApi(z);

/**
 * Global OpenAPI registry singleton.
 *
 * Each `schema.ts` file calls `registry.registerPath()` at module load time to declare its route.
 * The generation script (`scripts/generate-openapi.ts`) imports all schema files, triggering
 * their registrations, then reads this registry to produce `docs/openapi.json`.
 *
 * @example
 * // In any schema.ts:
 * import { registry } from '@/utils/openapi.util';
 * registry.registerPath({ method: 'get', path: '/book/{id}', ... });
 */
export const registry = new OpenAPIRegistry();
