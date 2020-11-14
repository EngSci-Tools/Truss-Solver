<template>
  <div id='truss'>
    <div id='builder-container'>
      <Builder
        :solution='trussAnalysis'
      ></Builder>
    </div>
    <div id='truss-analysis' ref='trussAnalysis'>
      <HSS :solution='trussAnalysis'></HSS>
      <ComponentTable
        :solution='trussAnalysis'
      ></ComponentTable>
    </div>
  </div>
</template>

<script>
import Builder from '@/components/Builder.vue'
import ComponentTable from '@/components/ComponentTable.vue'
import HSS from '@/components/hss.vue'

export default {
  name: 'Truss',
  components: {
    Builder,
    ComponentTable,
    HSS
  },
  mounted () {
    this.$root.$on('viewData', () => {
      this.$refs.trussAnalysis.scrollIntoView({ behavior: 'smooth' })
    })
  },
  data: () => ({
    trussAnalysis: {
      componentMatrix: [],
      jointVector: [],
      memberVector: [],
      forceVector: [],
      solutionVector: []
    }
  })
}
</script>

<style lang="scss" scoped>
#truss {
  min-height: 100vh;

  #builder-container {
    height: 100vh;
    width: 100vw;
  }

  #truss-analysis {
    min-height: 100vh;
    width: 100vw;
  }
}
</style>
