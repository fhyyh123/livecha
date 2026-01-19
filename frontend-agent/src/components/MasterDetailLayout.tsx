import type { ReactNode } from "react";
import { Button, Drawer, Grid, Layout, Space, Typography } from "antd";
import { CloseOutlined } from "@ant-design/icons";

export type MasterDetailLayoutProps = {
    left?: ReactNode;
    leftWidth?: number;

    master: ReactNode;

    detailTitle?: ReactNode;
    detailExtra?: ReactNode;
    detail: ReactNode;
    detailEmpty?: ReactNode;

    detailWidth?: number;
    detailVisible?: boolean;
    onCloseDetail?: () => void;

    minHeight?: string;
};

export function MasterDetailLayout({
    left,
    leftWidth = 280,
    master,
    detailTitle,
    detailExtra,
    detail,
    detailEmpty,
    detailWidth = 360,
    detailVisible = true,
    onCloseDetail,
    minHeight = "calc(100vh - 160px)",
}: MasterDetailLayoutProps) {
    const screens = Grid.useBreakpoint();
    const isNarrow = !screens.lg;

    const detailHeader = (
        <Space style={{ width: "100%", justifyContent: "space-between" }} align="center">
            <Typography.Text strong>{detailTitle}</Typography.Text>
            <Space size={8}>
                {detailExtra}
                {onCloseDetail ? (
                    <Button
                        size="small"
                        type="text"
                        aria-label="close"
                        icon={<CloseOutlined />}
                        onClick={onCloseDetail}
                    />
                ) : null}
            </Space>
        </Space>
    );

    if (isNarrow) {
        return (
            <>
                <div style={{ minHeight, height: minHeight, overflow: "hidden" }}>{master}</div>
                <Drawer
                    open={Boolean(detailVisible)}
                    onClose={onCloseDetail}
                    title={detailTitle}
                    extra={detailExtra}
                    width={Math.min(520, detailWidth)}
                    bodyStyle={{ padding: 12 }}
                >
                    {detailVisible ? detail : detailEmpty}
                </Drawer>
            </>
        );
    }

    return (
        <Layout style={{ height: minHeight, minHeight, overflow: "hidden" }}>
            {left ? (
                <Layout.Sider
                    width={leftWidth}
                    theme="light"
                    style={{ borderRight: "1px solid #f0f0f0", overflow: "hidden", height: "100%" }}
                >
                    {left}
                </Layout.Sider>
            ) : null}

            <Layout.Content style={{ minHeight: 0, overflow: "hidden" }}>{master}</Layout.Content>

            <Layout.Sider
                width={detailWidth}
                theme="light"
                style={{ borderLeft: "1px solid #f0f0f0", overflow: "hidden", height: "100%" }}
            >
                <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
                    <div style={{ padding: 12, borderBottom: "1px solid #f0f0f0" }}>{detailHeader}</div>
                    <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 12 }}>
                        {detailVisible ? detail : detailEmpty}
                    </div>
                </div>
            </Layout.Sider>
        </Layout>
    );
}
