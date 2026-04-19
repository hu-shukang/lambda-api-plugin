import { Logger } from '@aws-lambda-powertools/logger';
import { search } from '@aws-lambda-powertools/logger/correlationId';

/**
 * Global logger singleton shared across the Lambda function and all utility modules.
 *
 * `serviceName` is read from the `SERVICE_NAME` environment variable, which should be set
 * per Lambda function in CDK. This allows each deployed function to carry a distinct name
 * in logs while keeping a single importable logger instance.
 *
 * `correlationIdSearchFn` automatically extracts the API Gateway request ID and attaches it
 * to every log entry. Use `injectLambdaContext` middleware in each handler to inject the
 * Lambda execution context (function name, cold start, etc.) before the first log is written.
 */
export const logger = new Logger({
  serviceName: process.env['SERVICE_NAME'] ?? 'lambda_api',
  correlationIdSearchFn: search,
});
