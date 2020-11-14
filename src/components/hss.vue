<template>
  <div id='hss'>
    <div id='all'>
      <b-table-simple striped bordered>
        <b-thead>
          <b-tr>
            <b-td>Member</b-td>
            <b-td>Length</b-td>
            <b-td>Force</b-td>
            <b-td>Min Area</b-td>
            <b-td>Min i</b-td>
            <b-td>Min Radius</b-td>
          </b-tr>
        </b-thead>
        <b-tbody>
          <b-tr v-for='(member, index) in minValueMembers.members' :key='index'>
            <b-td>{{ member.member.join('-') }}</b-td>
            <b-td>{{ toSlideRule(member.length) }} m</b-td>
            <b-td>{{ toSlideRule(member.force) }} kN</b-td>
            <b-td>{{ toSlideRule(member.minA) }} mm<sup>2</sup></b-td>
            <b-td v-if='member.minI'>{{ toSlideRule(member.minI) }} 10<sup>6</sup>mm<sup>4</sup></b-td>
            <b-td v-else></b-td>
            <b-td v-if='member.minR'>{{ toSlideRule(member.minR) }} mm</b-td>
            <b-td v-else></b-td>
          </b-tr>
        </b-tbody>
      </b-table-simple>
    </div>
    <div id='best'>
      <p>Minimum area: {{ toSlideRule(minValueMembers.minA.minA) }} mm<sup>2</sup></p>
      <p>Minimum i: {{ toSlideRule(minValueMembers.minI.minI) }} 10<sup>6</sup>mm<sup>4</sup></p>
      <p>Minimum radius: {{ toSlideRule(minValueMembers.minR.minR) }} mm</p>
      <p>We choose: {{ bestHss.hss }}</p>
      <p>Area: {{ bestHss.area }} mm<sup>2</sup>, i: {{ bestHss.i }} 10<sup>6</sup>mm<sup>4</sup>, radius: {{ bestHss.radius }} mm</p>
    </div>
  </div>
</template>

<script>
import { toSlideRule } from '@/assets/utils.js'
import hss from '@/assets/hss-v1.json'

export default {
  name: 'hss',
  props: ['solution'],
  data: () => ({
    yieldStress: 350,
    stiffness: 200000
  }),
  computed: {
    minValueMembers () {
      const { memberVector, memberLengths, solutionVector } = this.solution
      const memberConstraints = []
      let minAMember = { minA: -1 }
      let minIMember = { minI: -1 }
      let minRMember = { minR: -1 }
      for (let i = 0; i < memberVector.length; i++) {
        const member = memberVector[i]
        const length = memberLengths[i]
        const force = solutionVector[i]
        if (force < 0) {
          const FOS = 3
          const minA = this.calculateMinA(force, this.yieldStress, FOS)
          const minI = this.calculateMinI(force, length, this.stiffness, FOS)
          const minR = this.calculateMinR(length)
          const memberCon = { member, length, force, minA, minI, minR, FOS }
          memberConstraints.push(memberCon)
          if (minA > minAMember.minA) {
            minAMember = memberCon
          }
          if (minI > minIMember.minI) {
            minIMember = memberCon
          }
          if (minR > minRMember.minR) {
            minRMember = memberCon
          }
        } else if (force > 0) {
          const FOS = 2
          const minA = this.calculateMinA(force, this.yieldStress, FOS)
          const memberCon = { member, length, force, minA, FOS }
          memberConstraints.push(memberCon)
          if (minA > minAMember.minA) {
            minAMember = memberCon
          }
        } else {
          memberConstraints.push({ member, length, force })
        }
      }
      return {
        minA: minAMember,
        minI: minIMember,
        minR: minRMember,
        members: memberConstraints
      }
    },
    hss () {
      function getWidthHeightDepth (sectionName) {
        // Gets the width, height and cross sectional depth. Not used for anything at the moment
        const dims = sectionName.substring(4).split('x').map(dim => parseInt(dim))
        return { width: dims[0], height: dims[1], depth: dims[2] }
      }
      // Turns the object into an array of objects with keys - ["hass", "width", "height", "depth", "mass", "area", "i", "radius"]
      return Object.keys(hss).map(key => ({ hss: key, ...getWidthHeightDepth(key), ...hss[key] }))
    },
    bestHss () {
      return [...this.hss].filter(sec => this.hssIsValid(sec)).sort((a, b) => a.mass - b.mass)[0]
    }
  },
  methods: {
    toSlideRule,
    hssIsValid (sec) {
      const mins = this.minValueMembers
      const minA = mins.minA.minA
      const minI = mins.minI.minI
      const minR = mins.minR.minR
      return sec.area >= minA && sec.i >= minI && sec.radius >= minR
    },
    calculateMinA (force, yieldStress, FOS) {
      // Force in kN and yieldStress in MPa. Returns A in mm^2
      return 1000 * (FOS * Math.abs(force)) / yieldStress
    },
    calculateMinI (force, length, stiffness, FOS) {
      // Force in kN, length in meters, stiffness in MPa. Returns I in 10^6*mm^4
      return (10 ** 3) * (FOS * Math.abs(force) * length ** 2) / (Math.PI ** 2 * stiffness)
    },
    calculateMinR (length) {
      // length in meters. Returns r in mm.
      return 1000 * length / 200
    },
    getConstraints () {

    }
  }
}
</script>

<style lang="scss" scoped>
#hss {
  display: flex;
  flex-direction: row;
  padding: 10px;

  #best {
    width: 50%;
    padding-left: 10px;
  }

  #all {
    width: 50%;
  }
}
</style>
