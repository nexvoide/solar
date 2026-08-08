package com.knoxsolar.companion;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.TextView;

public class MainActivity extends Activity {
    private static final String SETTINGS_KEY = "knox_solar_forecast_settings_v1";
    private static final String LEARNING_KEY = "knox_solar_forecast_learning_v1";
    private final Handler syncHandler = new Handler(Looper.getMainLooper());
    private final Runnable syncTask = new Runnable() {
        @Override public void run() {
            syncForecastSettings();
            syncHandler.postDelayed(this, 15_000);
        }
    };
    private WebView webView;

    @Override
    @SuppressLint("SetJavaScriptEnabled")
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (BuildConfig.DASHBOARD_URL.equals("https://example.com")) {
            TextView message = new TextView(this);
            message.setPadding(48, 48, 48, 48);
            message.setText("Set DASHBOARD_URL in android/gradle.properties, then rebuild the app.");
            setContentView(message);
            return;
        }

        webView = new WebView(this);
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setDatabaseEnabled(true);
        webView.getSettings().setUserAgentString(webView.getSettings().getUserAgentString() + " KnoxSolarCompanion/1.0");
        webView.addJavascriptInterface(new ForecastBridge(), "KnoxAndroid");
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri target = request.getUrl();
                Uri dashboard = Uri.parse(BuildConfig.DASHBOARD_URL);
                if (dashboard.getHost() != null && dashboard.getHost().equalsIgnoreCase(target.getHost())) return false;
                startActivity(new Intent(Intent.ACTION_VIEW, target));
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                syncForecastSettings();
            }
        });
        setContentView(webView);
        webView.loadUrl(BuildConfig.DASHBOARD_URL);
        syncHandler.postDelayed(syncTask, 15_000);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) syncForecastSettings();
    }

    @Override
    protected void onPause() {
        syncForecastSettings();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        syncHandler.removeCallbacks(syncTask);
        if (webView != null) {
            webView.removeJavascriptInterface("KnoxAndroid");
            webView.destroy();
        }
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    private void syncForecastSettings() {
        if (webView == null) return;
        String script = "(() => { try {" +
            "const s=localStorage.getItem('" + SETTINGS_KEY + "')||'';" +
            "const l=localStorage.getItem('" + LEARNING_KEY + "')||'';" +
            "KnoxAndroid.saveForecast(s,l);" +
            "} catch(e) {} })()";
        webView.evaluateJavascript(script, null);
    }

    private final class ForecastBridge {
        @JavascriptInterface
        public void saveForecast(String settings, String learning) {
            getSharedPreferences(SolarWidgetProvider.PREFS, MODE_PRIVATE)
                .edit()
                .putString(SolarWidgetProvider.KEY_BASE_URL, BuildConfig.DASHBOARD_URL)
                .putString(SolarWidgetProvider.KEY_FORECAST_SETTINGS, settings)
                .putString(SolarWidgetProvider.KEY_FORECAST_LEARNING, learning)
                .apply();
            SolarWidgetProvider.updateAll(MainActivity.this);
        }
    }
}
