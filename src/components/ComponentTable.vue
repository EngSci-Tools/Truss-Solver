<template>
  <b-table-simple bordered responsive id='component-table'>
    <b-thead>
      <b-tr>
        <b-td>Solution</b-td>
        <b-td class='member-cell' :class='{hovered: isHovered(-2, index)}' v-for='(member, index) in memberVector' :key='index'>{{ member.join('-') }}</b-td>
        <b-td>Forces</b-td>
      </b-tr>
    </b-thead>
    <b-tbody>
      <b-tr v-for='(equation, jointIndex) in componentMatrix' :key='jointIndex'>
        <b-td class='joint-cell' :class='{hovered: isHovered(jointIndex, -2)}' >{{ jointVector[Math.floor(jointIndex / 2)] }}</b-td>
        <b-td
          :class='{hovered: isHovered(jointIndex, equationIndex), zero: Math.abs(component) < 10 ** -6}'
          @mouseleave='onCellDehover()'
          @mouseover='onCellHover(jointIndex, equationIndex)'
          v-for='(component, equationIndex) in equation'
          :key='equationIndex'
        >{{ toSlideRule(component) }}</b-td>
        <b-td class='answer-cell'>{{ toSlideRule(forceVector[jointIndex]) }}</b-td>
      </b-tr>
    </b-tbody>
  </b-table-simple>
</template>

<script>
import { toSlideRule } from '@/assets/utils.js'

export default {
  name: 'ComponentTable',
  props: ['solution'],
  data: () => ({
    hovered: [-1, -1]
  }),
  computed: {
    componentMatrix () { return this.solution.componentMatrix },
    jointVector () { return this.solution.jointVector },
    memberVector () { return this.solution.memberVector },
    forceVector () { return this.solution.forceVector },
    solutionVector () { return this.solution.solutionVector },
    matrixDims () {
      // Returned in heightxwidth like a usual matrix
      // The vertical includes all the linear equations. The header has the member names.
      // The horizontal includes all the members, a column for the joint name and equation, and the answer vector
      return [this.jointVector.length * 2, 2 + this.memberVector]
    }
  },
  methods: {
    toSlideRule,
    isHovered (jointIndex, equationIndex) {
      return this.hovered[0] === jointIndex || this.hovered[1] === equationIndex
    },
    onCellHover (jointIndex, equationIndex) {
      this.hovered = [jointIndex, equationIndex]
    },
    onCellDehover () {
      this.hovered = [-1, -1]
    }
  }
}
</script>

<style lang="scss" scoped>
#component-table {
  td {
    white-space: nowrap;
  }

  .hovered {
    background: #ecf0f1;

    &.member-cell,&.joint-cell {
      background: #bdc3c7;
    }
  }

  .zero {
    opacity: 0.3;
  }
}
</style>
