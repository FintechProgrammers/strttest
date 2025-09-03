<script setup>
import { ref, onMounted, onUnmounted, watch } from "vue";
import axios from "axios";
import GoldLevelsChart from "@/components/GoldLevelsChart.vue";

const candles = ref([]);
const loading = ref(false);
const error = ref(null);
const currencyPairs = [
  { label: "Gold/USD", value: "XAU/USD" },
  // Add more pairs if needed
];
const selectedPair = ref(currencyPairs[0].value);

let intervalId = null;

// Twelve Data for Gold
async function fetchCandlesTwelveData() {
  const API_KEY = "2f99b3181e0b4d54872a26a4e4f31d0f"; // Replace with your Twelve Data API key
  try {
    const res = await axios.get("https://api.twelvedata.com/time_series", {
      params: {
        symbol: selectedPair.value,
        interval: "5min",
        outputsize: 100,
        apikey: API_KEY,
      },
      timeout: 10000,
    });
    if (!res.data || !res.data.values) throw new Error("Invalid data format");
    candles.value = res.data.values
      .map((c) => ({
        time: Math.floor(new Date(c.datetime).getTime() / 1000),
        open: parseFloat(c.open),
        high: parseFloat(c.high),
        low: parseFloat(c.low),
        close: parseFloat(c.close),
        volume: parseFloat(c.volume ?? 0),
      }))
      .reverse(); // API returns newest first
  } catch (err) {
    console.error("Twelve Data error:", err);
    throw err;
  }
}

async function fetchCandles() {
  loading.value = true;
  error.value = null;
  try {
    await fetchCandlesTwelveData();
    loading.value = false;
  } catch (err) {
    error.value = "Failed to fetch Gold data.";
    loading.value = false;
  }
}

onMounted(() => {
  fetchCandles();
  intervalId = setInterval(fetchCandles, 60 * 1000); // Update every minute
});

onUnmounted(() => {
  clearInterval(intervalId);
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
