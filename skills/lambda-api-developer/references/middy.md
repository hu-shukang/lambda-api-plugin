# Middy v6 Reference

Packages used in this project: `@middy/core`, `@middy/http-error-handler`, `@middy/http-response-serializer`, `http-errors`

---

## Fixed middleware chain

Every handler in this project uses exactly the same middleware order. Do not change it:

```typescript
import middy from '@middy/core';
import httpErrorHandler from '@middy/http-error-handler';
import { injectLambdaContext } from '@aws-lambda-powertools/logger/middleware';
import { parser } from '@aws-lambda-powertools/parser/middleware';
import { serializer } from '@/utils/response.util';

export const handler = middy()
  .use(injectLambdaContext(logger, { logEvent: true, correlationIdPath: 'requestContext.requestId' }))
  .use(httpErrorHandler())
  .use(serializer())
  .use(parser({ schema }))
  .handler(async (event) => {
    // business logic
  });
```

Order rationale:
1. `injectLambdaContext` — runs first so all subsequent logs carry Lambda context
2. `httpErrorHandler` — intercepts `http-errors` exceptions and forms the HTTP response
3. `serializer()` — JSON-serializes the response `body` object
4. `parser` — validates the event last; validation errors bubble up to `httpErrorHandler`

---

## httpErrorHandler

Catches errors thrown by `http-errors` and converts them into properly formatted Lambda HTTP responses. Unhandled native `Error` objects become `500`.

```typescript
import createError from 'http-errors';

throw new createError.NotFound();                   // 404
throw new createError.BadRequest('reason');         // 400
throw new createError.Conflict();                   // 409
throw new createError.Unauthorized();               // 401
throw new createError.Forbidden();                  // 403
throw new createError.UnprocessableEntity();        // 422
throw new createError.NotFound('User not found');   // 404 with message
```

No try/catch needed around database calls — just throw the appropriate `createError` and the middleware handles the rest.

---

## serializer()

Defined in `@/utils/response.util`, wraps `@middy/http-response-serializer`. Returns `application/json` by default. Also supports `application/xml` and `text/plain` via `Accept` header.

Return a plain object from the handler; the middleware serializes it:

```typescript
// List response
return { statusCode: 200, body: { items, total } };

// Created
return { statusCode: 201, body: { id } };

// No content
return { statusCode: 204 };
```

---

## Type inference

`parser` infers the `event` type from the schema, so the handler body is fully typed with no manual assertions:

```typescript
.handler(async (event) => {
  const { keyword, limit, offset } = event.queryStringParameters; // typed
  const { id } = event.pathParameters;                            // typed
  const { name, description } = event.body;                       // typed, already parsed
});
```

---

## Official middlewares reference

All packages are under the `@middy/` scope.

### HTTP

| Package | Purpose |
|---|---|
| `http-error-handler` | Catches `http-errors` exceptions → structured HTTP response |
| `http-response-serializer` | Serializes response `body` to JSON / XML / plain text based on `Accept` header |
| `http-json-body-parser` | Parses `application/json` request body string into an object |
| `http-urlencode-body-parser` | Parses `application/x-www-form-urlencoded` body |
| `http-multipart-body-parser` | Parses `multipart/form-data` body |
| `http-event-normalizer` | Ensures `event.pathParameters` and `event.queryStringParameters` are always objects (never `null`) |
| `http-header-normalizer` | Normalizes header names to lowercase for consistent access |
| `http-urlencode-path-parser` | URL-decodes path parameters |
| `http-content-negotiation` | Parses `Accept` / `Accept-Language` headers, populates `context.preferredMediaTypes` |
| `http-content-encoding` | Compresses response body (gzip, br, deflate) based on `Accept-Encoding` |
| `http-cors` | Adds `Access-Control-Allow-Origin` and related CORS headers |
| `http-security-headers` | Adds security response headers (CSP, HSTS, X-Frame-Options, etc.) |
| `http-partial-response` | Filters response fields based on `fields` query parameter |
| `http-router` | Routes a single Lambda to multiple handlers by method + path |

```javascript
import httpEventNormalizer from '@middy/http-event-normalizer'
import httpHeaderNormalizer from '@middy/http-header-normalizer'
import cors from '@middy/http-cors'
import httpSecurityHeaders from '@middy/http-security-headers'
import httpJsonBodyParser from '@middy/http-json-body-parser'

middy()
  .use(httpEventNormalizer())      // always safe to access pathParameters / queryStringParameters
  .use(httpHeaderNormalizer())     // lowercase headers
  .use(httpJsonBodyParser())       // parse JSON body
  .use(cors())                     // add CORS headers
  .use(httpSecurityHeaders())      // add security headers
  .handler(lambdaHandler)
```

### AWS service integrations

| Package | Purpose |
|---|---|
| `ssm` | Fetches SSM Parameter Store values into `context` before handler runs |
| `secrets-manager` | Fetches Secrets Manager secrets into `context` |
| `rds-signer` | Generates an RDS IAM auth token and injects it into `context` |
| `sts` | Assumes an IAM role and injects temporary credentials |
| `cloudwatch-metrics` | Buffers and flushes CloudWatch custom metrics |

```javascript
import rdsSigner from '@middy/rds-signer'

middy()
  .use(rdsSigner({
    fetchData: {
      rdsToken: {
        region: 'ap-northeast-1',
        hostname: 'mydb.cluster.rds.amazonaws.com',
        username: 'iam_user',
        port: 5432,
      }
    }
  }))
  .handler(lambdaHandler)
```

### Observability & lifecycle

| Package | Purpose |
|---|---|
| `input-output-logger` | Logs the full event and response at DEBUG level |
| `error-logger` | Logs unhandled errors |
| `warmup` | Short-circuits the handler for scheduled warmup invocations |
| `do-not-wait-for-empty-event-loop` | Sets `context.callbackWaitsForEmptyEventLoop = false` — important when reusing database connections across invocations |

```javascript
import doNotWaitForEmptyEventLoop from '@middy/do-not-wait-for-empty-event-loop'
import warmup from '@middy/warmup'

middy()
  .use(doNotWaitForEmptyEventLoop({ runOnError: true }))
  .use(warmup({ isWarmingUp: (event) => event.isWarmingUp === true }))
  .handler(lambdaHandler)
```

> **`do-not-wait-for-empty-event-loop` and database connections**: this project keeps a persistent `pg.Pool` across Lambda invocations. Adding this middleware prevents Lambda from hanging waiting for the pool's idle connections to close.
