package com.knoxsolar.companion;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import android.webkit.CookieManager;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public class SolarWidgetProvider extends AppWidgetProvider {
    public static final String PREFS = "knox_widget";
    public static final String KEY_BASE_URL = "base_url";
    public static final String KEY_FORECAST_SETTINGS = "forecast_settings";
    public static final String KEY_FORECAST_LEARNING = "forecast_learning";
    private static final String ACTION_REFRESH = "com.knoxsolar.companion.REFRESH_WIDGET";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] widgetIds) {
        refresh(context);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (ACTION_REFRESH.equals(intent.getAction())) refresh(context);
    }

    public static void updateAll(Context context) {
        refresh(context.getApplicationContext());
    }

    private static void refresh(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, SolarWidgetProvider.class));
        if (ids.length == 0) return;
        for (int id : ids) manager.updateAppWidget(id, loadingViews(context));

        Thread worker = new Thread(() -> {
            WidgetData data;
            try {
                data = fetchData(context);
            } catch (Exception error) {
                data = new WidgetData("—", "—", "—", readableError(error));
            }
            WidgetData result = data;
            new Handler(Looper.getMainLooper()).post(() -> {
                for (int id : ids) manager.updateAppWidget(id, dataViews(context, result));
            });
        }, "knox-widget-refresh");
        worker.start();
    }

    private static RemoteViews loadingViews(Context context) {
        RemoteViews views = baseViews(context);
        views.setTextViewText(R.id.updated_at, "Refreshing…");
        return views;
    }

    private static RemoteViews dataViews(Context context, WidgetData data) {
        RemoteViews views = baseViews(context);
        views.setTextViewText(R.id.current_solar, data.solar);
        views.setTextViewText(R.id.house_load, data.load);
        views.setTextViewText(R.id.forecast_solar, data.forecast);
        views.setTextViewText(R.id.updated_at, data.status);
        return views;
    }

    private static RemoteViews baseViews(Context context) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.solar_widget);
        Intent open = new Intent(context, MainActivity.class);
        PendingIntent openIntent = PendingIntent.getActivity(context, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_root, openIntent);

        Intent refresh = new Intent(context, SolarWidgetProvider.class).setAction(ACTION_REFRESH);
        PendingIntent refreshIntent = PendingIntent.getBroadcast(context, 1, refresh, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.updated_at, refreshIntent);
        return views;
    }

    private static WidgetData fetchData(Context context) throws Exception {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String baseUrl = prefs.getString(KEY_BASE_URL, BuildConfig.DASHBOARD_URL);
        if (baseUrl == null || baseUrl.equals("https://example.com")) {
            throw new IllegalStateException("Configure app URL");
        }

        String cookies = CookieManager.getInstance().getCookie(baseUrl);
        JSONObject live = getJson(baseUrl + "/api/live?_=" + System.currentTimeMillis(), cookies, baseUrl);
        if (!live.optBoolean("ok")) throw new IllegalStateException("Open app to sign in");

        double solar = powerKw(live.getJSONObject("pvPower"));
        double load = powerKw(live.getJSONObject("loadPower"));
        String forecastText = "Set up";

        String rawSettings = prefs.getString(KEY_FORECAST_SETTINGS, "");
        if (rawSettings != null && !rawSettings.isEmpty()) {
            JSONObject settings = new JSONObject(rawSettings);
            double calibration = calibration(prefs.getString(KEY_FORECAST_LEARNING, ""));
            double forecast = fetchForecast(baseUrl, cookies, settings, calibration);
            forecastText = kw(forecast);
        }

        String time = java.time.LocalTime.now().format(DateTimeFormatter.ofPattern("h:mm a", Locale.US));
        return new WidgetData(kw(solar), kw(load), forecastText, time + " · tap to refresh");
    }

    private static double fetchForecast(String baseUrl, String cookies, JSONObject settings, double calibration) throws Exception {
        double latitude = settings.getDouble("latitude");
        double longitude = settings.getDouble("longitude");
        double tilt = settings.optDouble("roofTilt", 30);
        String orientation = settings.optString("orientation", "south");
        int azimuth;
        switch (orientation) {
            case "south-east": azimuth = -45; break;
            case "east": azimuth = -90; break;
            case "south-west": azimuth = 45; break;
            case "west": azimuth = 90; break;
            case "north": azimuth = 180; break;
            default: azimuth = 0;
        }

        String endpoint = String.format(Locale.US, "%s/api/forecast/weather?latitude=%f&longitude=%f&tilt=%f&azimuth=%d", baseUrl, latitude, longitude, tilt, azimuth);
        JSONObject weather = getJson(endpoint, cookies, baseUrl);
        JSONObject hourly = weather.getJSONObject("hourly");
        JSONArray times = hourly.getJSONArray("time");
        JSONArray temperatures = hourly.getJSONArray("temperature_2m");
        JSONArray clouds = hourly.getJSONArray("cloud_cover");
        JSONArray irradiance = hourly.getJSONArray("shortwave_radiation");
        JSONArray tilted = hourly.optJSONArray("global_tilted_irradiance");
        JSONObject daily = weather.getJSONObject("daily");
        long sunrise = parseWeatherTime(daily.getJSONArray("sunrise").getString(0));
        long sunset = parseWeatherTime(daily.getJSONArray("sunset").getString(0));
        long now = System.currentTimeMillis();
        int closest = -1;
        long closestDistance = Long.MAX_VALUE;

        for (int i = 0; i < times.length(); i++) {
            long time = parseWeatherTime(times.getString(i));
            if (time < sunrise - 3_600_000L || time > sunset) continue;
            long distance = Math.abs(time - now);
            if (distance < closestDistance) {
                closest = i;
                closestDistance = distance;
            }
        }
        if (closest < 0) return 0;

        double capacity = settings.getDouble("panels") * settings.getDouble("panelWattage") / 1000d;
        double efficiency = settings.optDouble("systemEfficiency", 100) / 100d;
        double temp = temperatures.optDouble(closest, 25);
        double tempFactor = temp <= 25 ? 1 : Math.max(.75, 1 - (temp - 25) * .008);
        boolean hasTilted = tilted != null && !tilted.isNull(closest) && tilted.optDouble(closest, -1) >= 0;
        double radiation = hasTilted ? tilted.optDouble(closest, 0) : irradiance.optDouble(closest, 0);
        double fallback = hasTilted ? 1 : cloudFactor(clouds.optDouble(closest, 0)) * orientationFactor(orientation);
        return Math.max(0, Math.min(capacity, capacity * Math.max(0, radiation / 1000d) * fallback * tempFactor * efficiency * calibration));
    }

    private static JSONObject getJson(String endpoint, String cookies, String cookieOrigin) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(endpoint).openConnection();
        connection.setConnectTimeout(15_000);
        connection.setReadTimeout(25_000);
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("User-Agent", "KnoxSolarWidget/1.0");
        if (cookies != null && !cookies.isEmpty()) connection.setRequestProperty("Cookie", cookies);
        int status = connection.getResponseCode();
        saveCookies(connection, cookieOrigin);
        InputStream stream = status >= 200 && status < 300 ? connection.getInputStream() : connection.getErrorStream();
        StringBuilder body = new StringBuilder();
        if (stream != null) {
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) body.append(line);
            }
        }
        connection.disconnect();
        if (status < 200 || status >= 300) {
            if (status == 401) throw new IllegalStateException("Open app to sign in");
            throw new IllegalStateException("Update failed (" + status + ")");
        }
        return new JSONObject(body.toString());
    }

    private static void saveCookies(HttpURLConnection connection, String origin) {
        for (Map.Entry<String, List<String>> entry : connection.getHeaderFields().entrySet()) {
            if (entry.getKey() != null && entry.getKey().equalsIgnoreCase("Set-Cookie")) {
                for (String cookie : entry.getValue()) CookieManager.getInstance().setCookie(origin, cookie);
            }
        }
        CookieManager.getInstance().flush();
    }

    private static double powerKw(JSONObject reading) {
        double value;
        try { value = Double.parseDouble(reading.optString("value", "0")); }
        catch (NumberFormatException ignored) { value = 0; }
        return "w".equalsIgnoreCase(reading.optString("unit")) ? value / 1000d : value;
    }

    private static double calibration(String raw) {
        if (raw == null || raw.isEmpty()) return 1;
        try { return new JSONObject(raw).optDouble("calibration", 1); }
        catch (Exception ignored) { return 1; }
    }

    private static long parseWeatherTime(String value) {
        try { return OffsetDateTime.parse(value).toInstant().toEpochMilli(); }
        catch (Exception ignored) { }
        try { return Instant.parse(value).toEpochMilli(); }
        catch (Exception ignored) { }
        return LocalDateTime.parse(value).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();
    }

    private static double cloudFactor(double cloud) {
        double[][] points = {{0,1},{20,.95},{40,.8},{60,.6},{80,.35},{100,.15}};
        double bounded = Math.max(0, Math.min(100, cloud));
        for (int i = 1; i < points.length; i++) {
            if (bounded <= points[i][0]) {
                double[] a = points[i - 1], b = points[i];
                return a[1] + ((bounded - a[0]) / (b[0] - a[0])) * (b[1] - a[1]);
            }
        }
        return .15;
    }

    private static double orientationFactor(String orientation) {
        switch (orientation) {
            case "south-east": case "south-west": return .96;
            case "east": case "west": return .9;
            case "north": return .75;
            default: return 1;
        }
    }

    private static String kw(double value) {
        return String.format(Locale.US, "%.2f kW", value);
    }

    private static String readableError(Exception error) {
        String message = error.getMessage();
        return message == null || message.isEmpty() ? "Update failed" : message;
    }

    private static final class WidgetData {
        final String solar;
        final String load;
        final String forecast;
        final String status;

        WidgetData(String solar, String load, String forecast, String status) {
            this.solar = solar;
            this.load = load;
            this.forecast = forecast;
            this.status = status;
        }
    }
}
