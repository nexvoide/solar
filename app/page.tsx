"use client";

import { useCallback, useEffect, useState } from "react";
import ConnectionScreen from "@/components/ConnectionScreen";
import Dashboard from "@/components/Dashboard";
import PwaProvider from "@/components/PwaProvider";
import { SettingsProvider, useSettings } from "@/components/SettingsProvider";

function HomeContent() {
  const { t, dir } = useSettings();
  const [connected, setConnected] = useState<boolean | null>(null);

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/status");
      const data = await res.json();
      setConnected(Boolean(data.connected));
    } catch {
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void checkStatus(), 0);
    return () => window.clearTimeout(timer);
  }, [checkStatus]);

  if (connected === null) {
    return (
      <div dir={dir} className="connect-mesh flex min-h-dvh flex-1 flex-col items-center justify-center gap-4">
        <div className="h-12 w-12 animate-spin rounded-full border-[3px] border-amber-400/20 border-t-amber-400" />
        <p className="text-sm text-slate-400">{t("checkingConnection")}</p>
      </div>
    );
  }

  if (!connected) {
    return <ConnectionScreen onConnected={() => setConnected(true)} />;
  }

  return (
    <Dashboard
      onDisconnect={async () => {
        try {
          await fetch("/api/disconnect", { method: "POST", cache: "no-store" });
        } catch {
          /* ignore */
        }
        sessionStorage.removeItem("knox_pn");
        setConnected(false);
      }}
    />
  );
}

export default function Home() {
  return (
    <SettingsProvider>
      <HomeContent />
      <PwaProvider />
    </SettingsProvider>
  );
}
