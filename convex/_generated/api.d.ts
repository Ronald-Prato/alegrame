/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agentActions from "../agentActions.js";
import type * as conversations from "../conversations.js";
import type * as http from "../http.js";
import type * as lib_alegraClient from "../lib/alegraClient.js";
import type * as messages from "../messages.js";
import type * as tools_alegraColombiaPaymentCatalog from "../tools/alegraColombiaPaymentCatalog.js";
import type * as tools_alegraContacts from "../tools/alegraContacts.js";
import type * as tools_alegraEstimates from "../tools/alegraEstimates.js";
import type * as tools_alegraInventory from "../tools/alegraInventory.js";
import type * as tools_alegraInvoices from "../tools/alegraInvoices.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agentActions: typeof agentActions;
  conversations: typeof conversations;
  http: typeof http;
  "lib/alegraClient": typeof lib_alegraClient;
  messages: typeof messages;
  "tools/alegraColombiaPaymentCatalog": typeof tools_alegraColombiaPaymentCatalog;
  "tools/alegraContacts": typeof tools_alegraContacts;
  "tools/alegraEstimates": typeof tools_alegraEstimates;
  "tools/alegraInventory": typeof tools_alegraInventory;
  "tools/alegraInvoices": typeof tools_alegraInvoices;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
