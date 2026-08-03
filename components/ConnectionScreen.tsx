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
    const timer = window.setTimeout(() => {
      const savedPn = sessionStorage.getItem("knox_pn");
      if (savedPn) setPn(savedPn);
    }, 0);
    return () => window.clearTimeout(timer);
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
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="brand-mark"><span /></div>
          <div><span className="block text-base font-semibold tracking-tight text-white">{t("appTitle")}</span><span className="block text-[10px] uppercase tracking-[0.18em] text-slate-600">Energy intelligence</span></div>
        </div>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="icon-button"
          aria-label={t("settings")}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 01-.1 1.2l2 1.6-2 3.4-2.5-1a8 8 0 01-2.1 1.2L14 21h-4l-.4-2.6a8 8 0 01-2.1-1.2l-2.5 1-2-3.4 2-1.6A7 7 0 015 12a7 7 0 01.1-1.2l-2-1.6 2-3.4 2.5 1a8 8 0 012.1-1.2L10 3h4l.4 2.6a8 8 0 012.1 1.2l2.5-1 2 3.4-2 1.6A7 7 0 0119 12z"/></svg>
        </button>
      </div>

      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-4 pb-10 pt-4 sm:px-6 lg:grid-cols-[1fr_460px] lg:px-8">
        <section className="hidden max-w-xl lg:block">
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-emerald-400/15 bg-emerald-400/[0.06] px-3 py-1.5 text-xs font-medium text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300"/>Live inverter intelligence</div>
          <h1 className="text-5xl font-semibold leading-[1.08] tracking-[-0.04em] text-white">Solar performance,<br/><span className="text-slate-500">made actionable.</span></h1>
          <p className="mt-6 max-w-lg text-base leading-7 text-slate-400">Monitor generation, understand household demand and plan appliances around your available solar—without sending commands to your inverter.</p>
          <div className="mt-10 grid grid-cols-3 gap-3"><FeatureStat value="3 sec" label="Live refresh"/><FeatureStat value="Local" label="Private setup"/><FeatureStat value="Read-only" label="Safe access"/></div>
        </section>

        <div className="login-panel w-full max-w-md justify-self-center p-6 sm:p-8 lg:max-w-none">
          <div className="mb-8">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-300/20 bg-amber-300/10 text-amber-300"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg></div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-400">Secure connection</p>
            <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">{t("connectTitle")}</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">{t("connectSubtitle")}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="pn" className="mb-2 block text-sm font-semibold text-slate-300">
                {t("dataloggerId")}
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
                    {t("username")}
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
                    {t("password")}
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

          <p className="mt-5 text-center text-[11px] text-slate-600">◦ {t("readOnly")}</p>
        </div>
      </main>

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

function FeatureStat({ value, label }: { value: string; label: string }) {
  return <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4"><p className="text-sm font-semibold text-white">{value}</p><p className="mt-1 text-xs text-slate-600">{label}</p></div>;
}
