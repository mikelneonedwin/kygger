import { KyError } from './KyError.js';
/**
Error thrown when a network error occurs during the request (e.g., DNS failure, connection refused, offline). It has a `request` property with the `Request` object. The original error is available via the standard `cause` property.

Network errors are automatically retried (for retriable methods).

Note: Network errors are detected using runtime-specific heuristics. Unrecognized runtimes may produce errors that are not wrapped in `NetworkError`. Use the `shouldRetry` option to handle such cases.
*/
export class NetworkError extends KyError {
    name = 'NetworkError';
    request;
    constructor(request, options) {
        super(`Request failed due to a network error: ${request.method} ${request.url}`, options);
        this.request = request;
    }
}
//# sourceMappingURL=NetworkError.js.map