# AWS Lambda Powertools (TypeScript) Reference

Packages used in this project: `@aws-lambda-powertools/logger`, `@aws-lambda-powertools/parser`, `@aws-lambda-powertools/tracer`, `@aws-lambda-powertools/parameters`

---

## Logger

### Initialization

This project exports a global logger singleton from `@/utils/logger.util`. Import it directly — do not call `new Logger()` in handlers:

```typescript
import { logger } from '@/utils/logger.util';
```

`serviceName` is read from the `SERVICE_NAME` environment variable set per Lambda in CDK. `correlationIdSearchFn` is pre-configured to extract the API Gateway request ID automatically.

### injectLambdaContext middleware

Use the Middy middleware to automatically attach the Lambda context (function name, request ID, cold start flag, etc.) to every log entry:

```typescript
import { injectLambdaContext } from '@aws-lambda-powertools/logger/middleware';

middy()
  .use(
    injectLambdaContext(logger, {
      logEvent: true,                              // log the full incoming event
      correlationIdPath: 'requestContext.requestId', // extract from API Gateway REST requestId
    })
  )
```

**Project convention**: always use both `logEvent: true` and `correlationIdPath: 'requestContext.requestId'` — do not omit either.

### Logging methods

```typescript
logger.info('Processing request', { userId, action });
logger.warn('Resource not found', { id });
logger.error('Database operation failed', { error });
logger.debug('Debug detail', { payload });
```

---

## Parser

### Purpose

The `parser` Middy middleware validates and transforms the Lambda event using a Zod schema. After the middleware runs, `event` is fully typed — no manual casting needed.

### Basic pattern with APIGatewayProxyEventSchema

```typescript
import { parser } from '@aws-lambda-powertools/parser/middleware';
import { APIGatewayProxyEventSchema } from '@aws-lambda-powertools/parser/schemas/api-gateway';
import z from 'zod';

const mySchema = APIGatewayProxyEventSchema.extend({
  // extend with the fields you need to validate
});

middy()
  .use(parser({ schema: mySchema }))
  .handler(async (event) => {
    // event is fully typed from the schema — no JSON.parse, no casting
  });
```

### Parsing a JSON-stringified body — JSONStringified

API Gateway passes the request body as a raw string. `JSONStringified` parses and validates it automatically:

```typescript
import { JSONStringified } from '@aws-lambda-powertools/parser/helpers';

const bodySchema = z.object({ name: z.string() });

export const schema = APIGatewayProxyEventSchema.extend({
  body: JSONStringified(bodySchema),
});
```

Inside the handler `event.body.name` is already the correct type — no `JSON.parse` call needed.

### Extension patterns by request type

| Request type | Schema extension |
|---|---|
| GET — query params | `queryStringParameters: queryParamsSchema` |
| POST / PUT — request body | `body: JSONStringified(bodySchema)` |
| Path params (DELETE / PUT) | `pathParameters: pathParamsSchema` |
| PUT (path params + body) | extend both `pathParameters` and `body` |

### Validation failure

When validation fails, `parser` throws an error that `httpErrorHandler` catches and converts to a `400` response. No manual try/catch needed.

---

## Tracer

Tracer instruments X-Ray to trace Lambda execution, annotate business-critical data, and capture AWS SDK calls automatically.

### Initialization

```typescript
import { Tracer } from '@aws-lambda-powertools/tracer';
import { captureLambdaHandler } from '@aws-lambda-powertools/tracer/middleware';

const tracer = new Tracer({ serviceName: 'descriptive-service-name' });
```

Initialize once at module level, same as Logger.

### captureLambdaHandler middleware (Middy)

Add to the Middy chain alongside `injectLambdaContext`:

```typescript
import { captureLambdaHandler } from '@aws-lambda-powertools/tracer/middleware';

middy()
  .use(captureLambdaHandler(tracer))
  .use(injectLambdaContext(logger, { logEvent: true, correlationIdPath: 'requestContext.requestId' }))
  .use(httpErrorHandler())
  .use(serializer())
  .use(parser({ schema }))
  .handler(async (event) => { /* ... */ });
```

`captureLambdaHandler` automatically:
- Opens and closes the Lambda subsegment
- Captures cold start annotation
- Records the response or error

### Capture AWS SDK v3 clients

```typescript
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

const dynamoDB = tracer.captureAWSv3Client(new DynamoDBClient({}));
```

### Annotations and metadata

```typescript
// Annotations are indexed and searchable in X-Ray
tracer.putAnnotation('bookingId', id);
tracer.putAnnotation('success', true);

// Metadata is not indexed but stored in the trace
tracer.putMetadata('responseBody', result);
```

### Note on decorators

The decorator pattern (`@tracer.captureLambdaHandler()`) requires `experimentalDecorators: true` in tsconfig. This project's tsconfig does **not** enable it, so always use the **Middy middleware** approach instead.

---

## Parameters

Fetches values from SSM Parameter Store, Secrets Manager, and AppConfig with built-in caching (default TTL: 5 seconds).

### SSM Parameter Store

```typescript
import { getParameter, getParametersByName } from '@aws-lambda-powertools/parameters/ssm';
import { SSMProvider } from '@aws-lambda-powertools/parameters/ssm';

// Simple fetch (cached 5s by default)
const value = await getParameter('/my/param');

// Custom cache TTL
const value = await getParameter('/my/param', { maxAge: 60 }); // cache 60s

// Force bypass cache
const value = await getParameter('/my/param', { forceFetch: true });

// JSON parameter — auto-deserializes
const config = await getParameter('/my/json/param', { transform: 'json' });

// Multiple parameters from a path prefix
const provider = new SSMProvider();
const params = await provider.getMultiple('/my/path/prefix', { maxAge: 120 });

// Distinct parameters by name with per-parameter options
import type { SSMGetParametersByNameOptions } from '@aws-lambda-powertools/parameters/ssm/types';

const props: Record<string, SSMGetParametersByNameOptions> = {
  '/app/db/host': { maxAge: 300 },
  '/app/feature/flag': { maxAge: 0, transform: 'json' }, // maxAge: 0 = no cache
};
const parameters = await getParametersByName(props, { maxAge: 60 });
```

### Secrets Manager

```typescript
import { getSecret } from '@aws-lambda-powertools/parameters/secrets';
import { SecretsProvider } from '@aws-lambda-powertools/parameters/secrets';

// Simple string secret
const secret = await getSecret('my-secret');

// JSON secret — auto-deserializes
const provider = new SecretsProvider();
const config = await provider.get('my-secret-json', { transform: 'json' });
```

### AppConfig

```typescript
import { AppConfigProvider } from '@aws-lambda-powertools/parameters/appconfig';

const configProvider = new AppConfigProvider({
  application: 'my-app',
  environment: 'my-env',
});

const config = await configProvider.get('my-config');
```

### Cache TTL global override

Set `POWERTOOLS_PARAMETERS_MAX_AGE` environment variable to change the default 5-second TTL for all providers. Per-call `maxAge` options always override this env var.
