import { useEffect, useState } from "react";

import { getWelcomeStatus, type WelcomeStatus } from "./welcomeApi";
import { errorMessage } from "./errorMessage";

export function useWelcomeStatus() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [status, setStatus] = useState<WelcomeStatus | null>(null);

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const s = await getWelcomeStatus();
      setStatus(s);
    } catch (e: unknown) {
      setError(errorMessage(e, "load_failed"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return { loading, error, status, refresh };
}
