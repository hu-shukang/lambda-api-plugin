import type { MiddlewareObj } from '@middy/core';
import httpResponseSerializer from '@middy/http-response-serializer';

export function serializer(): MiddlewareObj {
  return httpResponseSerializer({
    serializers: [
      {
        regex: /^application\/xml$/,
        serializer: ({ body }) => `<message>${body}</message>`,
      },
      {
        regex: /^application\/json$/,
        serializer: ({ body }) => JSON.stringify(body),
      },
      {
        regex: /^text\/plain$/,
        serializer: ({ body }) => body,
      },
    ],
    defaultContentType: 'application/json',
  });
}
