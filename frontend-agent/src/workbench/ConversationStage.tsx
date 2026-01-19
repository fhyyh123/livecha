import type { ReactNode } from "react";
import { Layout } from "antd";

export type ConversationStageProps = {
    active?: boolean;
    empty?: ReactNode;
    children?: ReactNode;
    padding?: number;
};

export function ConversationStage({ active = true, empty, children, padding = 12 }: ConversationStageProps) {
    return (
        <Layout.Content
            style={{
                padding,
                minHeight: 0,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
            }}
        >
            {active ? (
                <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
                    {children ?? <div>ConversationStage</div>}
                </div>
            ) : (
                <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {empty ?? <div style={{ color: "rgba(0,0,0,0.45)" }}>No conversation selected</div>}
                </div>
            )}
        </Layout.Content>
    );
}
