<template>
  <div ref="chartContainer" class="w-full h-[600px]"></div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from "vue";
import { createChart } from "lightweight-charts";

// Props
const props = defineProps({
  candles: { type: Array, required: true }, // [{time, open, high, low, close, volume}]
  settings: { type: Object, default: () => ({}) },
});

const chartContainer = ref(null);
let chart;
let series = {};

onMounted(() => {
  chart = createChart(chartContainer.value, {
    layout: { background: { color: "#111" }, textColor: "white" },
    grid: { vertLines: { color: "#333" }, horzLines: { color: "#333" } },
    crosshair: { mode: 1 },
    timeScale: { borderVisible: false },
    rightPriceScale: { borderVisible: false },
  });

  // Base candles
  series.candle = chart.addCandlestickSeries();
  series.candle.setData(props.candles);

  // Indicators
  drawWolfX(props.candles);
});

onBeforeUnmount(() => {
  chart.remove();
});

// =============== INDICATORS ===================

// ATR Volatility Stop
function drawVolatilityStop(candles, atrPeriod = 14, factor = 2) {
  const atr = calcATR(candles, atrPeriod);
  let stop = [];
  let long = true;
  for (let i = 0; i < candles.length; i++) {
    if (!atr[i]) continue;
    const close = candles[i].close;
    const prevStop = stop[i - 1] ?? close;
    const calcStop = long
      ? Math.max(prevStop, close - factor * atr[i])
      : Math.min(prevStop, close + factor * atr[i]);
    long = close > prevStop;
    stop.push(calcStop);
  }
  series.volStop = chart.addLineSeries({
    color: "orange",
    lineWidth: 2,
  });
  series.volStop.setData(
    candles.map((c, i) => ({ time: c.time, value: stop[i] || c.close }))
  );
}

// T3 Bands (simplified EMA version)
function drawT3Bands(candles) {
  const closes = candles.map((c) => c.close);
  const ma5 = ema(closes, 5);
  const ma10 = ema(closes, 10);

  series.ma5 = chart.addLineSeries({ color: "#00bfff", lineWidth: 2 });
  series.ma10 = chart.addLineSeries({ color: "#ff69b4", lineWidth: 2 });

  series.ma5.setData(candles.map((c, i) => ({ time: c.time, value: ma5[i] })));
  series.ma10.setData(
    candles.map((c, i) => ({ time: c.time, value: ma10[i] }))
  );
}

// Parabolic SAR (basic version)
function drawParabolicSAR(candles, step = 0.02, maxStep = 0.2) {
  let sar = [];
  let long = true;
  let ep = candles[0].low;
  let af = step;
  let psar = candles[0].low;

  for (let i = 1; i < candles.length; i++) {
    psar = psar + af * (ep - psar);
    if (long) {
      if (candles[i].high > ep)
        (ep = candles[i].high), (af = Math.min(af + step, maxStep));
      if (candles[i].low < psar)
        (long = false), (psar = ep), (ep = candles[i].low), (af = step);
    } else {
      if (candles[i].low < ep)
        (ep = candles[i].low), (af = Math.min(af + step, maxStep));
      if (candles[i].high > psar)
        (long = true), (psar = ep), (ep = candles[i].high), (af = step);
    }
    sar.push(psar);
  }

  series.psar = chart.addLineSeries({
    color: "white",
    lineWidth: 1,
    lineStyle: 1,
  });
  series.psar.setData(
    candles.map((c, i) => ({ time: c.time, value: sar[i] || c.close }))
  );
}

// TSI Momentum Dots
function drawTSI(candles, short = 13, long = 25, signal = 7) {
  const closes = candles.map((c) => c.close);
  let mom = closes.map((c, i) => (i ? c - closes[i - 1] : 0));
  let absMom = mom.map((m) => Math.abs(m));
  const emaMom = ema(ema(mom, short), long);
  const emaAbs = ema(ema(absMom, short), long);
  const tsi = emaMom.map((m, i) => (emaAbs[i] ? (m / emaAbs[i]) * 100 : 0));

  series.tsi = chart.addLineSeries({
    color: "lime",
    lineWidth: 1,
  });
  series.tsi.setData(candles.map((c, i) => ({ time: c.time, value: tsi[i] })));
}

// Pivot-based Support & Resistance (basic)
function drawSupportResistance(candles, lookback = 10) {
  let levels = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    let high = candles[i].high;
    let low = candles[i].low;
    let isHigh = true;
    let isLow = true;
    for (let j = 1; j <= lookback; j++) {
      if (candles[i - j].high >= high || candles[i + j].high >= high)
        isHigh = false;
      if (candles[i - j].low <= low || candles[i + j].low <= low) isLow = false;
    }
    if (isHigh) levels.push({ price: high, type: "res" });
    if (isLow) levels.push({ price: low, type: "sup" });
  }

  levels.forEach((lvl) => {
    const line = chart.addLineSeries({
      color: lvl.type === "sup" ? "green" : "red",
      lineWidth: 1,
    });
    line.setData(candles.map((c) => ({ time: c.time, value: lvl.price })));
  });
}

// Volume Profile Histogram (approximation)
function drawVolumeProfile(candles, bins = 20) {
  const min = Math.min(...candles.map((c) => c.low));
  const max = Math.max(...candles.map((c) => c.high));
  const step = (max - min) / bins;
  let volBins = Array(bins).fill(0);

  candles.forEach((c) => {
    const idx = Math.floor((c.close - min) / step);
    volBins[Math.min(idx, bins - 1)] += c.volume;
  });

  // Draw as horizontal lines
  volBins.forEach((v, i) => {
    const price = min + i * step;
    const line = chart.addLineSeries({
      color: "rgba(255,255,0,0.3)",
      lineWidth: Math.max(1, Math.log(v + 1)),
    });
    line.setData(candles.map((c) => ({ time: c.time, value: price })));
  });
}

// ============= UTILS ==================
function ema(data, period) {
  let k = 2 / (period + 1);
  let emaArr = [];
  let prev;
  data.forEach((v, i) => {
    prev = i === 0 ? v : (v - prev) * k + prev;
    emaArr.push(prev);
  });
  return emaArr;
}

function calcATR(candles, period) {
  let trs = [];
  for (let i = 1; i < candles.length; i++) {
    const h = candles[i].high;
    const l = candles[i].low;
    const pc = candles[i - 1].close;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  return ema(trs, period);
}

// ============ MAIN DRIVER =============
function drawWolfX(candles) {
  drawT3Bands(candles);
  drawVolatilityStop(candles);
  drawParabolicSAR(candles);
  drawTSI(candles);
  drawSupportResistance(candles);
  drawVolumeProfile(candles);
}
</script>

<style>
/* Optional styling */
</style>
