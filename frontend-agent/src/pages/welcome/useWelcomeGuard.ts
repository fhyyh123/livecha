import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import type { WelcomeStatus } from "./welcomeApi";
import { getRequiredWelcomePath, getWelcomeStepIndex } from "./welcomeRouting";

export function useWelcomeGuard(status: WelcomeStatus | null, loading: boolean) {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (loading) return;
    if (!status) return;

    const requiredPath = getRequiredWelcomePath(status);

    // If completed, never keep users inside /welcome/*.
    if (requiredPath === "/conversations") {
      if (location.pathname.startsWith("/welcome")) {
        navigate("/conversations", { replace: true });
      }
      return;
    }

    const currentIdx = getWelcomeStepIndex(location.pathname);
    const requiredIdx = getWelcomeStepIndex(requiredPath);

    // Prevent jumping forward by typing a URL.
    if (currentIdx > requiredIdx) {
      navigate(requiredPath, { replace: true });
    }
  }, [loading, location.pathname, navigate, status]);
}
