import { createRouter, createWebHistory } from 'vue-router';
import TradingViewChart from '@/views/TradingViewChart.vue';

const routes = [
    {
        path: '/',
        name: 'Home',
        component: () => import('@/views/GoldLevelsChartPage.vue'),
    },
    {
        path: '/golden-era',
        name: 'GoldenEra',
        component: () => import('@/views/GoldenEra.vue'),
    },
    {
        path: '/tradingview-chart',
        name: 'TradingViewChart',
        component: TradingViewChart,
    },
    // ...other routes
];

const router = createRouter({
    history: createWebHistory(),
    routes,
});

export default router;