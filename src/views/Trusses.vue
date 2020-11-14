<template>
  <div id='truss'>
    <div id='builder-container'>
      <Builder
        :componentMatrix='trussAnalysis.componentMatrix'
        :jointVector='trussAnalysis.jointVector'
        :memberVector='trussAnalysis.memberVector'
        :answerVector='trussAnalysis.answerVector'
        :solutionVector='trussAnalysis.solutionVector'
      ></Builder>
    </div>
    <div id='truss-analysis'>
      <ComponentTable
        :componentMatrix='trussAnalysis.componentMatrix'
        :jointVector='trussAnalysis.jointVector'
        :memberVector='trussAnalysis.memberVector'
        :answerVector='trussAnalysis.answerVector'
        :solutionVector='trussAnalysis.solutionVector'
      ></ComponentTable>
    </div>
  </div>
</template>

<script>
import Builder from '@/components/Builder.vue'
import ComponentTable from '@/components/ComponentTable.vue'

export default {
  name: 'Truss',
  components: {
    Builder,
    ComponentTable
  },
  data: () => ({
    trussAnalysis: {
      componentMatrix: [],
      jointVector: [],
      memberVector: [],
      answerVector: [],
      solutionVector: []
    }
  }),
  watch: {
    trussAnalysis: {
      handler (to) {
        console.log('New Analysis: ', this.trussAnalysis)
      },
      deep: true
    }
  }
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
