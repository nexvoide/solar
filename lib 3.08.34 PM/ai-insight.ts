export type InsightSeverity = "good" | "info" | "warning";

export interface EnergyInsight {
  title: string;
  summary: string;
  action: string;
  severity: InsightSeverity;
  source: "gemini" | "local";
  generatedAt: string;
}

export interface InsightReading {
  pvKw: number;
  loadKw: number;
  gridKw: number;
  temperatureC: number | null;
  gridConnected: boolean;
  statusCode: number | null;
  faultCode: number;
  warningCode: number;
  todayEnergyKwh: number | null;
  recent?: Array<{ time: number; pvKw: number; loadKw: number; temperature: number | null }>;
}

export function localEnergyInsight(reading: InsightReading, language: "ur" | "en"): EnergyInsight {
  const surplus = reading.pvKw - reading.loadKw;
  const highTemperature = reading.temperatureC !== null && reading.temperatureC >= 50;
  const hasFault = reading.faultCode > 0 || reading.warningCode > 0;
  const ur = language === "ur";

  let severity: InsightSeverity = "info";
  let title = ur ? "توانائی کا جائزہ" : "Energy snapshot";
  let summary = ur
    ? `سولر ${reading.pvKw.toFixed(1)} kW بنا رہا ہے جبکہ گھر ${reading.loadKw.toFixed(1)} kW استعمال کر رہا ہے۔`
    : `Solar is producing ${reading.pvKw.toFixed(1)} kW while the home is using ${reading.loadKw.toFixed(1)} kW.`;
  let action = ur ? "بھاری آلات چلانے سے پہلے سولر کی دستیاب طاقت دیکھیں۔" : "Check available solar before starting a heavy appliance.";

  if (hasFault) {
    severity = "warning";
    title = ur ? "سسٹم کو چیک کریں" : "Check the system";
    summary = ur ? "انورٹر نے خرابی یا تنبیہ کی اطلاع دی ہے۔" : "The inverter is reporting a fault or warning.";
    action = ur ? "انورٹر اسکرین پر کوڈ دیکھیں اور ضرورت ہو تو ٹیکنیشن سے رابطہ کریں۔" : "Check the code on the inverter display and contact a technician if it remains active.";
  } else if (highTemperature) {
    severity = "warning";
    title = ur ? "انورٹر گرم ہے" : "Inverter is running hot";
    summary = ur ? `درجہ حرارت ${reading.temperatureC!.toFixed(0)}°C ہے، جس سے کارکردگی متاثر ہو سکتی ہے۔` : `Temperature is ${reading.temperatureC!.toFixed(0)}°C, which may reduce efficiency.`;
    action = ur ? "ہوا کی آمدورفت بہتر کریں اور وینٹس کو رکاوٹ سے پاک رکھیں۔" : "Improve airflow and make sure the vents are clear.";
  } else if (surplus >= 0.7) {
    severity = "good";
    title = ur ? "اضافی سولر دستیاب ہے" : "Extra solar is available";
    summary = ur ? `تقریباً ${surplus.toFixed(1)} kW سولر گھر کے موجودہ استعمال سے زیادہ ہے۔` : `Solar production is about ${surplus.toFixed(1)} kW above current home use.`;
    action = ur ? "پمپ، واشنگ مشین یا دوسرے مناسب آلات ابھی چلانے کا اچھا وقت ہے۔" : "This is a good time to run a suitable appliance such as a pump or washing machine.";
  } else if (reading.pvKw < reading.loadKw) {
    severity = "info";
    title = ur ? "گھر کا لوڈ سولر سے زیادہ ہے" : "Home use is above solar";
    action = ur ? "گرڈ یا بیٹری کا استعمال کم کرنے کے لیے غیر ضروری بھاری لوڈ مؤخر کریں۔" : "Delay non-essential heavy loads to reduce grid or battery use.";
  }

  return { title, summary, action, severity, source: "local", generatedAt: new Date().toISOString() };
}
