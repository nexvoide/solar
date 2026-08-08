"use client";

import { FormEvent, useEffect, useState } from "react";
import SettingsPanel from "@/components/SettingsPanel";
import { useSettings } from "@/components/SettingsProvider";

interface ConnectionScreenProps {
  onConnected: () => void;
}

export default function ConnectionScreen({ onConnected }: ConnectionScreenProps) {
  const { t, dir } = useSettings();
  const [pn, setPn] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showCredentials, setShowCredentials] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const savedPn = sessionStorage.getItem("knox_pn");
    if (savedPn) setPn(savedPn);
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const body: Record<string, string> = { pn: pn.trim() };
      if (password.length > 0) {
        if (username.trim()) body.username = username.trim();
        body.password = password;
      }

      const res = await fetch("/api/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        const msg = data.error ?? t("connectionFailed");
        if (msg.includes("ERR_PASSWORD_VERIF_FAIL") || msg.includes("Wrong password")) {
          throw new Error(t("wrongPassword"));
        }
        if (msg.includes("ERR_NOT_FOUND_USR") || msg.includes("not found")) {
          throw new Error(t("userNotFound"));
        }
        throw new Error(msg);
      }

      if (data.authRequired) {
        setShowCredentials(true);
        if (!username.trim()) setUsername(pn.trim());
        setError(data.message ?? t("authRequired"));
        return;
      }

      sessionStorage.setItem("knox_pn", pn.trim());
      onConnected();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("connectionFailed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div dir={dir} className="connect-mesh solar-bg flex min-h-dvh flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-4 sm:px-6">
        <div className="flex items-center gap-2">
          <span className="text-2xl">☀️</span>
          <span className="text-lg font-bold text-white">{t("appTitle")}</span>
        </div>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.08] text-lg backdrop-blur-sm transition hover:bg-white/12"
          aria-label={t("settings")}
        >
          ⚙️
        </button>
      </div>

      {/* Center card */}
      <div className="flex flex-1 flex-col items-center justify-center px-4 pb-8 sm:px-6">
        <div className="glass w-full max-w-md p-6 sm:p-8">
          {/* Hero icon */}
          <div className="mb-8 text-center">
            <div className="relative mx-auto mb-5 flex h-20 w-20 items-center justify-center">
              <div className="absolute inset-0 rounded-3xl bg-amber-400/20 blur-xl" />
              <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-amber-400 to-orange-500 text-4xl shadow-lg shadow-amber-500/25">
                ☀️
              </div>
            </div>
            <h1 className="text-2xl font-bold text-white sm:text-3xl">{t("connectTitle")}</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-400 sm:text-base">
              {t("connectSubtitle")}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="pn" className="mb-2 block text-sm font-semibold text-slate-300">
                📋 {t("dataloggerId")}
              </label>
              <p className="mb-3 text-xs leading-relaxed text-slate-500">{t("dataloggerHelp")}</p>
              <input
                id="pn"
                type="text"
                required
                value={pn}
                onChange={(e) => setPn(e.target.value)}
                placeholder={t("dataloggerPlaceholder")}
                className="input-solar"
                autoComplete="off"
              />
            </div>

            {(showCredentials || username || password) && (
              <div className="space-y-4 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
                <div>
                  <label htmlFor="username" className="mb-1 block text-sm font-semibold text-slate-300">
                    👤 {t("username")}
                  </label>
                  <p className="mb-2 text-xs text-slate-500">{t("usernameHelp")}</p>
                  <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={pn || "ahsanullah786"}
                    className="input-solar"
                    autoComplete="username"
                  />
                </div>
                <div>
                  <label htmlFor="password" className="mb-2 block text-sm font-semibold text-slate-300">
                    🔒 {t("password")}
                  </label>
                  <input
                    id="password"
                    type="password"
                    required={showCredentials}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input-solar"
                    autoComplete="current-password"
                  />
                </div>
              </div>
            )}

            {!showCredentials && (
              <button
                type="button"
                onClick={() => setShowCredentials(true)}
                className="w-full py-2 text-sm font-medium text-amber-400/90 transition hover:text-amber-300"
              >
                {t("haveCredentials")}
              </button>
            )}

            {error && (
              <div className="rounded-xl border border-red-500/20 bg-red-950/30 px-4 py-3 text-sm text-red-300">
                ⚠️ {error}
              </div>
            )}

            <button type="submit" disabled={loading || !pn.trim()} className="btn-solar w-full">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-stone-800/30 border-t-stone-900" />
                  {t("connecting")}
                </span>
              ) : (
                t("connect")
              )}
            </button>
          </form>

          <p className="mt-5 text-center text-xs text-slate-600">{t("readOnly")}</p>
        </div>
      </div>

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
