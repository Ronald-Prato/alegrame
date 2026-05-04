export declare const list: import("convex/server").RegisteredQuery<"public", {
    sessionId: string;
}, Promise<({
    _id: import("convex/values").GenericId<"messages">;
    _creationTime: number;
    streaming?: boolean;
    role: "user" | "assistant";
    content: string;
    conversationId: import("convex/values").GenericId<"conversations">;
} | {
    _id: import("convex/values").GenericId<"conversations">;
    _creationTime: number;
    ownerSessionId: string;
    title: string;
    messages: {
        role: "user" | "assistant";
        content: string;
    }[];
})[]>>;
export declare const internalAdd: import("convex/server").RegisteredMutation<"internal", {
    role: "user" | "assistant";
    content: string;
    sessionId: string;
}, Promise<void>>;
/** Borrador del mensaje del asistente mientras llega el stream del modelo */
export declare const internalCreateAssistantDraft: import("convex/server").RegisteredMutation<"internal", {
    sessionId: string;
}, Promise<import("convex/values").GenericId<import("convex/server").TableNamesInDataModel<{
    messages: {
        document: {
            _id: import("convex/values").GenericId<"messages">;
            _creationTime: number;
            streaming?: boolean;
            role: "user" | "assistant";
            content: string;
            conversationId: import("convex/values").GenericId<"conversations">;
        };
        fieldPaths: ("role" | "content" | "_creationTime" | "conversationId" | "streaming") | "_id";
        indexes: {
            by_conversation: ["conversationId", "_creationTime"];
            by_id: ["_id"];
            by_creation_time: ["_creationTime"];
        };
        searchIndexes: {};
        vectorIndexes: {};
    };
    conversations: {
        document: {
            _id: import("convex/values").GenericId<"conversations">;
            _creationTime: number;
            ownerSessionId: string;
            title: string;
            messages: {
                role: "user" | "assistant";
                content: string;
            }[];
        };
        fieldPaths: ("ownerSessionId" | "title" | "messages" | "_creationTime") | "_id";
        indexes: {
            by_owner: ["ownerSessionId", "_creationTime"];
            by_id: ["_id"];
            by_creation_time: ["_creationTime"];
        };
        searchIndexes: {};
        vectorIndexes: {};
    };
}>>>>;
export declare const internalAppendAssistantDelta: import("convex/server").RegisteredMutation<"internal", {
    messageId: import("convex/values").GenericId<"chatMessages">;
    delta: string;
}, Promise<void>>;
export declare const internalSetAssistantContent: import("convex/server").RegisteredMutation<"internal", {
    content: string;
    streaming: boolean;
    messageId: import("convex/values").GenericId<"chatMessages">;
}, Promise<void>>;
export declare const internalFinalizeAssistantStream: import("convex/server").RegisteredMutation<"internal", {
    messageId: import("convex/values").GenericId<"chatMessages">;
}, Promise<void>>;
export declare const internalGet: import("convex/server").RegisteredQuery<"internal", {
    messageId: import("convex/values").GenericId<"chatMessages">;
}, Promise<{
    _id: import("convex/values").GenericId<"messages">;
    _creationTime: number;
    streaming?: boolean;
    role: "user" | "assistant";
    content: string;
    conversationId: import("convex/values").GenericId<"conversations">;
} | {
    _id: import("convex/values").GenericId<"conversations">;
    _creationTime: number;
    ownerSessionId: string;
    title: string;
    messages: {
        role: "user" | "assistant";
        content: string;
    }[];
} | null>>;
//# sourceMappingURL=chat.d.ts.map