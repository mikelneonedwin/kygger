import type { ForceRetryOptions } from '../core/constants.js';
import { KyError } from './KyError.js';
/**
Error used to signal a forced retry from `afterResponse` hooks.

This is thrown when `ky.retry()` is returned from an `afterResponse` hook. It is observable in `beforeRetry` and `beforeError` hooks via the `isForceRetryError()` type guard.
*/
export declare class ForceRetryError extends KyError {
    name: "ForceRetryError";
    customDelay: number | undefined;
    code: string | undefined;
    customRequest: Request | undefined;
    constructor(options?: ForceRetryOptions);
}
