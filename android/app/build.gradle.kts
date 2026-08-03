plugins {
    id("com.android.application")
}

val dashboardUrl = providers.gradleProperty("DASHBOARD_URL").getOrElse("https://example.com")

android {
    namespace = "com.knoxsolar.companion"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.knoxsolar.companion"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
        buildConfigField("String", "DASHBOARD_URL", "\"${dashboardUrl.trimEnd('/')}\"")
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
