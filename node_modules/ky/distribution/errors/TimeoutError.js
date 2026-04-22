import { KyError } from './KyError.js';
/**
Error thrown when the request times out. It has a `request` property with the `Request` object.
*/
export class TimeoutError extends KyError {
    name = 'TimeoutError';
    request;
    constructor(request) {
        super(`Request timed out: ${request.method} ${request.url}`);
        this.request = request;
    }
}
//# sourceMappingURL=TimeoutError.js.map