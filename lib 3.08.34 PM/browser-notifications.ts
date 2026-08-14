export type NotificationSetupResult = "granted" | "denied" | "unsupported" | "error";

export async function requestNotificationAccess(): Promise<NotificationSetupResult> {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  try {
    if (Notification.permission === "granted") return "granted";
    if (Notification.permission === "denied") return "denied";
    return await Notification.requestPermission() === "granted" ? "granted" : "denied";
  } catch (error) {
    console.warn("[Notifications] Permission request failed:", error);
    return "error";
  }
}

export function notificationsGranted(): boolean {
  try { return typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted"; }
  catch { return false; }
}

export async function showNotificationSafely(title: string, options: NotificationOptions): Promise<boolean> {
  if (!notificationsGranted()) return false;
  try {
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.getRegistration("/");
      if (registration) {
        await registration.showNotification(title, options);
        return true;
      }
    }
    // Desktop fallback. Some mobile browsers expose Notification but reject its constructor.
    new Notification(title, options);
    return true;
  } catch (error) {
    console.warn("[Notifications] Display failed:", error);
    return false;
  }
}
