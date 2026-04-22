import { KyInstance } from "ky";
import { HTTPMethods, ImplicitKyggerTree, Options } from "./types";

export function handler<
  Tree extends ImplicitKyggerTree,
  Method extends keyof Tree,
>(method: Method, client: KyInstance) {
  return function <Path extends keyof Tree[Method]>(
    options: Options<Tree, Method, Path>,
  ) {
    // Remove leading slash if present for prefixUrl compatibility
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

    return client[method as HTTPMethods](url, requestOptions);
  };
}
