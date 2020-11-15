<template>
  <div id='truss'>
    <div id='builder-container'>
      <Builder
        :solution='trussAnalysis'
      ></Builder>
    </div>
    <div id='truss-analysis' ref='trussAnalysis'>
      <b-tabs>
        <b-tab title='HSS Analysis'>
          <HSS :solution='trussAnalysis'></HSS>
        </b-tab>
        <b-tab title='Solution Matrix'>
          <ComponentTable
            :solution='trussAnalysis'
          ></ComponentTable>
        </b-tab>
      </b-tabs>
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

<style lang="scss">
#truss {
  min-height: 100vh;

  #builder-container {
    height: 100vh;
    width: 100vw;
  }

  #truss-analysis {
    height: 100vh;
    width: 100vw;

    .tabs, .tabs .tab-content, .tab-pane {
      height: 100%;
    }
  }
}
</style>
