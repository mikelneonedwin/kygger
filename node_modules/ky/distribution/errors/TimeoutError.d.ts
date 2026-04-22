import type { KyRequest } from '../types/request.js';
import { KyError } from './KyError.js';
/**
Error thrown when the request times out. It has a `request` property with the `Request` object.
*/
export declare class TimeoutError extends KyError {
    name: "TimeoutError";
    request: KyRequest;
    constructor(request: Request);
}
