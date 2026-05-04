export declare const listForConversation: import("convex/server").RegisteredQuery<"public", {
    conversationId: import("convex/values").GenericId<"conversations">;
}, Promise<{
    _id: import("convex/values").GenericId<"messages">;
    _creationTime: number;
    streaming?: boolean;
    toolEvents?: {
        inputSummary?: string;
        outputSummary?: string;
        errorMessage?: string;
        callId: string;
        toolName: string;
        status: "running" | "done" | "error";
    }[];
    role: "user" | "assistant";
    content: string;
    conversationId: import("convex/values").GenericId<"conversations">;
}[]>>;
export declare const internalAdd: import("convex/server").RegisteredMutation<"internal", {
    streaming?: boolean;
    role: "user" | "assistant";
    content: string;
    conversationId: import("convex/values").GenericId<"conversations">;
}, Promise<import("convex/values").GenericId<"messages">>>;
export declare const internalCreateAssistantDraft: import("convex/server").RegisteredMutation<"internal", {
    conversationId: import("convex/values").GenericId<"conversations">;
}, Promise<import("convex/values").GenericId<"messages">>>;
export declare const internalAppendAssistantDelta: import("convex/server").RegisteredMutation<"internal", {
    messageId: import("convex/values").GenericId<"messages">;
    delta: string;
}, Promise<void>>;
export declare const internalSetAssistantContent: import("convex/server").RegisteredMutation<"internal", {
    content: string;
    streaming: boolean;
    messageId: import("convex/values").GenericId<"messages">;
}, Promise<void>>;
export declare const internalFinalizeAssistantStream: import("convex/server").RegisteredMutation<"internal", {
    messageId: import("convex/values").GenericId<"messages">;
}, Promise<void>>;
export declare const internalGet: import("convex/server").RegisteredQuery<"internal", {
    messageId: import("convex/values").GenericId<"messages">;
}, Promise<{
    _id: import("convex/values").GenericId<"messages">;
    _creationTime: number;
    streaming?: boolean;
    toolEvents?: {
        inputSummary?: string;
        outputSummary?: string;
        errorMessage?: string;
        callId: string;
        toolName: string;
        status: "running" | "done" | "error";
    }[];
    role: "user" | "assistant";
    content: string;
    conversationId: import("convex/values").GenericId<"conversations">;
} | null>>;
export declare const internalAppendToolEvent: import("convex/server").RegisteredMutation<"internal", {
    callId: string;
    toolName: string;
    messageId: import("convex/values").GenericId<"messages">;
}, Promise<void>>;
export declare const internalCompleteToolEvent: import("convex/server").RegisteredMutation<"internal", {
    failed?: boolean;
    callId: string;
    messageId: import("convex/values").GenericId<"messages">;
}, Promise<void>>;
//# sourceMappingURL=messages.d.ts.map