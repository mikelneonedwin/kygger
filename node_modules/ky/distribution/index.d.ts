/*! MIT License © Sindre Sorhus */
import type { KyInstance } from './types/ky.js';
declare const ky: KyInstance;
export default ky;
export type { KyInstance } from './types/ky.js';
export type { Input, Options, NormalizedOptions, RetryOptions, ShouldRetryState, SearchParamsOption, Progress, } from './types/options.js';
export type { Hooks, InitHook, BeforeRequestHook, BeforeRequestState, BeforeRetryHook, BeforeRetryState, BeforeErrorHook, BeforeErrorState, AfterResponseHook, AfterResponseState, } from './types/hooks.js';
export type { ResponsePromise } from './types/ResponsePromise.js';
export type { StandardSchemaV1, StandardSchemaV1InferOutput, StandardSchemaV1Issue, } from './types/standard-schema.js';
export type { KyRequest } from './types/request.js';
export type { KyResponse } from './types/response.js';
export { KyError } from './errors/KyError.js';
export { HTTPError } from './errors/HTTPError.js';
export { SchemaValidationError } from './errors/SchemaValidationError.js';
export { NetworkError } from './errors/NetworkError.js';
export { TimeoutError } from './errors/TimeoutError.js';
export { ForceRetryError } from './errors/ForceRetryError.js';
export { isKyError, isHTTPError, isNetworkError, isTimeoutError, isForceRetryError, } from './utils/type-guards.js';
export { replaceOption } from './utils/merge.js';
