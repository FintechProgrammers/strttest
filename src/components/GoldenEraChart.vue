<template>
  <div class="w-full h-full">
    <div ref="chartContainer" class="w-full h-[600px]" />
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from "vue";
import { createChart } from "lightweight-charts";
import { runEngine as runGoldenEra } from "@/services/golden_era.js"; // adjust path

const props = defineProps({
  candles: {
    type: Array,
    required: true,
    // Example candle format:
    // { time: 1735680000, open: 2000, high: 2005, low: 1995, close: 2003 }
  },
  settings: {
    type: Object,
    default: () => ({
      PSYC_STEP: 5,
      BOX_STEP: 0.5,
      SL_STEP: 1.5,
      TP1_STEP: 1.5,
      TP2_STEP: 3,
      showDebug: false,
    }),
  },
});

const chartContainer = ref(null);
let chart, candleSeries, lineSeries, boxLines;

function drawGoldenEra(candles, settings) {
  if (!candles?.length) return;

  // Ensure sorted & unique
  const sortedCandles = [...candles]
    .sort((a, b) => a.time - b.time)
    .filter((c, i, arr) => i === 0 || c.time > arr[i - 1].time);

  // Sanity check
  for (let i = 1; i < sortedCandles.length; i++) {
    if (sortedCandles[i].time <= sortedCandles[i - 1].time) {
      console.error(
        "Time ordering issue at index",
        i,
        sortedCandles[i].time,
        "<=",
        sortedCandles[i - 1].time
      );
    }
  }

  const result = runGoldenEra(sortedCandles, settings);
  candleSeries.setData(sortedCandles);

  // ... rest of your drawing logic
}

function updateChartData(newCandles) {
  if (!chart || !candleSeries || !newCandles.length) return;

  try {
    // Validate and format candle data
    const validCandles = newCandles
      .filter(
        (candle) =>
          candle &&
          typeof candle.time === "number" &&
          !isNaN(candle.time) &&
          typeof candle.open === "number" &&
          typeof candle.high === "number" &&
          typeof candle.low === "number" &&
          typeof candle.close === "number"
      )
      // SORT BY TIME ASCENDING
      .sort((a, b) => a.time - b.time);

    if (validCandles.length === 0) {
      console.warn("No valid candle data provided");
      return;
    }

    candleSeries.setData(validCandles);

    // Run engine analysis
    try {
      const result = runEngine(validCandles, props.settings);
      draw(result, validCandles);
    } catch (engineError) {
      console.warn("Engine analysis failed:", engineError);
    }
  } catch (error) {
    console.error("Error updating chart data:", error);
  }
}

onMounted(() => {
  chart = createChart(chartContainer.value, {
    width: chartContainer.value.clientWidth,
    height: chartContainer.value.clientHeight,
    layout: { background: { color: "#111" }, textColor: "white" },
    grid: { vertLines: { color: "#333" }, horzLines: { color: "#333" } },
  });

  candleSeries = chart.addCandlestickSeries();
  lineSeries = chart.addLineSeries({ color: "yellow", lineWidth: 1 });
  boxLines = chart.addLineSeries({ color: "aqua", lineWidth: 1 });

  drawGoldenEra(props.candles, props.settings);
});

// Re-render if props change
watch(
  () => [props.candles, props.settings],
  ([candles, settings]) => {
    drawGoldenEra(candles, settings);
  },
  { deep: true }
);
</script>
