<template>
  <div>
    <nav style="margin-bottom: 16px">
      <router-link to="/tradingview-chart">TradingView Chart</router-link>
      <!-- Add more links here if you add more routes -->
    </nav>
    <router-view />
  </div>
</template>

<script setup>
// No script needed unless you want global logic
</script>

<style scoped>
nav {
  background: #f5f5f5;
  padding: 8px 16px;
  border-radius: 6px;
}
nav a {
  margin-right: 16px;
  text-decoration: none;
  color: #1976d2;
  font-weight: bold;
}
nav a.router-link-exact-active {
  color: #d32f2f;
}
</style>
