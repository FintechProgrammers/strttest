/**
 * Golden Era [Jifu] — Pine v5 ➜ JS engine (pattern-matched to your fiverr_engine_v1.js)
 *
 * Input candles: [{ time, open, high, low, close }, ...] (time optional)
 * Returns:
 * {
 *   positionsClosed: [],
 *   openPosition: null | { side, entry, sl, tp1, tp2, entryBar, entryTime },
 *   levelsHistory: [], // boxes/zones
 *   events: []         // timeline of signals
 * }
 */

function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
}

// ============================
// Math helpers (Pine f_math_*)
// ============================

function toIntTowardZero(x) {
    // Pine int() truncates toward 0
    return x < 0 ? Math.ceil(x) : Math.floor(x);
}

function firstMultipleUp(num, step) {
    const ni = toIntTowardZero(num);
    const rem = ((ni % step) + step) % step;
    return ni + (step - rem === step ? 0 : step - rem);
}

function firstMultipleDown(num, step) {
    const ni = toIntTowardZero(num);
    const rem = ((ni % step) + step) % step;
    return ni - rem;
}

function nearestMultiple(num, step) {
    const smaller = firstMultipleDown(num, step);
    const larger = firstMultipleUp(num, step);
    return (num - smaller > larger - num) ? larger : smaller;
}

// ===================================
// Zone check (Pine f_strat_check_zone)
// ===================================

function checkZone(start, end, PSYC_STEP, BOX_STEP) {
    // Compute the nearest (by close) psychological level box,
    // and neighbors above/below for pierce checks.
    const nearestEnd = nearestMultiple(end, PSYC_STEP);
    const nearestEndTop = nearestEnd + BOX_STEP;
    const nearestEndBot = nearestEnd - BOX_STEP;

    const nearestUp = firstMultipleUp(end, PSYC_STEP);
    const nearestUpTop = nearestUp + BOX_STEP;
    const nearestUpBot = nearestUp - BOX_STEP;

    const nearestDwn = firstMultipleDown(end, PSYC_STEP);
    const nearestDwnTop = nearestDwn + BOX_STEP;
    const nearestDwnBot = nearestDwn - BOX_STEP;

    let is_closed_in_box = false;
    let is_pierced_up = false;
    let is_pierced_dwn = false;
    let mid_price = NaN;

    // Closed inside box around nearestEnd
    if (end >= nearestEndBot && end <= nearestEndTop) {
        is_closed_in_box = true;
        mid_price = nearestEnd;
    } else {
        // Pierced logic depends on direction of the candle body (open->close)
        if (end >= start) {
            // Upward movement: cross the top of the LOWER box (nearestDwnTop)
            if (start <= nearestDwnTop && end >= nearestDwnTop) {
                is_pierced_up = true;
                mid_price = nearestDwn;
            }
        } else {
            // Downward movement: cross the bottom of the UPPER box (nearestUpBot)
            if (start >= nearestUpBot && end <= nearestUpBot) {
                is_pierced_dwn = true;
                mid_price = nearestUp;
            }
        }
    }

    return { is_closed_in_box, is_pierced_up, is_pierced_dwn, mid_price };
}

// ==========================================
// Core engine (mirrors your first JS layout)
// ==========================================

function runEngine(candles, settings = {}) {
    // Defaults from Pine, overridable via settings
    const cfg = Object.assign(
        {
            PSYC_STEP: 5,     // STRAT_PSYC_STEP
            BOX_STEP: 0.5,    // STRAT_BOX_STEP
            SL_STEP: 1.5,     // STRAT_SL_STEP
            TP1_STEP: 1.5,    // STRAT_TP_1_STEP
            TP2_STEP: 3,      // STRAT_TP_2_STEP
            showDebug: false,
        },
        settings
    );

    // ==============
    // Engine outputs
    // ==============
    const positionsClosed = [];
    const events = [];
    const levelsHistory = []; // zones history (box snapshots)

    // =================
    // Strategy "object"
    // =================
    const state = {
        // Box/zone
        isBoxFormed: false,
        isBroken: false,
        isBull: null, // true/false, null when not defined
        isTouched: false, // touched "zone of action" line

        // Trade
        isInTrade: false,

        // Zone prices
        mid: NaN,
        top: NaN,
        bot: NaN,

        // Exits (prices)
        action: NaN, // zone of action (top if bull, bot if bear)
        tp1: NaN,
        tp2: NaN,
        sl: NaN,

        // bookkeeping
        entryPrice: NaN,
        entryBar: null,
        entryTime: null,
    };

    // Previous bar snapshot (to emulate Pine's [...][1])
    let prev = null;

    function snapshot() {
        return JSON.parse(JSON.stringify(state));
    }

    function recordZoneEvent(type, i, c, extra = {}) {
        events.push({
            type,
            bar: i,
            time: c?.time ?? null,
            isBull: state.isBull,
            mid: state.mid,
            top: state.top,
            bot: state.bot,
            ...extra,
        });
    }

    function createZone(bull /* true/false/null */, broken, mid, i, c) {
        // Delete old “exits” visuals in Pine — here we just reset fields.
        state.isInTrade = false;

        state.isBoxFormed = true;
        state.isBroken = !!broken;
        state.isBull = bull === null ? null : !!bull;
        state.isTouched = false;

        state.mid = mid;
        state.top = mid + cfg.BOX_STEP;
        state.bot = mid - cfg.BOX_STEP;

        // record history
        levelsHistory.push({
            bar: i,
            time: c?.time ?? null,
            mid: state.mid,
            top: state.top,
            bot: state.bot,
            isBroken: state.isBroken,
            isBull: state.isBull,
            event: "box_created_or_moved",
        });

        recordZoneEvent(
            "box_formed",
            i,
            c,
            { broken: state.isBroken, bull: state.isBull }
        );
    }

    function processBreak(bull, i, c) {
        state.isBull = !!bull;
        state.isBroken = true;
        recordZoneEvent(bull ? "box_broken_bull" : "box_broken_bear", i, c);
    }

    function processInvalidateWait(i, c) {
        state.isBroken = false;
        recordZoneEvent("box_retest", i, c);
    }

    function processInvalidateReverse(i, c) {
        state.isBroken = false;
        recordZoneEvent("box_reverse_invalidated", i, c);
    }

    function setTargetsFromZone() {
        const action = state.isBull ? state.top : state.bot;
        const tp1 = state.isBull ? action + cfg.TP1_STEP : action - cfg.TP1_STEP;
        const tp2 = state.isBull ? action + cfg.TP2_STEP : action - cfg.TP2_STEP;
        const sl = state.isBull ? action - cfg.SL_STEP : action + cfg.SL_STEP;

        state.action = action;
        state.tp1 = tp1;
        state.tp2 = tp2;
        state.sl = sl;
    }

    function enterTrade(entryPrice, i, c) {
        setTargetsFromZone();
        state.isInTrade = true;
        state.entryPrice = entryPrice;
        state.entryBar = i;
        state.entryTime = c?.time ?? null;

        recordZoneEvent(
            state.isBull ? "entry_long" : "entry_short",
            i,
            c,
            {
                entry: entryPrice,
                sl: state.sl,
                tp1: state.tp1,
                tp2: state.tp2,
            }
        );
    }

    function closeTrade(reason, exitPrice, i, c) {
        if (state.isInTrade) {
            positionsClosed.push({
                side: state.isBull ? "long" : "short",
                entry: state.entryPrice,
                sl: state.sl,
                tp1: state.tp1,
                tp2: state.tp2,
                entryBar: state.entryBar,
                entryTime: state.entryTime,
                exitBar: i,
                exitTime: c?.time ?? null,
                exitPrice,
                exitReason: reason,
            });
        }

        // Pine f_strat_close_trade
        state.isInTrade = false;
        state.isBoxFormed = false;
        state.isBull = null;
        state.isBroken = false;
        state.isTouched = false;
        state.mid = NaN;
        state.top = NaN;
        state.bot = NaN;
        state.action = NaN;
        state.tp1 = NaN;
        state.tp2 = NaN;
        state.sl = NaN;
        state.entryPrice = NaN;
        state.entryBar = null;
        state.entryTime = null;
    }

    // =================
    // Main bar-by-bar
    // =================
    for (let i = 0; i < candles.length; i++) {
        const c = candles[i];
        const cPrev = i > 0 ? candles[i - 1] : null;

        // Compute zone status for this bar (Pine uses open/close of THIS bar)
        const { is_closed_in_box, is_pierced_up, is_pierced_dwn, mid_price } =
            checkZone(c.open, c.close, cfg.PSYC_STEP, cfg.BOX_STEP);

        // Flags matching Pine locals
        let shouldCreateBox = false;
        let shouldMoveBox = false;
        let newBull = null;
        let newBroken = false;
        let cameBack = false;
        let exitThisBar = false;
        let slRebox = false;

        // ======================
        // NOT in trade (arming)
        // ======================
        if (!state.isInTrade) {
            if (state.isBoxFormed) {
                // If the nearest psyc mid changed vs the box mid, Pine may move the box (if closed-in or pierced)
                if (!Number.isNaN(state.mid) && state.mid !== mid_price) {
                    if (is_closed_in_box) {
                        shouldMoveBox = true;
                        newBull = null;
                        newBroken = false;
                    } else if (is_pierced_up) {
                        shouldMoveBox = true;
                        newBull = true;
                        newBroken = true;
                    } else if (is_pierced_dwn) {
                        shouldMoveBox = true;
                        newBull = false;
                        newBroken = true;
                    }
                }

                if (shouldMoveBox) {
                    createZone(newBull, newBroken, mid_price, i, c);
                } else {
                    // If the box exists and is NOT broken, wait for a close beyond top/bot to BREAK it
                    if (!state.isBroken) {
                        if (c.close > state.top) {
                            processBreak(true, i, c); // bullish break
                        }
                        if (c.close < state.bot) {
                            processBreak(false, i, c); // bearish break
                        }
                    } else {
                        // Box already broken (waiting for "second candle" or invalidations)
                        // If this bar closed inside the SAME box -> retest/invalidate-wait
                        if (is_closed_in_box && state.mid === mid_price) {
                            processInvalidateWait(i, c);
                            cameBack = true;
                        } else if (state.isBull && c.close < state.bot) {
                            // reversed to down side before second candle formed
                            processInvalidateReverse(i, c);
                            cameBack = true;
                        } else if (!state.isBull && c.close > state.top) {
                            // reversed to up side before second candle formed
                            processInvalidateReverse(i, c);
                            cameBack = true;
                        }

                        // If not invalidated and the "second candle" closes past mid in break direction -> enter
                        if (!cameBack) {
                            if (state.isBull && c.close > state.mid) {
                                enterTrade(c.close, i, c);
                            } else if (!state.isBull && c.close < state.mid) {
                                enterTrade(c.close, i, c);
                            }
                        }
                    }
                }
            } else {
                // No box formed yet — create when we close inside a box OR pierce a neighbor
                if (is_closed_in_box) {
                    shouldCreateBox = true;
                    newBull = null;
                    newBroken = false;
                } else if (is_pierced_up) {
                    shouldCreateBox = true;
                    newBull = true;
                    newBroken = true;
                } else if (is_pierced_dwn) {
                    shouldCreateBox = true;
                    newBull = false;
                    newBroken = true;
                }

                if (shouldCreateBox) {
                    createZone(newBull, newBroken, mid_price, i, c);
                }
            }
        }
        // ==================
        // IN trade (manage)
        // ==================
        else {
            // Keep the "visuals" synced like Pine does; here that just means: box right edge would move — no-op for us.

            // Exit checks — same priority style as your first JS (SL/TP2 full exit, TP1 exit)
            if (state.isBull) {
                // SL if low <= sl
                if (c.low <= state.sl) {
                    recordZoneEvent("sl_hit", i, c, { sl: state.sl });
                    exitThisBar = true;

                    // If the bar CLOSES below SL, prepare re-box opposite
                    if (c.close < state.sl) slRebox = true;
                } else if (c.high >= state.tp2) {
                    // TP2 full exit
                    recordZoneEvent("tp2_hit", i, c, { tp2: state.tp2 });
                    exitThisBar = true;
                } else {
                    // Touch action line once
                    if (!state.isTouched && c.low <= state.top) {
                        state.isTouched = true;
                        recordZoneEvent("touched", i, c, { action: state.top });
                    }
                    // TP1 exit
                    if (state.isTouched && c.high >= state.tp1) {
                        recordZoneEvent("tp1_hit", i, c, { tp1: state.tp1 });
                        exitThisBar = true;
                    }
                }
            } else {
                // SHORT side
                if (c.high >= state.sl) {
                    recordZoneEvent("sl_hit", i, c, { sl: state.sl });
                    exitThisBar = true;

                    // If the bar CLOSES above SL, prepare re-box opposite
                    if (c.close > state.sl) slRebox = true;
                } else if (c.low <= state.tp2) {
                    recordZoneEvent("tp2_hit", i, c, { tp2: state.tp2 });
                    exitThisBar = true;
                } else {
                    if (!state.isTouched && c.high >= state.bot) {
                        state.isTouched = true;
                        recordZoneEvent("touched", i, c, { action: state.bot });
                    }
                    if (state.isTouched && c.low <= state.tp1) {
                        recordZoneEvent("tp1_hit", i, c, { tp1: state.tp1 });
                        exitThisBar = true;
                    }
                }
            }

            if (exitThisBar) {
                const reason =
                    events.length && ["tp1_hit", "tp2_hit", "sl_hit"].includes(events[events.length - 1].type)
                        ? events[events.length - 1].type.toUpperCase()
                        : "EXIT";
                const exitPrice =
                    reason === "SL_HIT" ? state.sl :
                        reason === "TP2_HIT" ? state.tp2 :
                            reason === "TP1_HIT" ? state.tp1 :
                                (state.isBull ? (c.low <= state.sl ? state.sl : (c.high >= state.tp2 ? state.tp2 : state.tp1))
                                    : (c.high >= state.sl ? state.sl : (c.low <= state.tp2 ? state.tp2 : state.tp1)));

                closeTrade(reason, exitPrice, i, c);
            }

            // SL “re-box” (Pine creates new opposite broken box at previous mid)
            if (slRebox && prev) {
                // prev.isBull was the side before closeTrade()
                const newSideIsBull = !prev.isBull;
                const prevMid = prev.mid;
                createZone(newSideIsBull, true, prevMid, i, c);
                recordZoneEvent("sl_rebox_created", i, c, { bull: newSideIsBull, mid: prevMid });
            }
        }

        // Save snapshot for [1] refs next bar
        prev = snapshot();
    }

    const openPosition = state.isInTrade
        ? {
            side: state.isBull ? "long" : "short",
            entry: state.entryPrice,
            sl: state.sl,
            tp1: state.tp1,
            tp2: state.tp2,
            entryBar: state.entryBar,
            entryTime: state.entryTime,
        }
        : null;

    if (cfg.showDebug) {
        // console.log({ positionsClosed, openPosition, events, levelsHistory });
    }

    return { positionsClosed, openPosition, levelsHistory, events };
}

// Named export like your first engine
export { runEngine };
