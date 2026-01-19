import type { ReactNode } from "react";
import { Layout } from "antd";

import { AppHeader } from "./AppHeader";
import { AppSider } from "./AppSider";

export function AppShell({ children }: { children: ReactNode }) {
    return (
        <Layout style={{ minHeight: "100vh" }}>
            <AppHeader />
            <Layout style={{ minHeight: 0, flex: 1 }}>
                <AppSider />
                <Layout style={{ minHeight: 0 }}>
                    <Layout.Content style={{ padding: 0, minHeight: 0 }}>{children}</Layout.Content>
                </Layout>
            </Layout>
        </Layout>
    );
}
