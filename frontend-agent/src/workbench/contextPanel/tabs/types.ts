import type { ReactNode } from "react";

export type ContextPanelTabContext<TProps> = {
    key: string;
    icon: ReactNode;
    title: string;
    ariaLabel: string;
    shouldShow?: (props: TProps) => boolean;
    render: (props: TProps) => ReactNode;
};
