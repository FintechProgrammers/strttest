<script setup>
import { ref, onMounted, watch } from "vue";
import axios from "axios";
import GoldLevelsChart from "@/components/GoldLevelsChart.vue";

const candles = ref([]);
const loading = ref(false);
const error = ref(null);
const currencyPairs = [
  { label: "Bitcoin/USD", value: "BTC/USD" },
  { label: "Ethereum/USD", value: "ETH/USD" },
  { label: "BNB/USD", value: "BNB/USD" },
  { label: "Solana/USD", value: "SOL/USD" },
  { label: "XRP/USD", value: "XRP/USD" },
  { label: "Cardano/USD", value: "ADA/USD" },
  { label: "Dogecoin/USD", value: "DOGE/USD" },
];
const selectedPair = ref(currencyPairs[0].value);

// Option 1: Alpha Vantage (Free tier: 25 requests/day)
async function fetchCandlesAlphaVantage() {
  const API_KEY = "YOUR_ALPHA_VANTAGE_API_KEY"; // Get free key from alphavantage.co
  // Not used for crypto pairs
}

// Option 2: Twelve Data (Free tier: 800 requests/day)
async function fetchCandlesTwelveData() {
  const API_KEY = "YOUR_TWELVE_DATA_API_KEY"; // Get free key from twelvedata.com
  // Not used for crypto pairs
}

// Option 3: Finnhub (Free tier: 60 calls/minute)
async function fetchCandlesFinnhub() {
  const API_KEY = "YOUR_FINNHUB_API_KEY"; // Get free key from finnhub.io
  // Not used for crypto pairs
}

// Option 4: CoinGecko (Free, no API key needed, but limited to crypto)
async function fetchCandlesCoinGecko() {
  try {
    // Map selectedPair to CoinGecko coin id
    let coin = "bitcoin";
    if (selectedPair.value === "ETH/USD") coin = "ethereum";
    if (selectedPair.value === "BNB/USD") coin = "binancecoin";
    if (selectedPair.value === "SOL/USD") coin = "solana";
    if (selectedPair.value === "XRP/USD") coin = "ripple";
    if (selectedPair.value === "ADA/USD") coin = "cardano";
    if (selectedPair.value === "DOGE/USD") coin = "dogecoin";
    const res = await axios.get(
      `https://api.coingecko.com/api/v3/coins/${coin}/ohlc`,
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
    // Only BTC/USDT, ETH/USDT, BNB/USDT, SOL/USDT, XRP/USDT, ADA/USDT, DOGE/USDT supported for Binance
    let symbol = "BTCUSDT";
    if (selectedPair.value === "ETH/USD") symbol = "ETHUSDT";
    if (selectedPair.value === "BNB/USD") symbol = "BNBUSDT";
    if (selectedPair.value === "SOL/USD") symbol = "SOLUSDT";
    if (selectedPair.value === "XRP/USD") symbol = "XRPUSDT";
    if (selectedPair.value === "ADA/USD") symbol = "ADAUSDT";
    if (selectedPair.value === "DOGE/USD") symbol = "DOGEUSDT";
    const res = await axios.get("https://api.binance.com/api/v3/klines", {
      params: {
        symbol,
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
    { name: "Binance", fn: fetchCandlesBinance },
    { name: "CoinGecko", fn: fetchCandlesCoinGecko },
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
watch(selectedPair, () => {
  fetchCandles();
});
</script>

<template>
  <div>
    <div style="margin-bottom: 1rem">
      <label for="pair-select">Currency Pair:</label>
      <select id="pair-select" v-model="selectedPair">
        <option
          v-for="pair in currencyPairs"
          :key="pair.value"
          :value="pair.value"
        >
          {{ pair.label }}
        </option>
      </select>
    </div>
    <div v-if="loading">Loading candlestick data...</div>
    <div v-if="error" style="color: red">{{ error }}</div>
    <GoldLevelsChart v-if="candles.length" :candles="candles" />
  </div>
</template>
