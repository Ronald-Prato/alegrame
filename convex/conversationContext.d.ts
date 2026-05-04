/** Turno texto enviado al modelo (persistente en Alegrame como antes). */
export declare const plainContextTurn: import("convex/values").VObject<{
    role: "user" | "assistant";
    content: string;
}, {
    role: import("convex/values").VUnion<"user" | "assistant", [import("convex/values").VLiteral<"user", "required">, import("convex/values").VLiteral<"assistant", "required">], "required", never>;
    content: import("convex/values").VString<string, "required">;
}, "required", "role" | "content">;
/** Resultado opaco de `responses.compact` (OpenAI Agents SDK / Responses API). */
export declare const compactionContextTurn: import("convex/values").VObject<{
    kind: "compaction";
    payloadJson: string;
}, {
    kind: import("convex/values").VLiteral<"compaction", "required">;
    payloadJson: import("convex/values").VString<string, "required">;
}, "required", "kind" | "payloadJson">;
export declare const conversationContextTurn: import("convex/values").VUnion<{
    role: "user" | "assistant";
    content: string;
} | {
    kind: "compaction";
    payloadJson: string;
}, [import("convex/values").VObject<{
    role: "user" | "assistant";
    content: string;
}, {
    role: import("convex/values").VUnion<"user" | "assistant", [import("convex/values").VLiteral<"user", "required">, import("convex/values").VLiteral<"assistant", "required">], "required", never>;
    content: import("convex/values").VString<string, "required">;
}, "required", "role" | "content">, import("convex/values").VObject<{
    kind: "compaction";
    payloadJson: string;
}, {
    kind: import("convex/values").VLiteral<"compaction", "required">;
    payloadJson: import("convex/values").VString<string, "required">;
}, "required", "kind" | "payloadJson">], "required", "role" | "content" | "kind" | "payloadJson">;
//# sourceMappingURL=conversationContext.d.ts.map