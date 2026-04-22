import type { KyHeadersInit, Options } from '../types/options.js';
import type { Hooks } from '../types/hooks.js';
/**
Wraps a value so that `ky.extend()` will replace the parent value instead of merging with it. Works with hooks, headers, search parameters, context, and any other deep-merged option.

By default, `.extend()` deep-merges options with the parent instance: hooks get appended, headers get merged, and search parameters get accumulated. Use `replaceOption` when you want to fully replace a merged property instead.

@example
```
import ky, {replaceOption} from 'ky';

const base = ky.create({
    hooks: {beforeRequest: [addAuth, addTracking]},
});

// Replaces instead of appending
const extended = base.extend({
    hooks: replaceOption({beforeRequest: [onlyThis]}),
});
// hooks.beforeRequest is now [onlyThis], not [addAuth, addTracking, onlyThis]
```
*/
export declare const replaceOption: <T>(value: T) => T;
export declare const validateAndMerge: (...sources: Array<Partial<Options> | undefined>) => Partial<Options>;
export declare const mergeHeaders: (source1?: KyHeadersInit, source2?: KyHeadersInit) => Headers;
export declare const cloneShallow: <T>(value: T) => T;
export declare const mergeHooks: (original?: Hooks, incoming?: Hooks) => Required<Hooks>;
export declare const deletedParametersSymbol: unique symbol;
export declare const deepMerge: <T>(...sources: Array<Partial<T> | undefined>) => T;
