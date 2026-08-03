import type { Language } from "./translations";

export const forecastCopy = {
  en: {
    assistant: "Solar Forecast Assistant", planning: "Planning assistant", loading: "Loading Solar Forecast…",
    canTurnOn: "Can I turn it on?", editSetup: "Edit setup", currentSolar: "Current Solar", forecastSolar: "Forecast Solar",
    houseLoad: "House Load", accuracy: "Forecast Accuracy", availability: "Availability", surplusNow: "Surplus available now",
    surplusHint: "Forecast solar minus current house load", cloud: "Cloud", temp: "Temp", humidity: "Humidity", wind: "km/h",
    hourly: "Today's hourly forecast", rain: "Rain", recommended: "Recommended appliances", editWatts: "Edit watts below",
    falling: "Expected solar will decrease soon. Avoid starting a long heavy load.", deficitA: "Forecast is", deficitB: "W below the current load. If you have no battery or grid support, consider turning off",
    essential: "Run essential appliances only. No additional configured load fits the forecast surplus.", remaining: "Remaining capacity",
    applianceSettings: "Appliance settings", disclaimer: "Forecasts are estimates, not electrical safety guarantees. Leave headroom for motor startup surges. Weather data by Open-Meteo.",
    excellent: "Excellent", moderate: "Moderate", low: "Low", excellentMsg: "Enough solar for heavy appliances", moderateMsg: "Avoid starting additional heavy loads", lowMsg: "Run essential appliances only",
    setupTitle: "Set up your solar forecast", setupHint: "Saved only on this device. You can change it later.", exactLocation: "Exact solar location",
    gettingLocation: "Getting precise location…", useGps: "Use my exact GPS location", gpsAccuracy: "GPS accuracy: approximately", metres: "metres",
    cityFallback: "GPS unavailable? Use a city as fallback", enterCity: "Enter city", search: "Search", panels: "Solar panels", wattage: "Panel wattage",
    orientation: "Panel orientation", tilt: "Roof tilt (°)", efficiency: "Efficiency (%)", systemType: "System type", cancel: "Cancel", save: "Save & forecast", wait: "Please wait…",
    forecastNow: "Solar forecast · now", setupForecast: "Set up your solar forecast", setupDashboardHint: "Get surplus power and appliance recommendations.",
    surplus: "Surplus", additional: "Available for additional appliances", keepOff: "Keep additional loads off", viewDetails: "View details",
    nextHour: "Next hour", todayTimeline: "Today", safeStart: "You can safely start", noHeadroom: "Keep additional appliances off for now.",
    sunny: "Sunny", partlyCloudy: "Partly cloudy", cloudy: "Cloudy", rainLikely: "Rain likely", rainPossible: "Rain possible", foggy: "Foggy", thunderstorm: "Thunderstorm",
  },
  ur: {
    assistant: "سولر پیشگوئی معاون", planning: "بجلی کی منصوبہ بندی", loading: "سولر پیشگوئی لوڈ ہو رہی ہے…",
    canTurnOn: "کیا میں یہ چلا سکتا ہوں؟", editSetup: "سیٹ اپ بدلیں", currentSolar: "موجودہ سولر", forecastSolar: "متوقع سولر",
    houseLoad: "گھر کا لوڈ", accuracy: "پیشگوئی کی درستگی", availability: "دستیابی", surplusNow: "ابھی اضافی سولر",
    surplusHint: "متوقع سولر میں سے موجودہ گھر کا لوڈ نکال کر", cloud: "بادل", temp: "درجہ حرارت", humidity: "نمی", wind: "کلومیٹر/گھنٹہ",
    hourly: "آج کی گھنٹہ وار سولر پیشگوئی", rain: "بارش", recommended: "تجویز کردہ آلات", editWatts: "واٹ نیچے تبدیل کریں",
    falling: "سولر جلد کم ہونے کی توقع ہے۔ ابھی کوئی بھاری آلہ شروع نہ کریں۔", deficitA: "متوقع سولر موجودہ لوڈ سے", deficitB: "واٹ کم ہے۔ اگر بیٹری یا گرڈ نہیں تو بند کرنے پر غور کریں:",
    essential: "صرف ضروری آلات چلائیں۔ اضافی سولر میں کوئی اور آلہ محفوظ طریقے سے نہیں چل سکتا۔", remaining: "باقی گنجائش",
    applianceSettings: "آلات کی ترتیبات", disclaimer: "یہ ایک تخمینہ ہے، برقی حفاظت کی ضمانت نہیں۔ موٹر کے ابتدائی لوڈ کے لیے گنجائش رکھیں۔ موسم کا ڈیٹا Open-Meteo سے ہے۔",
    excellent: "بہترین", moderate: "درمیانہ", low: "کم", excellentMsg: "بھاری آلات کے لیے کافی سولر ہے", moderateMsg: "مزید بھاری آلات شروع نہ کریں", lowMsg: "صرف ضروری آلات چلائیں",
    setupTitle: "اپنی سولر پیشگوئی سیٹ کریں", setupHint: "صرف اس ڈیوائس پر محفوظ ہوگا۔ بعد میں تبدیل کیا جا سکتا ہے۔", exactLocation: "سولر کی درست جگہ",
    gettingLocation: "درست جگہ معلوم ہو رہی ہے…", useGps: "میری درست GPS جگہ استعمال کریں", gpsAccuracy: "GPS کی اندازاً درستگی:", metres: "میٹر",
    cityFallback: "GPS دستیاب نہیں؟ شہر استعمال کریں", enterCity: "شہر لکھیں", search: "تلاش", panels: "سولر پینلز", wattage: "فی پینل واٹ",
    orientation: "پینل کی سمت", tilt: "چھت کا زاویہ (°)", efficiency: "کارکردگی (%)", systemType: "سسٹم کی قسم", cancel: "منسوخ", save: "محفوظ کریں اور پیشگوئی دیکھیں", wait: "انتظار کریں…",
    forecastNow: "ابھی کی سولر پیشگوئی", setupForecast: "سولر پیشگوئی سیٹ کریں", setupDashboardHint: "اضافی بجلی اور آلات کی تجاویز دیکھیں۔",
    surplus: "اضافی بجلی", additional: "مزید آلات کے لیے بجلی دستیاب ہے", keepOff: "مزید آلات بند رکھیں", viewDetails: "تفصیل دیکھیں",
    nextHour: "اگلا گھنٹہ", todayTimeline: "آج", safeStart: "آپ محفوظ طریقے سے چلا سکتے ہیں:", noHeadroom: "ابھی مزید آلات بند رکھیں۔",
    sunny: "دھوپ", partlyCloudy: "جزوی بادل", cloudy: "بادل", rainLikely: "بارش کا امکان", rainPossible: "بارش ممکن", foggy: "دھند", thunderstorm: "گرج چمک",
  },
} as const satisfies Record<Language, Record<string, string>>;

export const applianceNames: Record<Language, Record<string, string>> = {
  en: {},
  ur: { "inverter-ac": "انورٹر AC ڈیڑھ ٹن", "non-inverter-ac": "نان انورٹر AC", refrigerator: "فریج", "water-pump": "پانی کی موٹر", fan: "پنکھا", "led-light": "LED لائٹ", laptop: "لیپ ٹاپ", desktop: "ڈیسک ٹاپ کمپیوٹر", "washing-machine": "واشنگ مشین", microwave: "مائیکروویو", iron: "بجلی کی استری" },
};
