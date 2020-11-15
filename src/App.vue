<template>
  <div id="app">
    <router-view/>
  </div>
</template>

<style lang="scss">
body {
  padding: 0;
  margin: 0;
}

#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  color: #2c3e50;

  min-height: 100vh;
  width: 100vw;

  .unit {
    color: #b0b8bf;
    font-size: 13px;
  }
}
</style>
