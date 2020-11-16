<template>
  <div id='hss'>
    <div id='inputs'>
      <b-input-group prepend='Factor Of Safety (Tensile, Compressive)'>
        <b-input v-model='rawTenFOS'></b-input>
        <b-input v-model='rawComFOS'></b-input>
      </b-input-group>
      <b-input-group prepend='Material Stiffness' append='MPa'>
        <b-input v-model='rawStiffness'></b-input>
      </b-input-group>
      <b-input-group prepend='Material Yield Stress' append='MPa'>
        <b-input v-model='rawYieldStress'></b-input>
      </b-input-group>
    </div>
    <div id='results' class='mt-2'>
      <div id='all'>
        <b-table-simple striped>
          <b-thead>
            <b-tr>
              <b-td>Member</b-td>
              <b-td>Length</b-td>
              <b-td>Force</b-td>
              <b-td>Min Area</b-td>
              <b-td>Min i</b-td>
              <b-td>Min Radius</b-td>
              <b-td>Optimal HSS</b-td>
            </b-tr>
          </b-thead>
          <b-tbody>
            <b-tr v-for='(member, index) in minValueMembers.members' :key='index'>
              <b-td>{{ member.member.join('-') }}</b-td>
              <b-td>{{ toSlideRule(member.length) }} <span class='unit'>m</span></b-td>
              <b-td>{{ toSlideRule(member.force) }} <span class='unit'>kN</span></b-td>
              <b-td v-if='member.minA'>{{ toSlideRule(member.minA) }} <span class='unit'>mm<sup>2</sup></span></b-td>
              <b-td v-else></b-td>
              <b-td v-if='member.minI'>{{ toSlideRule(member.minI) }} <span class='unit'>10<sup>6</sup>mm<sup>4</sup></span></b-td>
              <b-td v-else></b-td>
              <b-td v-if='member.minR'>{{ toSlideRule(member.minR) }} <span class='unit'>mm</span></b-td>
              <b-td v-else></b-td>
              <b-td>{{ member.hss.hss }}</b-td>
            </b-tr>
          </b-tbody>
        </b-table-simple>
      </div>
      <div id='best'>
        <b-card no-body>
          <b-card-body class='pb-2'>
            <b-card-title>Analysis</b-card-title>
            <b-card-text><b>Minimums -</b></b-card-text>
          </b-card-body>
          <b-list-group flush>
            <b-list-group-item><b class='ml-3'>Area:</b> {{ toSlideRule(minValueMembers.minA.minA) }} <span class='unit'>mm<sup>2</sup></span></b-list-group-item>
            <b-list-group-item><b class='ml-3'>i:</b> {{ toSlideRule(minValueMembers.minI.minI) }} <span class='unit'>10<sup>6</sup>mm<sup>4</sup></span></b-list-group-item>
            <b-list-group-item><b class='ml-3'>Radius:</b> {{ toSlideRule(minValueMembers.minR.minR) }} <span class='unit'>mm</span></b-list-group-item>
          </b-list-group>
          <b-card-body class='pb-2 mt-1'>
            <b-card-text><b>Suggestion - {{ (bestHss || { hss: 'None' }).hss }}</b></b-card-text>
          </b-card-body>
          <b-list-group v-if='bestHss' flush>
            <b-list-group-item><b class='ml-3'>Area:</b> {{ bestHss.area }} <span class='unit'>mm<sup>2</sup></span></b-list-group-item>
            <b-list-group-item><b class='ml-3'>i:</b> {{ bestHss.i }} <span class='unit'>10<sup>6</sup>mm<sup>4</sup></span></b-list-group-item>
            <b-list-group-item><b class='ml-3'>Radius:</b> {{ bestHss.radius }} <span class='unit'>mm</span></b-list-group-item>
          </b-list-group>
        </b-card>
      </div>
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
    rawYieldStress: 350,
    rawStiffness: 200000,
    rawTenFOS: 2,
    rawComFOS: 3
  }),
  computed: {
    yieldStress () {
      return parseFloat(this.rawYieldStress)
    },
    stiffness () {
      return parseFloat(this.rawStiffness)
    },
    tenFOS () {
      return parseFloat(this.rawTenFOS)
    },
    comFOS () {
      return parseFloat(this.rawComFOS)
    },
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
          const minA = this.calculateMinA(force, this.yieldStress, this.comFOS)
          const minI = this.calculateMinI(force, length, this.stiffness, this.comFOS)
          const minR = this.calculateMinR(length)
          let hss
          if (isNaN(this.comFOS)) {
            hss = { hss: 'None' }
          } else {
            hss = this.getOptimalHss(minA, minI, minR) || { hss: 'None' }
          }
          const memberCon = { member, length, force, minA, minI, minR, FOS: this.comFOS, hss }
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
          const minA = this.calculateMinA(force, this.yieldStress, this.tenFOS)
          let hss
          if (isNaN(this.tenFOS)) {
            hss = { hss: 'None' }
          } else {
            hss = this.getOptimalHss(minA) || { hss: 'None' }
          }
          const memberCon = { member, length, force, minA, FOS: this.tenFOS, hss }
          memberConstraints.push(memberCon)
          if (minA > minAMember.minA) {
            minAMember = memberCon
          }
        } else {
          memberConstraints.push({ member, length, force, hss: 'None' })
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
      const mins = this.minValueMembers
      return this.getOptimalHss(mins.minA.minA, mins.minI.minI, mins.minR.minR)
    }
  },
  methods: {
    toSlideRule,
    hssIsValid (sec, minA, minI, minR) {
      return sec.area >= minA && (minI == null || sec.i >= minI) && (minR == null || sec.radius >= minR)
    },
    getOptimalHss (minA, minI, minR) {
      return [...this.hss].filter(sec => this.hssIsValid(sec, minA, minI, minR)).sort((a, b) => a.mass - b.mass)[0]
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

<style lang="scss">
#hss {
  display: flex;
  flex-direction: column;
  padding: 10px;
  max-height: 100%;

  #inputs {
    width: 40%;
  }

  #results {
    display: flex;
    flex-direction: row;
    #best {
      width: 30%;
      padding-left: 10px;
    }

    #all {
      width: 70%;
      overflow: scroll;
      border: 1px solid #dee2e6;

      thead * {
        border: none;
      }
    }
  }
}
</style>
