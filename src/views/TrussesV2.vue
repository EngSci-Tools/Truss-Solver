<template>
  <div id='trussV2'>
    <Builder></Builder>
  </div>
</template>

<script>
import Builder from '@/components/Builder2.vue'

export default {
  name: 'Truss',
  components: {
    Builder
  }
}
</script>

<style lang="scss" scoped>
#trussV2 {
  height: 100vh;
}
</style>
