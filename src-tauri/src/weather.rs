//! MET Norway Locationforecast proxy (User-Agent must be set outside the WebView).

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WeatherSnapshot {
    pub temperature_c: f64,
    pub symbol: String,
    pub updated_at: u64,
    pub expires_at: u64,
}

static CACHE: Mutex<Option<HashMap<String, WeatherSnapshot>>> = Mutex::new(None);

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn cache_key(lat: f64, lon: f64) -> String {
    format!("{:.2},{:.2}", lat, lon)
}

#[tauri::command]
pub async fn fetch_weather(lat: f64, lon: f64) -> Result<WeatherSnapshot, String> {
    let key = cache_key(lat, lon);
    let now = now_ms();

    if let Ok(guard) = CACHE.lock() {
        if let Some(map) = guard.as_ref() {
            if let Some(hit) = map.get(&key) {
                if hit.expires_at > now {
                    return Ok(hit.clone());
                }
            }
        }
    }

    let url = format!(
        "https://api.met.no/weatherapi/locationforecast/2.0/compact?lat={:.4}&lon={:.4}",
        lat, lon
    );

    let client = reqwest::Client::builder()
        .user_agent("Orblune/0.1.0 github.com/Aesop/Orblune")
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;

    let res = client
        .get(&url)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(format!("MET Norway {}", res.status()));
    }

    let expires_at = res
        .headers()
        .get("expires")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| httpdate_parse(s))
        .unwrap_or(now + 30 * 60 * 1000);

    let body: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let first = body
        .pointer("/properties/timeseries/0")
        .ok_or_else(|| "Empty forecast".to_string())?;

    let temperature_c = first
        .pointer("/data/instant/details/air_temperature")
        .and_then(|v| v.as_f64())
        .ok_or_else(|| "Missing temperature".to_string())?;

    let symbol = first
        .pointer("/data/next_1_hours/summary/symbol_code")
        .or_else(|| first.pointer("/data/next_6_hours/summary/symbol_code"))
        .and_then(|v| v.as_str())
        .unwrap_or("clearsky_day")
        .to_string();

    let snapshot = WeatherSnapshot {
        temperature_c,
        symbol,
        updated_at: now,
        expires_at,
    };

    if let Ok(mut guard) = CACHE.lock() {
        let map = guard.get_or_insert_with(HashMap::new);
        map.insert(key, snapshot.clone());
    }

    Ok(snapshot)
}

fn httpdate_parse(s: &str) -> Option<u64> {
    // RFC 2822 / HTTP-date via chrono
    chrono::DateTime::parse_from_rfc2822(s)
        .ok()
        .map(|dt| dt.timestamp_millis() as u64)
}
