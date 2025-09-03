<template>
  <div class="chart-wrapper">
    <h3>Gold Levels Chart</h3>
    <div class="chart-container">
      <iframe
        :src="tradingViewUrl"
        frameborder="0"
        width="100%"
        height="500"
        allowtransparency="true"
        scrolling="no"
        style="border-radius: 8px"
      ></iframe>
    </div>
    <div v-if="engineResult">
      <h4>Engine Results:</h4>
      <pre>{{ engineResult }}</pre>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted } from "vue";
import { runEngine } from "@/services/fiverr_engine_v1.js";

const selectedPair = ref("BTC/USD");
const engineResult = ref(null);

// Example: Run engine on mount (replace with your actual candle data)
onMounted(async () => {
  const candles = []; // Fetch or provide your candle data here
  engineResult.value = await runEngine(candles, {
    /* settings */
  });
});

const symbolMap = {
  "BTC/USD": "BINANCE:BTCUSDT",
  "ETH/USD": "BINANCE:ETHUSDT",
  "BNB/USD": "BINANCE:BNBUSDT",
  "SOL/USD": "BINANCE:SOLUSDT",
  "XRP/USD": "BINANCE:XRPUSDT",
  "ADA/USD": "BINANCE:ADAUSDT",
  "DOGE/USD": "BINANCE:DOGEUSDT",
};

const tradingViewUrl = computed(() => {
  const symbol = symbolMap[selectedPair.value] || symbolMap["BTC/USD"];
  return `https://s.tradingview.com/widgetembed/?frameElementId=tradingview_${Math.random()
    .toString(36)
    .substr(
      2,
      8
    )}&symbol=${symbol}&interval=5&theme=light&style=1&locale=en&utm_source=&hide_top_toolbar=true&hide_side_toolbar=true&allow_symbol_change=true&save_image=false&container_id=tradingview_${Math.random()
    .toString(36)
    .substr(2, 8)}`;
});
</script>

<style scoped>
.chart-wrapper {
  width: 100%;
  padding: 16px;
}
.chart-container {
  width: 100%;
  height: 500px;
  min-height: 400px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  overflow: hidden;
  background: white;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}
</style>
