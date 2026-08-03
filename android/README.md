# Knox Solar Android widget

This companion app opens the deployed Knox Solar dashboard and adds a native Android home-screen widget showing:

- Current Solar
- House Load
- Forecast Solar

## Configure and build

The companion is currently configured for `https://solar-rose-theta.vercel.app` through `DASHBOARD_URL` in `gradle.properties`.

1. Open the `android` directory in Android Studio.
2. Let Gradle sync, then select **Build > Generate App Bundles or APKs > Generate APKs**.
3. Install the APK, open **Knox Solar**, and sign in. Set up the solar forecast in the dashboard if it is not already configured.
4. Long-press the Android home screen, choose **Widgets**, then add **Knox Solar**.

The app keeps credentials in Android WebView's private cookie store. The widget never stores the Knox password. Android schedules widget updates approximately every 30 minutes; tapping the time refreshes immediately, and tapping elsewhere opens the dashboard.

Chrome PWA cookies are not shared with Android WebView, so users must sign in once in this companion app even if the PWA is already installed.
