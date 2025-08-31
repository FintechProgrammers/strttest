<script setup>
import { ref, onMounted } from "vue";
import axios from "axios";
import GoldLevelsChart from "@/components/GoldLevelsChart.vue";

const candles = ref([]);
const loading = ref(false);
const error = ref(null);

// Option 1: Alpha Vantage (Free tier: 25 requests/day)
async function fetchCandlesAlphaVantage() {
  const API_KEY = "YOUR_ALPHA_VANTAGE_API_KEY"; // Get free key from alphavantage.co

  try {
    const res = await axios.get("https://www.alphavantage.co/query", {
      params: {
        function: "FX_INTRADAY",
        from_symbol: "XAU",
        to_symbol: "USD",
        interval: "5min",
        apikey: API_KEY,
        outputsize: "compact",
      },
    });

    const timeSeries = res.data["Time Series FX (5min)"];
    if (!timeSeries) {
      throw new Error("No data received from Alpha Vantage");
    }

    candles.value = Object.entries(timeSeries)
      .map(([time, data]) => ({
        time: Math.floor(new Date(time).getTime() / 1000),
        open: parseFloat(data["1. open"]),
        high: parseFloat(data["2. high"]),
        low: parseFloat(data["3. low"]),
        close: parseFloat(data["4. close"]),
        volume: parseFloat(data["5. volume"] || 0),
      }))
      .sort((a, b) => a.time - b.time)
      .slice(-100); // Last 100 candles
  } catch (err) {
    console.error("Alpha Vantage error:", err);
    throw err;
  }
}

// Option 2: Twelve Data (Free tier: 800 requests/day)
async function fetchCandlesTwelveData() {
  const API_KEY = "YOUR_TWELVE_DATA_API_KEY"; // Get free key from twelvedata.com

  try {
    const res = await axios.get("https://api.twelvedata.com/time_series", {
      params: {
        symbol: "XAU/USD",
        interval: "5min",
        outputsize: 100,
        apikey: API_KEY,
      },
    });

    if (!res.data.values) {
      throw new Error("No data received from Twelve Data");
    }

    candles.value = res.data.values
      .map((data) => ({
        time: Math.floor(new Date(data.datetime).getTime() / 1000),
        open: parseFloat(data.open),
        high: parseFloat(data.high),
        low: parseFloat(data.low),
        close: parseFloat(data.close),
        volume: parseFloat(data.volume || 0),
      }))
      .sort((a, b) => a.time - b.time);
  } catch (err) {
    console.error("Twelve Data error:", err);
    throw err;
  }
}

// Option 3: Finnhub (Free tier: 60 calls/minute)
async function fetchCandlesFinnhub() {
  const API_KEY = "YOUR_FINNHUB_API_KEY"; // Get free key from finnhub.io

  try {
    const to = Math.floor(Date.now() / 1000);
    const from = to - 24 * 60 * 60; // 24 hours ago

    const res = await axios.get("https://finnhub.io/api/v1/forex/candle", {
      params: {
        symbol: "OANDA:XAU_USD",
        resolution: "5",
        from: from,
        to: to,
        token: API_KEY,
      },
    });

    if (res.data.s !== "ok") {
      throw new Error("No data received from Finnhub");
    }

    candles.value = res.data.t
      .map((time, i) => ({
        time: time,
        open: res.data.o[i],
        high: res.data.h[i],
        low: res.data.l[i],
        close: res.data.c[i],
        volume: res.data.v[i] || 0,
      }))
      .slice(-100); // Last 100 candles
  } catch (err) {
    console.error("Finnhub error:", err);
    throw err;
  }
}

// Option 4: CoinGecko (Free, no API key needed, but limited to crypto)
async function fetchCandlesCoinGecko() {
  try {
    // Using Bitcoin as proxy since CoinGecko doesn't have traditional forex
    const res = await axios.get(
      "https://api.coingecko.com/api/v3/coins/bitcoin/ohlc",
      {
        params: {
          vs_currency: "usd",
          days: 1,
        },
      }
    );

    candles.value = res.data
      .map((data) => ({
        time: Math.floor(data[0] / 1000),
        open: data[1],
        high: data[2],
        low: data[3],
        close: data[4],
        volume: 0, // CoinGecko OHLC doesn't include volume
      }))
      .sort((a, b) => a.time - b.time)
      .slice(-100);
  } catch (err) {
    console.error("CoinGecko error:", err);
    throw err;
  }
}

// Option 5: Fixed Binance (your original with better error handling)
async function fetchCandlesBinance() {
  try {
    const res = await axios.get("https://api.binance.com/api/v3/klines", {
      params: {
        symbol: "XAUUSDT", // Gold/USDT
        interval: "5m",
        limit: 100,
      },
      timeout: 10000, // 10 second timeout
    });

    if (!res.data || !Array.isArray(res.data)) {
      throw new Error("Invalid data format from Binance");
    }

    candles.value = res.data.map((c) => ({
      time: Math.floor(c[0] / 1000),
      open: parseFloat(c[1]),
      high: parseFloat(c[2]),
      low: parseFloat(c[3]),
      close: parseFloat(c[4]),
      volume: parseFloat(c[5]),
    }));
  } catch (err) {
    console.error("Binance error:", err);
    throw err;
  }
}

// Main fetch function with fallbacks
async function fetchCandles() {
  loading.value = true;
  error.value = null;

  const fetchMethods = [
    // { name: "Binance", fn: fetchCandlesBinance },
    { name: "CoinGecko", fn: fetchCandlesCoinGecko },
    // Uncomment these when you have API keys:
    // { name: 'Alpha Vantage', fn: fetchCandlesAlphaVantage },
    // { name: 'Twelve Data', fn: fetchCandlesTwelveData },
    // { name: 'Finnhub', fn: fetchCandlesFinnhub },
  ];

  for (const method of fetchMethods) {
    try {
      console.log(`Trying ${method.name}...`);
      await method.fn();
      console.log(`✅ ${method.name} successful`);
      loading.value = false;
      return;
    } catch (err) {
      console.log(`❌ ${method.name} failed:`, err.message);
      continue;
    }
  }

  error.value =
    "All data sources failed. Please check your internet connection.";
  loading.value = false;
}

onMounted(() => {
  fetchCandles();
});
</script>

<template>
  <div>
    <div v-if="loading">Loading candlestick data...</div>
    <div v-if="error" style="color: red">{{ error }}</div>
    <GoldLevelsChart v-if="candles.length" :candles="candles" />
  </div>
</template>
