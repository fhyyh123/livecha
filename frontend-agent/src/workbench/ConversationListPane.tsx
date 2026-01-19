import type { ReactNode } from "react";
import { Layout } from "antd";

export type ConversationListPaneProps = {
    children?: ReactNode;
    width?: number;
};

export function ConversationListPane({ children, width = 340 }: ConversationListPaneProps) {
    return (
        <Layout.Sider
            width={width}
            theme="light"
            style={{ borderRight: "1px solid #f0f0f0", overflow: "hidden", height: "100%" }}
        >
            {children ?? <div style={{ padding: 12 }}>ConversationListPane</div>}
        </Layout.Sider>
    );
}
