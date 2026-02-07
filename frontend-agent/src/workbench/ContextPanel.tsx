import type { ReactNode } from "react";
import { Layout } from "antd";

export type ContextPanelProps = {
    children?: ReactNode;
    width?: number;
};

export function ContextPanel({ children, width = 320 }: ContextPanelProps) {
    return (
        <Layout.Sider
            width={width}
            theme="light"
            style={{ borderLeft: "1px solid #f0f0f0", overflowX: "hidden", overflowY: "auto", height: "100%" }}
        >
            {children ?? <div style={{ padding: 12 }}>ContextPanel</div>}
        </Layout.Sider>
    );
}
