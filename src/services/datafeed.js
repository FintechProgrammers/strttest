import { goldDatafeed } from "@/services/datafeed.js";

export const goldDatafeed = {
    onReady: (callback) => {
        setTimeout(() => callback({
            supports_search: false,
            supports_group_request: false,
            supported_resolutions: ['5'],
            supports_marks: false,
            supports_timescale_marks: false,
            supports_time: true,
        }), 0);
    },
    resolveSymbol: (symbolName, onSymbolResolvedCallback) => {
        setTimeout(() => onSymbolResolvedCallback({
            name: 'XAU/USD',
            ticker: 'XAU/USD',
            type: 'commodity',
            session: '24x7',
            timezone: 'Etc/UTC',
            minmov: 1,
            pricescale: 100,
            has_intraday: true,
            supported_resolutions: ['5'],
            volume_precision: 2,
            data_status: 'streaming',
        }), 0);
    },
    getBars: async (symbolInfo, resolution, from, to, onHistoryCallback, onErrorCallback) => {
        try {
            // You need to provide your candle data here
            // For demo, return empty array
            onHistoryCallback([], { noData: true });
        } catch (err) {
            onErrorCallback(err);
        }
    },
};