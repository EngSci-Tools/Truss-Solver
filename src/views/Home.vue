<template>
  <div class="home">
    <img alt="Logo" src="../assets/uoft.png">
    <h1>Truss Solver</h1>
    <div class='truss-types'>
      <b-button class='mb-3' @click='openFresh'>Start Fresh</b-button>
      <b-form>
        <b-input-group class='mb-1' prepend='Bridge Length' append='m'>
          <b-form-input v-model='truss.bridgeLength' type='number' ></b-form-input>
        </b-input-group>
        <b-input-group class='mb-1' prepend='Bridge Height' append='m'>
          <b-form-input v-model='truss.height' type='number' min='0.00' step='0.0001'></b-form-input>
        </b-input-group>
        <b-input-group class='mb-1' prepend='Bridge Width' append='m'>
          <b-form-input v-model='truss.bridgeWidth' type='number' ></b-form-input>
        </b-input-group>
        <b-input-group class='mb-2' prepend='Member Length' append='m'>
          <b-form-input v-model='truss.memberLength' type='number' ></b-form-input>
        </b-input-group>
        <b-input-group class='mb-1' prepend='Joint Load' append='kN'>
          <b-form-input v-model='truss.jointLoad' type='number' ></b-form-input>
        </b-input-group>
        <b-input-group class='mb-2' prepend='Uniform Load' append='kN/m^2'>
          <b-form-input v-model='truss.uniformLoad' type='number' ></b-form-input>
        </b-input-group>
        <b-dropdown class='submit-button' split @click='openTruss' :text='`Construct: ${truss.type}`'>
          <b-dropdown-item v-for='type in Object.keys(trussTypeMap)' :key='type' @click='truss.type = type'>{{ type }}</b-dropdown-item>
        </b-dropdown>
        <p>There is a tutorial on the builder page if you click the button in the top left.</p>
      </b-form>
    </div>
  </div>
</template>

<script>
import { HoweTrussConstructor, WarrenTrussConstructor, PrattTrussConstructor } from '@/assets/qConstructor'

export default {
  name: 'Home',
  data: () => ({
    truss: {
      height: 4.3301,
      memberLength: 5,
      bridgeLength: 30,
      bridgeWidth: 10,
      jointLoad: 0,
      uniformLoad: 5,
      type: 'Warren'
    },

    trussTypeMap: {
      Warren: WarrenTrussConstructor,
      Pratt: PrattTrussConstructor,
      Howe: HoweTrussConstructor
    }
  }),
  watch: {
    truss: {
      deep: true,
      handler (to) {
        localStorage.setItem('trussValues', JSON.stringify(this.truss))
      }
    }
  },
  mounted () {
    let truss = localStorage.getItem('trussValues')
    console.log('Got', truss)
    if (truss != null) {
      truss = JSON.parse(truss)
      this.truss = { ...this.truss, ...truss }
    }
  },
  computed: {
    warrenQuery () {
      const constructor = new WarrenTrussConstructor(this.truss)
      return constructor.toQuery()
    }
  },
  methods: {
    async openFresh (e) {
      e.preventDefault()
      await this.$router.push({ name: 'Trusses' })
    },
    async openWarren (e) {
      e.preventDefault()
      const query = this.warrenQuery
      await this.$router.push({ name: 'Trusses', query })
    },
    async openTruss (e) {
      e.preventDefault()
      const con = new this.trussTypeMap[this.truss.type](this.truss)
      const query = con.toQuery()
      await this.$router.push({ name: 'Trusses', query })
    }
  }
}
</script>

<style lang="scss">
.home {
  img {
      height: 40vh;
      margin: 0 auto;
  }
  width: 70vw;
  min-height: 100vh;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: center;

  .truss-types {
    width: 100%;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    align-items: flex-start;

    .submit-button {
      width: 40%;
    }

    div {
      display: flex;
      flex-direction: row;
    }
  }
}
</style>
