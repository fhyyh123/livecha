import type { ReactNode } from "react";
import { Layout } from "antd";

export type WorkspaceProps = {
    left: ReactNode;
    stage: ReactNode;
    panel: ReactNode;
    minHeight?: string;
};

export function Workspace({ left, stage, panel, minHeight = "calc(100vh - 160px)" }: WorkspaceProps) {
    return (
        <Layout style={{ height: minHeight, minHeight, overflow: "hidden" }}>
            {left}
            {stage}
            {panel}
        </Layout>
    );
}
