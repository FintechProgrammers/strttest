<script setup>
import { onMounted, ref, watch, nextTick } from "vue";
import { runEngine, testEngine } from "@/services/fiverr_engine_v1.js";

// Props
const props = defineProps({
  candles: { type: Array, required: true }, // [{time, open, high, low, close, volume}]
  settings: {
    type: Object,
    default: () => ({
      pipSize: 0.1,
      levelPips: 50,
      entryZonePips: 10,
      slPips: 20,
      tp1Pips: 20,
      tp2Pips: 40,
      nLevels: 4,
      zoneNoBars: 40,
      closeBelowEntryZone: true,
    }),
  },
});

// Refs
const chartContainer = ref(null);
let chart, candleSeries;
let overlaySeries = [];
let LightweightCharts = null;

// Clear overlays
function clearOverlays() {
  overlaySeries.forEach((s) => {
    try {
      chart.removeSeries(s);
    } catch (_) {}
  });
  overlaySeries = [];
}

// Draw overlays
function draw(result, candles) {
  if (!chart || !LightweightCharts) return;

  clearOverlays();

  // 1. Levels of Interest
  const lastLvl = result.levelsHistory?.at(-1);
  if (lastLvl) {
    try {
      const topLine = chart.addLineSeries({ color: "#2a46ff", lineWidth: 2 });
      const botLine = chart.addLineSeries({ color: "#2a46ff", lineWidth: 2 });

      topLine.setData([
        { time: candles[0].time, value: lastLvl.curr_level_top },
        { time: candles.at(-1).time, value: lastLvl.curr_level_top },
      ]);
      botLine.setData([
        { time: candles[0].time, value: lastLvl.curr_level_bot },
        { time: candles.at(-1).time, value: lastLvl.curr_level_bot },
      ]);
      overlaySeries.push(topLine, botLine);
    } catch (err) {
      console.warn("Could not draw levels:", err);
    }
  }

  // 2. Entry Zones
  result.events
    ?.filter((e) => e.type.includes("entry_zone"))
    .forEach((e) => {
      if (e.box) {
        try {
          const top = chart.addLineSeries({ color: "yellow", lineWidth: 2 });
          const bot = chart.addLineSeries({ color: "yellow", lineWidth: 2 });

          top.setData([
            { time: candles[e.box.leftIndex].time, value: e.box.top },
            {
              time: candles[Math.min(e.box.rightIndex, candles.length - 1)]
                .time,
              value: e.box.top,
            },
          ]);
          bot.setData([
            { time: candles[e.box.leftIndex].time, value: e.box.bottom },
            {
              time: candles[Math.min(e.box.rightIndex, candles.length - 1)]
                .time,
              value: e.box.bottom,
            },
          ]);
          overlaySeries.push(top, bot);
        } catch (err) {
          console.warn("Could not draw entry zone:", err);
        }
      }
    });

  // 3. Open Position
  if (result.openPosition) {
    const pos = result.openPosition;
    const levels = [
      { value: pos.entry, color: "lime" },
      { value: pos.sl, color: "red" },
      { value: pos.tp1, color: "blue" },
      { value: pos.tp2, color: "orange" },
    ];
    levels.forEach((lvl) => {
      try {
        const line = chart.addLineSeries({ color: lvl.color, lineWidth: 2 });
        line.setData([
          { time: candles[pos.openedBar].time, value: lvl.value },
          { time: candles.at(-1).time, value: lvl.value },
        ]);
        overlaySeries.push(line);
      } catch (err) {
        console.warn("Could not draw position level:", err);
      }
    });
  }
}

async function initializeChart() {
  try {
    // Dynamic import to ensure proper loading
    LightweightCharts = await import("lightweight-charts");

    if (!chartContainer.value) {
      console.error("Chart container not found");
      return;
    }

    // Wait for next tick to ensure DOM is ready
    await nextTick();

    // Validate container has proper dimensions
    const rect = chartContainer.value.getBoundingClientRect();
    const width = Math.max(400, rect.width || 600);
    const height = Math.max(300, rect.height || 400);

    // Create chart with validated dimensions
    chart = LightweightCharts.createChart(chartContainer.value, {
      width: width,
      height: height,
      layout: {
        background: { type: "solid", color: "#ffffff" },
        textColor: "#333333",
      },
      grid: {
        vertLines: { color: "#f0f0f0" },
        horzLines: { color: "#f0f0f0" },
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
      },
    });

    // Add candlestick series
    candleSeries = chart.addCandlestickSeries({
      upColor: "#26a69a",
      downColor: "#ef5350",
      borderVisible: false,
      wickUpColor: "#26a69a",
      wickDownColor: "#ef5350",
    });

    console.log("Chart initialized successfully");

    // Load initial data if available
    if (props.candles && props.candles.length > 0) {
      updateChartData(props.candles);
    }
  } catch (error) {
    console.error("Failed to initialize chart:", error);

    // Fallback: Create a simple HTML canvas chart
    createFallbackChart();
  }
}

// Fallback chart using HTML5 Canvas
function createFallbackChart() {
  if (!chartContainer.value) return;

  chartContainer.value.innerHTML = `
    <canvas id="fallback-chart" width="600" height="400" style="border: 1px solid #ccc;">
      Chart initialization failed. Please check your lightweight-charts installation.
    </canvas>
  `;

  console.warn("Using fallback chart display");
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

onMounted(async () => {
  await initializeChart();
});

// Watch updates
watch(
  () => props.candles,
  (newCandles) => {
    updateChartData(newCandles);
  },
  { deep: true }
);
</script>

<template>
  <div class="chart-wrapper">
    <h3>Gold Levels Chart</h3>
    <div class="chart-container">
      <div ref="chartContainer" class="chart-element"></div>
    </div>
  </div>
</template>

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

.chart-element {
  width: 100%;
  height: 100%;
  min-width: 400px;
  min-height: 300px;
}

#fallback-chart {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f9f9f9;
  color: #666;
  font-family: Arial, sans-serif;
}
</style>
