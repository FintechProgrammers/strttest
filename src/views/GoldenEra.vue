<template>
  <div>
    <div v-if="loading">Loading gold data...</div>
    <div v-if="error" style="color: red">{{ error }}</div>
    <GoldenEraChart
      v-if="candles.length"
      :candles="candles"
      :settings="{ showDebug: true }"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from "vue";
import axios from "axios";
import GoldenEraChart from "@/components/GoldenEraChart.vue";

const candles = ref([]);
const loading = ref(false);
const error = ref(null);

const API_KEY = "2f99b3181e0b4d54872a26a4e4f31d0f"; // Replace with your Twelve Data API key

async function fetchGoldCandles() {
  loading.value = true;
  error.value = null;
  try {
    const res = await axios.get("https://api.twelvedata.com/time_series", {
      params: {
        symbol: "XAU/USD",
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
      .sort((a, b) => a.time - b.time); // Ensure ascending order
    loading.value = false;
  } catch (err) {
    error.value = "Failed to fetch Gold data.";
    loading.value = false;
  }
}

let intervalId;

onMounted(() => {
  fetchGoldCandles();
  intervalId = setInterval(fetchGoldCandles, 60 * 1000); // Update every minute
});

onUnmounted(() => {
  clearInterval(intervalId);
});
</script>
