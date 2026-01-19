import { useEffect } from "react";
import { Spin } from "antd";
import { useNavigate } from "react-router-dom";
import { useGetIdentity } from "@refinedev/core";

import { http } from "../providers/http";
import { getRequiredWelcomePath } from "./welcome/welcomeRouting";
import type { WelcomeStatus } from "./welcome/welcomeApi";

type Identity = {
    role?: string;
};

function firstWelcomePath(s: WelcomeStatus | null | undefined) {
    return getRequiredWelcomePath(s);
}

export function HomePage() {
    const navigate = useNavigate();
    const { data: identity } = useGetIdentity<Identity>();

    useEffect(() => {
        const role = identity?.role;
        if (!role) return;

        if (role !== "admin") {
            navigate("/conversations");
            return;
        }

        http.get<WelcomeStatus>("/api/v1/admin/welcome/status")
            .then((res) => {
                const s = res.data as WelcomeStatus;
                navigate(firstWelcomePath(s));
            })
            .catch(() => {
                navigate("/conversations");
            });
    }, [identity, navigate]);

    return (
        <div style={{ padding: 24 }}>
            <Spin />
        </div>
    );
}
