import { FileTextOutlined, RobotOutlined, UserOutlined } from "@ant-design/icons";
import { Tooltip } from "antd";

import type { ContextPanelViewProps } from "../ContextPanelView";
import type { ContextPanelTabContext } from "./tabs/types";
import { CopilotTab } from "./tabs/CopilotTab";
import { DetailsTab } from "./tabs/DetailsTab";
import { ProfileTab } from "./tabs/ProfileTab";

export function getDefaultContextPanelTabs(
    t: (key: string, options?: Record<string, unknown>) => string,
): ContextPanelTabContext<ContextPanelViewProps>[] {
    return [
        {
            key: "profile",
            icon: (
                <Tooltip title={t("workbench.tabs.profile")} placement="bottom">
                    <span aria-label={t("workbench.tabs.profile")}>
                        <UserOutlined />
                    </span>
                </Tooltip>
            ),
            title: t("workbench.tabs.profile"),
            ariaLabel: t("workbench.tabs.profile"),
            render: (props) => (
                <ProfileTab
                    t={t}
                    selectedId={props.selectedId}
                    detail={props.detail}
                    detailLoading={props.detailLoading}
                />
            ),
        },
        {
            key: "details",
            icon: (
                <Tooltip title={t("workbench.tabs.details")} placement="bottom">
                    <span aria-label={t("workbench.tabs.details")}>
                        <FileTextOutlined />
                    </span>
                </Tooltip>
            ),
            title: t("workbench.tabs.details"),
            ariaLabel: t("workbench.tabs.details"),
            render: (props) => (
                <DetailsTab
                    t={t}
                    selectedId={props.selectedId}
                    selected={props.selected}
                    detail={props.detail}
                    detailLoading={props.detailLoading}
                    meta={props.meta}
                    metaLoading={props.metaLoading}
                    onSetTags={props.onSetTags}
                    onSetMetaLocal={props.onSetMetaLocal}
                    onSetNote={props.onSetNote}
                />
            ),
        },
        {
            key: "copilot",
            icon: (
                <Tooltip title={t("workbench.tabs.copilot")} placement="bottom">
                    <span aria-label={t("workbench.tabs.copilot")}>
                        <RobotOutlined />
                    </span>
                </Tooltip>
            ),
            title: t("workbench.tabs.copilot"),
            ariaLabel: t("workbench.tabs.copilot"),
            render: (props) => <CopilotTab t={t} selectedId={props.selectedId} />,
        },
    ];
}
