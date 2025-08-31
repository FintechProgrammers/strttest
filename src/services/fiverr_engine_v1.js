/**
 * Backend conversion of fiverr_clo1188_gold_v1 Pine script
 * - Input: array of candles [{open, high, low, close, time?}, ...]
 * - Output: { positionsClosed: [], openPosition (if any), levelsHistory: [...], events: [...] }
 *s
 */

function priceToPips(val, pipSize) {
    return val / pipSize;
}

function pipsToPrice(val, pipSize) {
    return val * pipSize;
}

/**
 * Build level arrays (up and down) based on a price
 * Mirrors process_levels(price, pips, n_levels) in Pine
 */
function processLevels(price, pips, nLevels, pipSize) {
    const arrLevelsUp = [];
    const arrLevelsDn = [];
    const levelSizeInPrice = pipsToPrice(pips, pipSize);

    // Pine Script: base_level := int(price - (price % level_size_in_price))
    // For positive prices, this is equivalent to Math.floor
    const baseLevel = Math.floor(price / levelSizeInPrice) * levelSizeInPrice;

    for (let i = nLevels - 1; i >= 0; i--) {
        const upLvl = baseLevel + (i + 1) * levelSizeInPrice;
        const dnLvl = baseLevel - i * levelSizeInPrice;
        arrLevelsUp.push(upLvl);
        arrLevelsDn.push(dnLvl);
    }

    // Sort as in Pine: arr_levels_up.sort(order.ascending) and arr_levels_dn.sort(order.descending)
    arrLevelsUp.sort((a, b) => a - b);
    arrLevelsDn.sort((a, b) => b - a);

    return { up: arrLevelsUp, dn: arrLevelsDn, levelSizeInPrice };
}

/**
 * Main engine 
 */
function runEngine(candles, settings = {}) {
    const s = Object.assign(
        {
            pipSize: 0.01,
            levelPips: 500,
            nLevels: 4,
            levelStartIndex: 200,
            entryZonePips: 50,
            zoneNoBars: 40,
            closeBelowEntryZone: true,
            slPips: 150,
            tp1Pips: 150,
            tp2Pips: 300,
            showPosPrice: true,
            showHistPos: true,
            showAllLevel: true,
            showLevelOfInterest: true,
            showDebug: false,
        },
        settings
    );

    // State variables
    let pos = 0; // Current position: 0=none, 1=long, -1=short
    let pos_prev = 0; // Previous bar position (pos[1])
    let en = null,
        sl = null,
        tp1 = null,
        tp2 = null;
    let tp1_reached = false,
        tp2_reached = false;
    let entry_zone_active = 0; // 0=none, 1=long-activated, -1=short-activated

    // Active level tracking with proper [1] and [0] indexing
    let active_level_curr = null; // active_level[0]
    let active_level_prev = null; // active_level[1]

    // Entry zone management
    let box_entry_zone = null;
    let entry_zone_top = null;
    let entry_zone_bot = null;
    let zone_created_bar = null;

    const positionsClosed = [];
    const events = [];
    const levelsHistory = [];

    let openedBarIndex = null;
    let openedCandleSnapshot = null;

    // Helper function to close position
    function closePosition(reason, closedAtBarIndex, closedCandle) {
        if (pos === 0) return;

        const closed = {
            type: pos === 1 ? "LONG" : "SHORT",
            entry: en,
            sl,
            tp1,
            tp2,
            openedBar: openedBarIndex,
            closedBar: closedAtBarIndex,
            reason,
            openedAtCandle: openedCandleSnapshot,
            closedAtCandle: closedCandle,
            tp1_reached,
            tp2_reached,
        };
        positionsClosed.push(closed);

        // Reset all position-related state
        pos = 0;
        en = sl = tp1 = tp2 = null;
        tp1_reached = false;
        tp2_reached = false;
        entry_zone_active = 0;
        box_entry_zone = null;
        entry_zone_top = null;
        entry_zone_bot = null;
        zone_created_bar = null;
        openedBarIndex = null;
        openedCandleSnapshot = null;
    }

    // Main processing loop
    for (let i = 0; i < candles.length; i++) {
        const c = candles[i];
        const c_prev = i > 0 ? candles[i - 1] : null;
        const { open, close, high, low } = c;
        const bar_up = close >= open;
        const bar_up_prev = c_prev ? c_prev.close >= c_prev.open : false;

        // Update position tracking
        pos_prev = i > 0 ? pos : 0;

        // Calculate levels for current bar
        const { up: arr_levels_up, dn: arr_levels_dn } = processLevels(
            close,
            s.levelPips,
            s.nLevels,
            s.pipSize
        );

        const curr_level_top = arr_levels_up.length > 0 ? arr_levels_up[0] : null;
        const curr_level_bot = arr_levels_dn.length > 0 ? arr_levels_dn[0] : null;

        levelsHistory.push({
            barIndex: i,
            curr_level_top,
            curr_level_bot,
            active_level: active_level_curr,
        });

        // Update active_level history (shift [0] to [1])
        active_level_prev = active_level_curr;
        active_level_curr = null;

        // Active level detection (exact Pine Script logic)
        if (open > curr_level_top && close < curr_level_top) {
            active_level_curr = curr_level_top;
        } else if (open < curr_level_bot && close > curr_level_bot) {
            active_level_curr = curr_level_bot;
        } else if (open < curr_level_bot && close > curr_level_top) {
            active_level_curr = curr_level_top;
        } else if (open > curr_level_top && close < curr_level_bot) {
            active_level_curr = curr_level_bot;
        }

        // Check TP/SL hits BEFORE processing new setups (like Pine Script)
        if (pos !== 0) {
            // TP1/TP2 detection
            if (!tp1_reached && c_prev) {
                if (pos > 0 && c_prev.close < tp1 && high >= tp1) {
                    tp1_reached = true;
                    events.push({ type: "tp1_reached", bar: i, tp: tp1 });
                } else if (pos < 0 && c_prev.close > tp1 && low <= tp1) {
                    tp1_reached = true;
                    events.push({ type: "tp1_reached", bar: i, tp: tp1 });
                }
            }
            if (!tp2_reached && c_prev) {
                if (pos > 0 && c_prev.close < tp2 && high >= tp2) {
                    tp2_reached = true;
                    events.push({ type: "tp2_reached", bar: i, tp: tp2 });
                } else if (pos < 0 && c_prev.close > tp2 && low <= tp2) {
                    tp2_reached = true;
                    events.push({ type: "tp2_reached", bar: i, tp: tp2 });
                }
            }

            // Position closing conditions
            if (
                (pos > 0 && (low <= sl || high >= tp2)) ||
                (pos < 0 && (high >= sl || low <= tp2))
            ) {
                let reason = "STOPLOSS";
                if (pos > 0 && high >= tp2) reason = "TP2";
                if (pos < 0 && low <= tp2) reason = "TP2";

                events.push({
                    type: "position_closed",
                    bar: i,
                    reason,
                    entry: en,
                    sl,
                    tp1,
                    tp2,
                });
                closePosition(reason, i, c);
            }
        }

        // Entry zone creation: pos == 0 and not na(active_level)
        if (pos === 0 && active_level_curr !== null) {
            // Close any existing entry zone
            if (box_entry_zone !== null) {
                events.push({
                    type: "entry_zone_removed",
                    bar: i,
                    box: box_entry_zone,
                });
            }

            // Create new entry zone
            entry_zone_top =
                active_level_curr + pipsToPrice(s.entryZonePips, s.pipSize);
            entry_zone_bot =
                active_level_curr - pipsToPrice(s.entryZonePips, s.pipSize);
            box_entry_zone = {
                leftIndex: i,
                rightIndex: i + s.zoneNoBars,
                top: entry_zone_top,
                bottom: entry_zone_bot,
                createdBar: i,
                active_level: active_level_curr,
            };
            zone_created_bar = i;
            entry_zone_active = 0;

            events.push({
                type: "entry_zone_created",
                bar: i,
                box: box_entry_zone,
                active_level: active_level_curr,
            });
        }

        // Entry zone activation logic
        // Pine condition: pos==0 and entry_zone_active==0 and not na(active_level[1]) and na(active_level[0])
        if (
            pos === 0 &&
            entry_zone_active === 0 &&
            active_level_prev !== null &&
            active_level_curr === null &&
            box_entry_zone !== null &&
            c_prev
        ) {
            // Long zone activation
            if (
                bar_up_prev &&
                c_prev.close > active_level_prev &&
                close > entry_zone_top
            ) {
                entry_zone_active = 1;
                events.push({
                    type: "entry_zone_activated_long",
                    bar: i,
                    box: box_entry_zone,
                    prev_close: c_prev.close,
                    prev_active_level: active_level_prev,
                });
            }
            // Short zone activation
            else if (
                !bar_up_prev &&
                c_prev.close < active_level_prev &&
                close < entry_zone_bot
            ) {
                entry_zone_active = -1;
                events.push({
                    type: "entry_zone_activated_short",
                    bar: i,
                    box: box_entry_zone,
                    prev_close: c_prev.close,
                    prev_active_level: active_level_prev,
                });
            } else {
                // Zone activation failed - remove zone
                events.push({
                    type: "entry_zone_activation_failed",
                    bar: i,
                    box: box_entry_zone,
                });
                box_entry_zone = null;
                entry_zone_top = null;
                entry_zone_bot = null;
                entry_zone_active = 0;
            }
        }

        // Position activation logic (CORRECTED)
        // Pine condition: pos==0 and na(active_level[1]) and na(active_level[0]) and not na(box_entry_zone)
        if (
            pos === 0 &&
            active_level_prev === null &&
            active_level_curr === null &&
            box_entry_zone !== null &&
            entry_zone_active !== 0
        ) {
            // Long position activation
            if (
                entry_zone_active > 0 &&
                low <= entry_zone_top &&
                (s.closeBelowEntryZone ? close > entry_zone_top : low <= entry_zone_top)
            ) {
                pos = 1;
                en = entry_zone_top;
                sl = en - pipsToPrice(s.slPips, s.pipSize);
                tp1 = en + pipsToPrice(s.tp1Pips, s.pipSize);
                tp2 = en + pipsToPrice(s.tp2Pips, s.pipSize);
                openedBarIndex = i;
                openedCandleSnapshot = { ...c };

                events.push({
                    type: "position_opened_long",
                    bar: i,
                    entry: en,
                    sl,
                    tp1,
                    tp2,
                    trigger_price: entry_zone_top,
                    condition_met: s.closeBelowEntryZone
                        ? `close(${close}) > entry_zone_top(${entry_zone_top})`
                        : `low(${low}) <= entry_zone_top(${entry_zone_top})`,
                });
            }
            // Short position activation
            else if (
                entry_zone_active < 0 &&
                high >= entry_zone_bot &&
                (s.closeBelowEntryZone
                    ? close < entry_zone_bot
                    : high >= entry_zone_bot)
            ) {
                pos = -1;
                en = entry_zone_bot;
                sl = en + pipsToPrice(s.slPips, s.pipSize);
                tp1 = en - pipsToPrice(s.tp1Pips, s.pipSize);
                tp2 = en - pipsToPrice(s.tp2Pips, s.pipSize);
                openedBarIndex = i;
                openedCandleSnapshot = { ...c };

                events.push({
                    type: "position_opened_short",
                    bar: i,
                    entry: en,
                    sl,
                    tp1,
                    tp2,
                    trigger_price: entry_zone_bot,
                    condition_met: s.closeBelowEntryZone
                        ? `close(${close}) < entry_zone_bot(${entry_zone_bot})`
                        : `high(${high}) >= entry_zone_bot(${entry_zone_bot})`,
                });
            }
        }

        // Clean up expired entry zones
        if (
            box_entry_zone !== null &&
            zone_created_bar !== null &&
            i - zone_created_bar >= s.zoneNoBars &&
            pos === 0
        ) {
            events.push({ type: "entry_zone_expired", bar: i, box: box_entry_zone });
            box_entry_zone = null;
            entry_zone_top = null;
            entry_zone_bot = null;
            entry_zone_active = 0;
            zone_created_bar = null;
        }
    }

    // Return open position if any
    const openPosition =
        pos !== 0
            ? {
                type: pos === 1 ? "LONG" : "SHORT",
                entry: en,
                sl,
                tp1,
                tp2,
                openedBar: openedBarIndex,
                openedAtCandle: openedCandleSnapshot,
                tp1_reached,
                tp2_reached,
            }
            : null;

    return {
        positionsClosed,
        openPosition,
        levelsHistory,
        events,
        settings: s,
    };
}

// Test function to validate with sample data
function testEngine() {
    // Sample candle data for testing
    const testCandles = [
        { open: 2000.0, high: 2005.0, low: 1995.0, close: 2003.0 },
        { open: 2003.0, high: 2010.0, low: 2000.0, close: 2007.0 },
        { open: 2007.0, high: 2015.0, low: 2005.0, close: 2012.0 },
        { open: 2012.0, high: 2020.0, low: 2010.0, close: 2018.0 },
        { open: 2018.0, high: 2025.0, low: 2015.0, close: 2022.0 },
    ];

    const result = runEngine(testCandles, {
        pipSize: 0.01,
        levelPips: 500,
        nLevels: 4,
        entryZonePips: 50,
        zoneNoBars: 40,
        closeBelowEntryZone: true,
        slPips: 150,
        tp1Pips: 150,
        tp2Pips: 300,
        showDebug: true,
    });

    console.log("Test Results:");
    console.log("Positions Closed:", result.positionsClosed.length);
    console.log("Open Position:", result.openPosition);
    console.log("Events:", result.events.length);
    console.log("Levels History:", result.levelsHistory.length);

    return result;
}

// Export for module usage
export { runEngine, processLevels, pipsToPrice, priceToPips, testEngine };
