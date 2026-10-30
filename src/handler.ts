import type { KyInstance } from "ky";
import { HTTPMethods, ImplicitKyggerTree, Options } from "./types";

export function handler<
  Tree extends ImplicitKyggerTree,
  Method extends keyof Tree,
>(method: Method, client: KyInstance) {
  return function <Path extends keyof Tree[Method]>(
    options: Options<Tree, Method, Path>,
  ) {
    // Remove leading slash if present for prefix compatibility
    let url = options.path.toString();
    if (url.startsWith("/")) {
      url = url.slice(1);
    }

    // Handle path parameters
    if (
      "params" in options &&
      typeof options.params === "object" &&
      options.params !== null
    ) {
      for (const [key, value] of Object.entries(options.params)) {
        url = url.replace(`{${key}}`, String(value));
      }
    }

    // Handle query parameters
    if (
      "query" in options &&
      typeof options.query === "object" &&
      options.query !== null
    ) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(options.query)) {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value));
        }
      }
      const queryString = searchParams.toString();
      if (queryString) {
        url += (url.includes("?") ? "&" : "?") + queryString;
      }
    }

    // Handle request body
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const requestOptions: any = {};
    if ("json" in options) {
      requestOptions.json = options.json;
    } else if ("body" in options) {
      requestOptions.body = options.body;
    }

    const responsePromise = client[method as HTTPMethods](url, requestOptions);

    if (!responsePromise || typeof responsePromise.then !== "function") {
      return responsePromise;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hooked = responsePromise.then((response: any) => {
      if (response && (response.status === 204 || response.status === 205)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        response.json = async (): Promise<any> => undefined;
      }
      return response;
    });

    return new Proxy(hooked, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      get(target: any, prop: string | symbol) {
        if (prop === "json") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return async (): Promise<any> => {
            const response = await target;
            if (
              response &&
              (response.status === 204 || response.status === 205)
            ) {
              return undefined;
            }
            if (typeof responsePromise.json === "function") {
              return responsePromise.json();
            }
            return response.json();
          };
        }
        if (prop in target) {
          const val = target[prop];
          return typeof val === "function" ? val.bind(target) : val;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const val = (responsePromise as any)[prop];
        return typeof val === "function" ? val.bind(responsePromise) : val;
      },
    });
  };
}
