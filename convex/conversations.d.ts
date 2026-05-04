export declare const create: import("convex/server").RegisteredMutation<"public", {
    title?: string;
    ownerSessionId: string;
}, Promise<import("convex/values").GenericId<"conversations">>>;
export declare const listForOwner: import("convex/server").RegisteredQuery<"public", {
    ownerSessionId: string;
}, Promise<{
    _id: import("convex/values").GenericId<"conversations">;
    _creationTime: number;
    ownerSessionId: string;
    title: string;
    messages: {
        role: "user" | "assistant";
        content: string;
    }[];
}[]>>;
export declare const get: import("convex/server").RegisteredQuery<"public", {
    conversationId: import("convex/values").GenericId<"conversations">;
}, Promise<{
    _id: import("convex/values").GenericId<"conversations">;
    _creationTime: number;
    ownerSessionId: string;
    title: string;
    messages: {
        role: "user" | "assistant";
        content: string;
    }[];
} | null>>;
/**
 * Recorta solo el campo `messages` (contexto del modelo). La tabla `messages`
 * conserva el historial completo.
 */
export declare const trimContextWindow: import("convex/server").RegisteredMutation<"public", {
    maxMessages?: number;
    ownerSessionId: string;
    conversationId: import("convex/values").GenericId<"conversations">;
}, Promise<{
    trimmed: false;
} | {
    trimmed: true;
}>>;
/** Punto de extensión: reemplazar el contexto por un resumen + cola reciente (ahora = solo recorte). */
export declare const compactContextPlaceholder: import("convex/server").RegisteredMutation<"public", {
    keepLast?: number;
    ownerSessionId: string;
    conversationId: import("convex/values").GenericId<"conversations">;
}, Promise<{
    ok: true;
}>>;
export declare const internalAppendContext: import("convex/server").RegisteredMutation<"internal", {
    conversationId: import("convex/values").GenericId<"conversations">;
    entry: {
        role: "user" | "assistant";
        content: string;
    };
}, Promise<void>>;
export declare const internalSetContext: import("convex/server").RegisteredMutation<"internal", {
    messages: {
        role: "user" | "assistant";
        content: string;
    }[];
    conversationId: import("convex/values").GenericId<"conversations">;
}, Promise<void>>;
export declare const internalTrimContextTail: import("convex/server").RegisteredMutation<"internal", {
    conversationId: import("convex/values").GenericId<"conversations">;
    maxMessages: number;
}, Promise<void>>;
export declare const internalPatchTitle: import("convex/server").RegisteredMutation<"internal", {
    title: string;
    conversationId: import("convex/values").GenericId<"conversations">;
}, Promise<void>>;
//# sourceMappingURL=conversations.d.ts.map