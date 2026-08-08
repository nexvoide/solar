"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useSettings } from "@/components/SettingsProvider";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "knox_pwa_install_dismissed";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export default function PwaProvider() {
  const { t } = useSettings();
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || isStandalone()) return;
    if (sessionStorage.getItem(DISMISS_KEY) === "1") return;

    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      setShowBanner(true);
    };

    window.addEventListener("beforeinstallprompt", onInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onInstallPrompt);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const register = async () => {
      try {
        if (process.env.NODE_ENV !== "production") {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map((registration) => registration.unregister()));
          if ("caches" in window) {
            const keys = await caches.keys();
            await Promise.all(keys.filter((key) => key.startsWith("knox-solar-")).map((key) => caches.delete(key)));
          }
          return;
        }
        await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      } catch (error) {
        console.warn("[PWA] Service worker registration failed:", error);
      }
    };

    if (document.readyState === "complete") {
      void register();
    } else {
      window.addEventListener("load", register, { once: true });
    }
  }, []);

  const handleInstall = async () => {
    if (!installEvent) return;
    setInstalling(true);
    try {
      await installEvent.prompt();
      const choice = await installEvent.userChoice;
      if (choice.outcome === "accepted") {
        setShowBanner(false);
      }
    } finally {
      setInstalling(false);
      setInstallEvent(null);
    }
  };

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setShowBanner(false);
    setInstallEvent(null);
  };

  if (!showBanner || isStandalone()) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 px-4 pb-[max(1rem,var(--safe-bottom))] pt-2"
      role="region"
      aria-label={t("installApp")}
    >
      <div className="mx-auto flex max-w-lg items-center gap-3 rounded-2xl border border-[#5dffc0]/25 bg-[#0d1520]/95 p-4 shadow-2xl shadow-black/40 backdrop-blur-xl">
        <Image
          src="/icons/icon-192.png"
          alt=""
          width={48}
          height={48}
          className="h-12 w-12 shrink-0 rounded-xl"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">{t("installApp")}</p>
          <p className="text-xs text-slate-400">{t("installAppHint")}</p>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={handleInstall}
            disabled={installing || !installEvent}
            className="rounded-xl bg-[#5dffc0] px-3 py-2 text-xs font-bold text-[#070b12] disabled:opacity-60"
          >
            {installing ? t("installing") : t("install")}
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-400"
          >
            {t("close")}
          </button>
        </div>
      </div>
    </div>
  );
}
