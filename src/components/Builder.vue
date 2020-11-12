<template>
  <div class='builder' ref='builder' oncontextmenu="return false;">
    <!-- TODO: Add a toolbar to go above the canvas -->
    <b-modal id="modal-xl" size="xl" v-model='showingResults' title="Internal Forces">
      <b-button type='button' :variant='copied ? "success" : ""' class='mb-2' @click='copyPath'>{{ copied ? "Copied" : "Copy Persistent Url" }}</b-button>
      <textarea style='display: none;' ref='hiddenUrl'></textarea>
      <b-table-simple bordered striped>
        <b-thead>
          <b-tr>
            <b-td>Joint 1</b-td>
            <b-td>Joint 2</b-td>
            <b-td>Magnitude</b-td>
            <b-td>Type</b-td>
          </b-tr>
        </b-thead>
        <b-tbody>
          <b-tr v-for='(force, member) in structures.internalForces' :key=member>
            <b-td>{{ member.split('-')[0] }}</b-td>
            <b-td>{{ member.split('-')[1] }}</b-td>
            <b-td>{{ force }} kN</b-td>
            <b-td>{{ force >= 0 ? 'Tensile' : 'Compressive' }}</b-td>
          </b-tr>
        </b-tbody>
      </b-table-simple>
    </b-modal>
    <div class='toolbar'>
      <b-button-toolbar key-nav aria-label="Toolbar with button groups">
        <b-button-group class="mx-1">
          <b-button @click='undo'>Undo</b-button>
          <b-button @click='redo' :disabled='undoneActions.length < 1'>Redo</b-button>
        </b-button-group>
        <b-dropdown class="mx-1" right :text='`Mode: ${interactions.placeType}`'>
          <b-dropdown-item @click='setMode(placeType.SELECTING)'>Select</b-dropdown-item>
          <b-dropdown-item @click='setMode(placeType.JOINT)'>Joints</b-dropdown-item>
          <b-dropdown-item @click='setMode(placeType.MEMBER)'>Members</b-dropdown-item>
          <b-dropdown-item @click='setMode(placeType.FORCE)'>Loads</b-dropdown-item>
        </b-dropdown>
      </b-button-toolbar>
      <b-input-group class='mx-1 mt-1 tick-input' append="m" prepend='Y Tick Seperation'>
          <b-form-input :value='visuals.ySep' @change='visuals.ySep = $event' class="text-right"></b-form-input>
        </b-input-group>
      <b-input-group class='mx-1 mt-1 tick-input' append="m" prepend='X Tick Seperation'>
          <b-form-input :value='visuals.xSep' @change='visuals.xSep = $event' class="text-right"></b-form-input>
        </b-input-group>
      <b-button class='m-1 mt-1' @click='getInternalForces' :variant='calculatedFailed ? "danger" : ""'>{{ calculatedFailed ? calculatedFailedMessage : 'Caculate' }}</b-button>
      <div v-if='jointSelected'>
        <h4 class='m-1 mt-3'>Joints:</h4>
        <b-dropdown class='mx-1' :text='selectedJointsType'>
          <b-dropdown-item @click='setSelectedJointType(jointType.FLOATING)'>Floating</b-dropdown-item>
          <b-dropdown-item @click='setSelectedJointType(jointType.PIN)'>Pin</b-dropdown-item>
        </b-dropdown>
        <b-button class='m-1' @click='removeSelectedJoints'>Remove</b-button>
      </div>
      <div v-if='memberSelected'>
        <h4 class='m-1 mt-3'>Members:</h4>
        <b-button class='m-1' @click='removeSelectedMembers'>Remove</b-button>
      </div>
      <div v-if='forceSelected'>
        <h4 class='m-1 mt-3'>Loads:</h4>
        <b-button-toolbar key-nav class='m-1 input-toolbar'>
          <b-input-group append="kN">
            <b-form-input :value='selectedForcesMagnitude' @change='setSelectedForceMagnitude($event)' class="text-right"></b-form-input>
          </b-input-group>
          <b-button-group>
            <b-button @click='setSelectedForceMagnitude()'>Apply</b-button>
          </b-button-group>
        </b-button-toolbar>
        <b-button-toolbar key-nav class='m-1 input-toolbar'>
          <b-input-group append="o">
            <b-form-input :value='selectedForcesDirection' @change='setSelectedForceDirection($event)' class="text-right"></b-form-input>
          </b-input-group>
          <b-button-group>
            <b-button @click='setSelectedForceDirection()'>Apply</b-button>
          </b-button-group>
        </b-button-toolbar>
        <b-button class='m-1' @click='removeSelectedForces'>Remove</b-button>
      </div>
    </div>
  </div>
</template>

<script>
/* eslint-disable no-unused-vars */
import Vue from 'vue'
import linear from 'linear-solve'
import { mode, placeType, interactionType, unit, jointType, Joint, Force, MemberGraph, actions, actionTypes, actionErrors, sleep } from '@/assets/utils'
import * as PIXI from 'pixi.js'
const { Application, Container, Graphics } = PIXI

export default {
  name: 'Build',
  data: () => ({
    placeType,
    jointType,

    history: [],
    undoneActions: [],
    showingResults: false,
    copied: false,

    calculatedFailed: false,
    calculatedFailedMessage: 'Pin 2 Joints',
    visuals: { // When any of the visuals update, the whole image should be redrawn
      width: 0,
      height: 0,
      scale: 50, // Pixels per unit of measurement.
      units: unit.METERS,
      ySep: 4.3301, // These define how many units are between each background tick
      xSep: 2.5,
      scaleMax: 100,
      scaleMin: 20,
      viewX: 0,
      viewY: 0
    },

    interactions: { // I wish a lot of these could be computed properties... but they can't cause they're pixi things or just too complicated
      placeType: placeType.SELECTING,
      leftMouseDown: false,
      rightMouseDown: false,
      mousePos: [0, 0],
      dragging: false,
      dragStart: [], // Stores where a drag started so that we can draw selections correctly. Stored in point coordinate system
      heldKeys: [],
      callbacks: {}
    },

    selections: { // Could probably be inside interactions, but it makes watching code more complicated. Lists of points stored in point coordinate system
      joints: []
    },

    structures: { // Stores the components that make up the simulations.
      joints: {}, // Joints are stored as key value pairs where the key is the jointId and the value is the point information
      members: new MemberGraph(),
      internalForces: {},
      loads: {} // Forces take the key of their joint and have a value of their force
    },

    pixi: {
      app: new Application({ width: 0, height: 0, antialias: true, backgroundColor: 0x34495e }),

      background: new Container(),
      backgroundGraph: new Graphics(),
      selectionGraph: new Graphics(),

      bridge: new Container(),
      jointGraph: new Graphics(),
      memberGraph: new Graphics(),
      loadsGraph: new Graphics()
    }
  }),
  watch: {
    visuals: {
      handler (to) {
        // Visuals always need to rerender the whole scene since it always results in changes to all containers
        this.redraw()
        this.pixi.app.stage.x = to.viewX + this.visuals.width / 2
        this.pixi.app.stage.y = to.viewY + this.visuals.height / 2
      },
      deep: true
    },
    'visuals.scale' (to) {
      if (to > this.visuals.scaleMax) {
        this.visuals.scale = this.visuals.scaleMax
      } else if (to < this.visuals.scaleMin) {
        this.visuals.scale = this.visuals.scaleMin
      }
    },
    structures: {
      handler () {
        this.toQueryString()
      },
      deep: true
    }
  },
  computed: {
    jointIds () {
      return Object.keys(this.structures.joints)
    },
    jointRadius () {
      const minSep = Math.min(this.visuals.xSep, this.visuals.ySep)
      if (minSep < 1) {
        return this.visuals.scale * minSep / 5
      } else {
        return this.visuals.scale / 5
      }
    },
    mode () {
      const { heldKeys } = this.interactions
      if (this.holdingKey('MetaLeft') || this.holdingKey('ControlLeft')) { // For mac and windows respectivly
        return mode.COMMAND
      } if (this.holdingKey('ShiftLeft')) {
        return mode.SECONDARY
      } else {
        return mode.PRIMARY
      }
    },
    mousePoint () {
      return this.pixToPoint(this.interactions.mousePos)
    },
    jointSelected () {
      return this.selections.joints.length > 0 && (this.interactions.placeType === placeType.SELECTING || this.interactions.placeType === placeType.JOINT)
    },
    selectedJointsType () {
      if (this.selections.joints.length < 1) {
        return 'Type'
      }
      const currType = this.structures.joints[this.selections.joints[0]].type
      for (const jointId of this.selections.joints) {
        const newType = this.structures.joints[jointId].type
        if (currType !== newType) {
          return 'Type'
        }
      }
      return currType
    },
    memberSelected () {
      if (!(this.interactions.placeType === placeType.SELECTING || this.interactions.placeType === placeType.MEMBER)) {
        return false
      }
      return this.selectedMembers.length > 0
    },
    selectedMembers () {
      const { joints } = this.selections
      const members = []
      for (const member of this.structures.members.getAllMembers()) {
        if (joints.indexOf(member[0]) > -1 && joints.indexOf(member[1]) > -1) {
          members.push(member)
        }
      }
      return members
    },
    forceSelected () {
      return Object.keys(this.selectedForces).length > 0 && (this.interactions.placeType === placeType.SELECTING || this.interactions.placeType === placeType.FORCE)
    },
    selectedForces () {
      return Object.fromEntries(Object.entries(this.structures.loads).filter(([jointId, force]) => this.selections.joints.indexOf(jointId) > -1))
    },
    selectedForcesMagnitude () {
      if (Object.keys(this.selectedForces).length < 1) {
        return 0
      }
      const currMag = Object.values(this.selectedForces)[0].magnitude
      for (const { magnitude } of Object.values(this.selectedForces)) {
        if (currMag !== magnitude) {
          return 0
        }
      }
      return currMag
    },
    selectedForcesDirection () {
      if (Object.keys(this.selectedForces).length < 1) {
        return 0
      }
      const currDir = Object.values(this.selectedForces)[0].direction
      for (const { direction } of Object.values(this.selectedForces)) {
        if (currDir !== direction) {
          return 0
        }
      }
      return currDir
    },
    internalMinMax () {
      const internalForces = Object.values(this.structures.internalForces)
      if (internalForces.length < 1) {
        return [0, 0]
      }
      const minForce = Math.min(...internalForces)
      const maxForce = Math.max(...internalForces)
      return [minForce, maxForce, Math.max(Math.abs(minForce), Math.abs(maxForce))]
    }
  },
  async mounted () {
    const div = this.$refs.builder

    this.fitPixiCanvas(div)
    this.addEventListeners(div)
    this.setupChildren()

    div.appendChild(this.pixi.app.view)
    this.redraw()

    // await this.testJointActions()
    // await this.testMemberActions()
    // await this.testSelectionActions()
    // await this.testParallelActions()
    // await this.testAdd()

    this.addInteractionListeners()
    this.fromQueryString()
  },
  methods: {
    copyPath () {
      const hiddenUrl = this.$refs.hiddenUrl
      const origin = window.location.origin
      const { fullPath } = this.$router.currentRoute
      hiddenUrl.style.display = 'block'
      hiddenUrl.value = `${origin}${fullPath}`
      hiddenUrl.select()
      document.execCommand('copy')
      hiddenUrl.style.display = 'none'
      this.copied = true
    },

    // There are three major method types, Action methods, Interaction methods, and Helper methods.
    // Action methods: These are the handlers for actions and act using helpers to directly modify the scene
    // Interaction methods: These add and execute event callbacks for interactions such as drags, mouse clicks, and key presses. These evetually create and execute action objects.
    // Helper methods: These are used by both action and interaction methods to reduce the amount of code in each callback. They modify component data, parse component data, and create actions out of parameters.

    // Used for ui
    setMode (mode) {
      this.interactions.placeType = mode
      this.onAllDeselected()
    },

    // Uses the concept of actions to edit the scene
    executeHelper (action) {
      // TODO: This got much bigger than expected. I'll do it better later.
      if (!(action instanceof actionTypes.all)) {
        throw new actionErrors.NonAction()
      } else if (action instanceof actionTypes.joints) {
        if (action instanceof actions.joints.ADD) {
          this.aJointAdd(action)
        } else if (action instanceof actions.joints.REMOVE) {
          this.aJointRemove(action)
        } else if (action instanceof actions.joints.MOVE) {
          this.aJointMove(action)
        } else if (action instanceof actions.joints.SETTYPE) {
          this.aJointSetType(action)
        } else if (action instanceof actions.joints.SETID) {
          this.aJointSetId(action)
        } else {
          throw new actionErrors.NonAction()
        }
      } else if (action instanceof actionTypes.members) {
        if (action instanceof actions.members.ADD) {
          this.aMemberAdd(action)
        } else if (action instanceof actions.members.REMOVE) {
          this.aMemberRemove(action)
        } else if (action instanceof actions.members.SETLINAREA) {
          this.aMemberSetLinArea(action)
        } else {
          throw new actionErrors.NonAction()
        }
      } else if (action instanceof actionTypes.forces) {
        if (action instanceof actions.forces.ADD) {
          this.aForceAdd(action)
        } else if (action instanceof actions.forces.REMOVE) {
          this.aForceRemove(action)
        } else if (action instanceof actions.forces.SETMAG) {
          this.aForceSetMag(action)
        } else if (action instanceof actions.forces.SETDIR) {
          this.aForceSetDir(action)
        } else {
          throw new actionErrors.NonAction()
        }
      } else if (action instanceof actionTypes.select) {
        if (action instanceof actions.select.SELECT) {
          this.aSelect(action)
        } else if (action instanceof actions.select.DESELECT) {
          this.aDeselect(action)
        } else if (action instanceof actions.select.COPY) {
          this.aCopy(action)
        } else {
          throw new actionErrors.NonAction()
        }
      } else if (action instanceof actionTypes.ghosts) {
        if (action instanceof actions.ghosts.CREATEFROMSELECTED) {
          this.aGhostCreateFromSelected(action)
        } else if (action instanceof actions.ghosts.PLACE) {
          this.aGhostPlace(action)
        } else {
          throw new actionErrors.NonAction()
        }
      } else {
        throw new actionErrors.NonAction()
      }
    },

    execute (actions, record = true, clearForward = true) {
      if (Array.isArray(actions)) {
        if (actions.length < 1) {
          return
        }
        for (const action of actions) {
          this.executeHelper(action)
        }
      } else {
        this.executeHelper(actions)
      }

      if (clearForward) {
        this.undoneActions = []
      }
      if (record) {
        this.history.push(actions)
      }
      this.redraw()
    },

    undo () {
      if (this.history.length < 1) {
        return false
      }
      const action = this.history.pop()
      if (Array.isArray(action)) {
        // If this is an actiongroup then we want to do all the reverses at once as well
        // Also the first reverse is to reverse the array. Didn't think about that when I named reverse.
        const reverses = action.reverse().map(action => action.reverse())
        this.execute(reverses, false, false)
      } else {
        this.execute(action.reverse(), false, false) // Do the reverse and do not record the history
      }
      this.undoneActions.push(action)
      return true
    },

    redo () {
      if (this.undoneActions.length < 1) {
        return false
      }
      const action = this.undoneActions.pop()
      this.execute(action, true, false)
      return true
    },

    // Testers
    async testParallelActions () {
      await sleep(1000)
      const actionArr = [
        new actions.joints.ADD([0, 0], 'A', jointType.FLOATING),
        new actions.joints.ADD([1, 2], 'B', jointType.FLOATING),
        new actions.joints.ADD([2, 0], 'C', jointType.FLOATING),
        new actions.members.ADD('A', 'B'),
        new actions.members.ADD('B', 'C')
      ]
      this.execute(actionArr)
      await sleep(1000)
      this.undo()
    },
    async testJointActions () {
      const addActOne = new actions.joints.ADD([0, 0], 'A', jointType.FLOATING)
      await sleep(1000)
      this.execute(addActOne)
      await sleep(1000)
      const moveActOne = new actions.joints.MOVE([1, 1], 'A')
      this.execute(moveActOne)
      await sleep(1000)
      const editActOne = new actions.joints.SETTYPE('A', jointType.FLOATING, jointType.PIN)
      this.execute(editActOne)
      await sleep(1000)
      this.undo()
      await sleep(1000)
      this.undo()
      await sleep(1000)
      this.undo()
      this.undo()
    },
    async testMemberActions () {
      this.execute(new actions.joints.ADD([0, 0], 'A', jointType.FLOATING))
      this.execute(new actions.joints.ADD([1, 2], 'B', jointType.FLOATING))
      this.execute(new actions.joints.ADD([2, 0], 'C', jointType.FLOATING))
      await sleep(1000)
      this.execute(new actions.members.ADD('A', 'B'))
      await sleep(1000)
      this.execute(new actions.members.ADD('B', 'C'))
      await sleep(1000)
      this.undo()
      this.undo()
      await sleep(1000)
      this.undo()
      this.undo()
      this.undo()
    },
    async testSelectionActions () {
      await sleep(1000)
      const actionArr = [
        new actions.joints.ADD([0, 0], 'A', jointType.FLOATING),
        new actions.joints.ADD([1, 2], 'B', jointType.FLOATING),
        new actions.joints.ADD([2, 0], 'C', jointType.FLOATING),
        new actions.members.ADD('A', 'B'),
        new actions.members.ADD('B', 'C')
      ]
      this.execute(actionArr)
      await sleep(1000)
      this.execute(new actions.select.SELECT(['A', 'B']))
      await sleep(1000)
      this.execute(new actions.select.DESELECT(['B']))
      await sleep(1000)
      this.execute(new actions.select.DESELECT(['A']))
      await sleep(1000)
      this.undo()
      await sleep(1000)
      this.undo()
      await sleep(1000)
      this.undo()
      await sleep(1000)
      this.undo()
    },
    async testAdd () {
      const actionsList = [
        new actions.joints.ADD([0, 0], 'A', jointType.PIN),
        new actions.joints.ADD([2.5, 4.3301], 'B', jointType.FLOATING),
        new actions.joints.ADD([5, 0], 'C', jointType.FLOATING),
        new actions.joints.ADD([7.5, 4.3301], 'D', jointType.FLOATING),
        new actions.joints.ADD([10, 0], 'E', jointType.FLOATING),
        new actions.joints.ADD([12.5, 4.3301], 'F', jointType.FLOATING),
        new actions.joints.ADD([15, 0], 'G', jointType.FLOATING),
        new actions.joints.ADD([17.5, 4.3301], 'H', jointType.FLOATING),
        new actions.joints.ADD([20, 0], 'I', jointType.FLOATING),
        new actions.joints.ADD([22.5, 4.3301], 'J', jointType.FLOATING),
        new actions.joints.ADD([25, 0], 'K', jointType.FLOATING),
        new actions.joints.ADD([27.5, 4.3301], 'L', jointType.FLOATING),
        new actions.joints.ADD([30, 0], 'M', jointType.PIN),
        new actions.members.ADD('A', 'B'),
        new actions.members.ADD('A', 'C'),
        new actions.members.ADD('B', 'C'),
        new actions.members.ADD('B', 'D'),
        new actions.members.ADD('C', 'D'),
        new actions.members.ADD('C', 'E'),
        new actions.members.ADD('D', 'E'),
        new actions.members.ADD('D', 'F'),
        new actions.members.ADD('E', 'F'),
        new actions.members.ADD('E', 'G'),
        new actions.members.ADD('F', 'G'),
        new actions.members.ADD('F', 'H'),
        new actions.members.ADD('G', 'H'),
        new actions.members.ADD('G', 'I'),
        new actions.members.ADD('H', 'I'),
        new actions.members.ADD('H', 'J'),
        new actions.members.ADD('I', 'J'),
        new actions.members.ADD('I', 'K'),
        new actions.members.ADD('J', 'K'),
        new actions.members.ADD('J', 'L'),
        new actions.members.ADD('K', 'L'),
        new actions.members.ADD('K', 'M'),
        new actions.members.ADD('L', 'M'),
        new actions.forces.ADD('C', 175, -90),
        new actions.forces.ADD('E', 175, -90),
        new actions.forces.ADD('G', 175, -90),
        new actions.forces.ADD('I', 175, -90),
        new actions.forces.ADD('K', 175, -90)
      ]
      this.execute(actionsList)
    },

    // Joint Action Handlers
    // TODO Introduce SIDE EFFECTS where an action can return an action to be executed and stored with it in history. Question: Would side effects go before the action that spawned them or after? Maybe an option for both? How do I remove the members before the joint?
    aJointAdd (action) {
      const { point, type, id } = action
      if (id in this.structures.joints) {
        throw new actionErrors.Failed(action.constructor.name, 'Joint ID already exists')
      }
      Vue.set(this.structures.joints, id, new Joint(point, type))
      this.structures.members.addJoint(id)
    },
    aJointRemove (action) {
      const { point, type, id } = action
      if (!(id in this.structures.joints)) {
        throw new actionErrors.Failed(action.constructor.name, 'Joint ID not in joints')
      }
      const { pos: jointPos, type: jointType } = this.structures.joints[id]
      if (jointPos[0] !== point[0] || jointPos[1] !== point[1]) {
        throw new actionErrors.Failed(action.constructor.name, `Joint position [${jointPos[0]}, ${jointPos[1]}] does not match remove location [${point[0]}, ${point[1]}]`)
      }
      if (jointType !== type) {
        throw new actionErrors.Failed(action.constructor.name, `Joint type ${jointType} does not match remove type ${type}`)
      }
      // TODO: Systematically remove all members from this joint so that it can be undone gracefully. Oh also deselect. And now that I think of it, this needs to be down before the action exeution starts
      Vue.delete(this.structures.joints, id)
      const selectedIndex = this.selections.joints.indexOf(id)
      if (selectedIndex > -1) {
        this.selections.joints.splice(selectedIndex, 1)
      }
      this.structures.members.removeJoint(id)
    },
    aJointMove (action) {
      const { displacement, id } = action
      if (!(id in this.structures.joints)) {
        throw new actionErrors.Failed(action.constructor.name, 'Joint ID not in joints')
      }
      const { pos } = this.structures.joints[id]
      pos[0] += displacement[0]
      pos[1] += displacement[1]
    },
    aJointSetType (action) {
      const { id, oldType, newType } = action
      if (!(id in this.structures.joints)) {
        throw new actionErrors.Failed(action.constructor.name, 'Joint ID not in joints')
      }
      const { type } = this.structures.joints[id]
      if (type !== oldType) {
        throw new actionErrors.Failed(action.constructor.name, `Old type ${oldType} does not match joint type ${type}`)
      }
      this.structures.joints[id].type = newType
    },

    // Member Action Handlers
    aMemberAdd (action) {
      const { jointOne, jointTwo, linearArea } = action
      if (!(jointOne in this.structures.joints)) {
        throw new actionErrors.Failed(action.constructor.name, `Joint ${jointOne} not in joints`)
      }
      if (!(jointTwo in this.structures.joints)) {
        throw new actionErrors.Failed(action.constructor.name, `Joint ${jointTwo} not in joints`)
      }
      // Then we have two joints that we can connect. Let's create a member
      this.structures.members.addMember(jointOne, jointTwo)
    },
    aMemberRemove (action) {
      const { jointOne, jointTwo, linearArea } = action
      if (!(jointOne in this.structures.joints)) {
        throw new actionErrors.Failed(action.constructor.name, `Joint ${jointOne} not in joints`)
      }
      if (!(jointTwo in this.structures.joints)) {
        throw new actionErrors.Failed(action.constructor.name, `Joint ${jointTwo} not in joints`)
      }
      // Then we have two joints that may or may not be connected. Let's remove it if it exists
      this.structures.members.removeMember(jointOne, jointTwo)
    },
    aMemberSetLinArea (action) {
      console.log('MEMBER LINEAR AREA NOT IMPLEMENTED')
    },

    aForceAdd (action) {
      const { jointId, magnitude, direction } = action
      if (jointId in this.structures.loads) {
        console.log('Force already exists')
        throw new actionErrors.Failed(action.constructor.name, 'Joint already has a force on it')
      }
      Vue.set(this.structures.loads, jointId, new Force(direction, magnitude))
    },
    aForceRemove (action) {
      const { jointId, magnitude, direction } = action
      if (!(jointId in this.structures.loads)) {
        throw new actionErrors.Failed(action.constructor.name, 'Force does not exist')
      }
      const force = this.structures.loads[jointId]
      if (force.magnitude !== magnitude || force.direction !== direction) {
        throw new actionErrors.Failed(action.constructor.name, 'Force has incorrect magnitude or direction')
      }
      Vue.delete(this.structures.loads, jointId)
    },
    aForceSetMag (action) {
      const { jointId, oldMag, newMag } = action
      if (!(jointId in this.structures.loads)) {
        throw new actionErrors.Failed(action.constructor.name, 'Force does not exist')
      }
      const force = this.structures.loads[jointId]
      if (force.magnitude !== oldMag) {
        throw new actionErrors.Failed(action.constructor.name, 'Force has incorrect old magnitude')
      }
      Vue.set(this.structures.loads, jointId, new Force(force.direction, newMag))
    },
    aForceSetDir (action) {
      const { jointId, oldDir, newDir } = action
      if (!(jointId in this.structures.loads)) {
        throw new actionErrors.Failed(action.constructor.name, 'Force does not exist')
      }
      const force = this.structures.loads[jointId]
      if (force.direction !== oldDir) {
        throw new actionErrors.Failed(action.constructor.name, 'Force has incorrect old direction')
      }
      Vue.set(this.structures.loads, jointId, new Force(newDir, force.magnitude))
    },

    // Selection Action Handlers
    aSelect (action) {
      const { ids } = action
      for (const id of ids) {
        const index = this.selections.joints.indexOf(id)
        if (index > -1) {
          this.selections.joints.splice(index, 1)
        }
        this.selections.joints.push(id)
      }
    },
    aDeselect (action) {
      const { ids } = action
      for (const id of ids) {
        const index = this.selections.joints.indexOf(id)
        if (index > -1) {
          this.selections.joints.splice(index, 1)
        }
      }
    },
    aCopy (action) {
      console.log('COPY NOT IMPLEMENTED')
    },

    // Setup Functions
    addEventListeners (div) {
      window.addEventListener('resize', () => {
        this.fitPixiCanvas(div)
      })

      window.addEventListener('keyup', e => {
        const index = this.interactions.heldKeys.indexOf(e.code)
        if (index > -1) {
          this.interactions.heldKeys.splice(index, 1)
        }
      })

      window.addEventListener('keydown', e => {
        if (this.interactions.heldKeys.indexOf(e.code) === -1) {
          this.interactions.heldKeys.push(e.code)
        }
        return this.onKeyDown(e)
      })

      this.pixi.app.view.addEventListener('wheel', e => {
        // TODO: Make this zoom at the center of the screen instead of [0, 0]
        this.visuals.scale -= e.deltaY / 2
        e.preventDefault()
        return false
      })

      this.pixi.app.view.addEventListener('mousemove', e => {
        const { movementX: dx, movementY: dy } = e
        const { layerX: x, layerY: y } = e
        this.onMouseMove([dx, dy], [x, y])
      })

      this.pixi.app.renderer.plugins.interaction.on('mousedown', e => this.onMouseDown(e, false))
      this.pixi.app.renderer.plugins.interaction.on('mouseup', e => this.onMouseUp(e, false))
      this.pixi.app.renderer.plugins.interaction.on('rightdown', e => this.onMouseDown(e, true))
      this.pixi.app.renderer.plugins.interaction.on('rightup', e => this.onMouseUp(e, true))
    },
    onKeyDown (e) {
      const callbacks = this.interactions.callbacks
      const { code } = e
      try {
        let prevent = false
        const keyCallbacks = callbacks[this.mode][this.interactions.placeType][interactionType.KEYPRESS]
        for (const { keyFilter, callback } of keyCallbacks) {
          if (!keyFilter || keyFilter.indexOf(code) > -1) {
            callback({ keyCode: code, mousePoint: this.mousePoint, dragStart: this.interactions.dragStart })
            prevent = true
          }
        }
        if (prevent) {
          e.preventDefault()
          return false
        }
      } catch (err) {
        if (!(err instanceof TypeError)) {
          // Then this was a problem where a callback did not exist
          throw err
        }
      }
      return true
    },
    onMouseDown (e, rightButton) {
      const callbacks = this.interactions.callbacks
      this.interactions.dragging = false
      this.interactions.dragStart = this.mousePoint
      if (rightButton) {
        this.interactions.rightMouseDown = true
      } else {
        this.interactions.leftMouseDown = true
      }
      try {
        const interType = rightButton ? interactionType.RIGHTCLICKDOWN : interactionType.LEFTCLICKDOWN
        for (const { keyFilter, callback } of callbacks[this.mode][this.interactions.placeType][interType]) {
          callback({ keyCode: undefined, mousePoint: this.mousePoint, dragStart: this.interactions.dragStart })
        }
      } catch (err) {
        if (!(err instanceof TypeError)) {
          // Then this was a problem where a callback did not exist
          throw err
        }
      }
    },
    onMouseUp (e, rightButton) {
      const callbacks = this.interactions.callbacks
      const dragEnd = this.mousePoint
      try {
        let interType
        if (this.interactions.dragging) {
          interType = rightButton ? interactionType.RIGHTDRAGUP : interactionType.LEFTDRAGUP
        } else {
          interType = rightButton ? interactionType.RIGHTCLICK : interactionType.LEFTCLICK
        }
        const upCallbacks = callbacks[this.mode][this.interactions.placeType][interType]
        for (const { keyFilter, callback } of upCallbacks) {
          callback({ keyCode: undefined, mousePoint: this.mousePoint, dragStart: this.interactions.dragStart })
        }
      } catch (err) {
        if (!(err instanceof TypeError)) {
          // Then this was a problem where a callback did not exist
          throw err
        }
      }
      if (rightButton) {
        this.interactions.rightMouseDown = false
      } else {
        this.interactions.leftMouseDown = false
      }
      // TODO: Maybe change this so it only makes dragging false if both mouse sides are up
      this.interactions.dragging = false
    },
    onMouseMove ([dx, dy], [x, y]) {
      const callbacks = this.interactions.callbacks
      this.interactions.mousePos = [x, y]
      if (this.interactions.leftMouseDown || this.interactions.rightMouseDown) {
        const dSqr = (this.mousePoint[0] - this.interactions.dragStart[0]) ** 2 + (this.mousePoint[1] - this.interactions.dragStart[1]) ** 2
        if (dSqr > 0.01) {
          this.interactions.dragging = true
        }
      }
      const { dragging } = this.interactions
      try {
        if (dragging) {
          if (this.interactions.leftMouseDown) {
            for (const { keyFilter, callback } of callbacks[this.mode][this.interactions.placeType][interactionType.LEFTDRAG]) {
              callback({ keyCode: undefined, mousePoint: this.mousePoint, dragStart: this.interactions.dragStart, delta: [dx, dy] })
            }
          }
          if (this.interactions.rightMouseDown) {
            for (const { keyFilter, callback } of callbacks[this.mode][this.interactions.placeType][interactionType.RIGHTDRAG]) {
              callback({ keyCode: undefined, mousePoint: this.mousePoint, dragStart: this.interactions.dragStart, delta: [dx, dy] })
            }
          }
        }
      } catch (err) {
        if (!(err instanceof TypeError)) {
          throw err
        }
      }
    },
    addInteractionListeners () {
      this.on({ modes: mode.COMMAND, interactions: interactionType.KEYPRESS, keyFilter: ['KeyJ', 'KeyM', 'KeyF', 'KeyS'] }, ({ keyCode }) => {
        if (keyCode === 'KeyJ') {
          this.interactions.placeType = placeType.JOINT
        } else if (keyCode === 'KeyM') {
          this.interactions.placeType = placeType.MEMBER
        } else if (keyCode === 'KeyF') {
          this.interactions.placeType = placeType.FORCE
        } else if (keyCode === 'KeyS') {
          this.interactions.placeType = placeType.SELECTING
        }
        this.onAllDeselected()
      })
      this.on({ modes: mode.COMMAND, interactions: interactionType.KEYPRESS, keyFilter: ['KeyE'] }, ({ keyCode }) => {
        this.getInternalForces()
      })
      this.on({ modes: mode.COMMAND, interactions: interactionType.KEYPRESS, keyFilter: ['KeyZ'] }, () => {
        if (this.holdingKey('ShiftLeft')) {
          this.redo()
        } else {
          this.undo()
        }
      })
      this.on({ interactions: interactionType.RIGHTDRAG }, ({ delta }) => {
        this.visuals.viewX += delta[0]
        this.visuals.viewY += delta[1]
      })
      // When the user presses KeyR with selected joints, we remove those joints
      this.on({ modes: mode.PRIMARY, placetypes: [placeType.SELECTING, placeType.JOINT], interactions: interactionType.KEYPRESS, keyFilter: ['KeyR'] }, () => {
        this.removeSelectedJoints()
      })
      this.on({ modes: mode.PRIMARY, interactions: interactionType.KEYPRESS, keyFilter: ['Escape'] }, () => {
        this.onAllDeselected()
      })
      this.addSelectionListeners()
      this.addJointListeners()
      this.addMemberListeners()
      this.addForceListeners()
    },
    addSelectionListeners () {
      // When the user left clicks near a joint, we select it. If it is selected, we deselect it. If there is no near point, we deselect all.
      this.on({ modes: mode.PRIMARY, placetypes: placeType.SELECTING, interactions: interactionType.LEFTCLICK }, ({ mousePoint }) => {
        const selected = this.getClosestJoint(mousePoint, Object.keys(this.structures.joints), 1)
        if (!selected) {
          // Then the user clicked away from all points
          this.onAllDeselected()
        } else {
          // Then the user clicked on a joint. If it is already selected we remove it.
          this.onJointsSelected([selected], true)
        }
      })
      // When the user stopps dragging while selecting, we select all joints in the drag area
      this.on({ modes: mode.PRIMARY, placetypes: placeType.SELECTING, interactions: interactionType.LEFTDRAGUP }, ({ dragStart, mousePoint }) => {
        const selected = this.getJointsWithin(this.interactions.dragStart, this.mousePoint, Object.keys(this.structures.joints))
        this.onJointsSelected(selected)
        this.drawSelectionGraph()
      })
      // When the user drags while selecting, we draw a selection box
      this.on({ modes: mode.PRIMARY, placetypes: placeType.SELECTING, interactions: interactionType.LEFTDRAG }, ({ dragStart, mousePoint }) => {
        this.drawSelectionGraph(dragStart, mousePoint)
      })
    },
    addJointListeners () {
      // When the user left clicks, we palce a joint at the nearest grid mark. If there is already a joint there, select it. If it is already selected, deselect it.
      this.on({ modes: mode.PRIMARY, placetypes: placeType.JOINT, interactions: interactionType.LEFTCLICK }, ({ mousePoint }) => {
        const closest = this.getClosestJoint(mousePoint, Object.keys(this.structures.joints), 1)
        if (!closest) {
          this.addJoint(this.pointToNearest(mousePoint))
          return
        }
        if (this.selections.joints.indexOf(closest) > -1) {
          this.onJointsSelected([closest], true)
        } else {
          this.onMarchingSelect(closest, 1)
        }
      })
    },
    addMemberListeners () {
      // When the user left clicks, we do a marching select of size 2. If 2 are selected afterwards, we palce a member between them
      this.on({ modes: mode.PRIMARY, placetypes: placeType.MEMBER, interactions: interactionType.LEFTCLICK }, ({ mousePoint }) => {
        const closest = this.getClosestJoint(mousePoint, Object.keys(this.structures.joints), 1)
        if (closest) {
          if (this.selections.joints.indexOf(closest) > -1) {
            this.onJointsSelected([closest], true)
          } else {
            this.onMarchingSelect(closest, 2)
            if (this.selections.joints.length === 2) {
              this.addMember(this.selections.joints[0], this.selections.joints[1])
            }
          }
        } else {
          this.onAllDeselected()
        }
      })
      this.on({ modes: mode.PRIMARY, placetypes: placeType.MEMBER, interactions: interactionType.KEYPRESS, keyFilter: ['KeyR'] }, () => {
        if (this.selections.joints.length === 2) {
          this.removeMember(this.selections.joints[0], this.selections.joints[1])
        }
      })
    },
    addForceListeners () {
      this.on({ modes: mode.PRIMARY, placetypes: placeType.FORCE, interactions: interactionType.LEFTCLICK }, ({ mousePoint }) => {
        const closest = this.getClosestJoint(mousePoint, Object.keys(this.structures.joints), 1)
        if (closest) {
          if (this.selections.joints.indexOf(closest) > -1) {
            this.onJointsSelected([closest], true)
          } else {
            this.onMarchingSelect(closest, 1)
            if (!(closest in this.structures.loads)) {
              this.addForce(closest)
            }
          }
        } else {
          this.onAllDeselected()
        }
      })
      this.on({ modes: mode.PRIMARY, placetypes: placeType.FORCE, interactions: interactionType.KEYPRESS, keyFilter: ['KeyR'] }, () => {
        if (this.selections.joints.length > 0) {
          this.removeForce(this.selections.joints[0])
        }
      })
    },

    // New mouse interaction methods
    on ({ modes, placetypes, interactions, keyFilter }, callback) {
      // Adds an event listener for the given parameters
      // mode references the current mode
      // placetype reference the current placeType
      // interaction references the current interactionType
      // keyFilter allows keyboard interactions to be specified as certain keys. {filter: 'KeyD'} would only match when d is pressed.
      // callback is the function to be called when
      function toArray (obj) {
        if (Array.isArray(obj)) {
          return obj
        }
        return [obj]
      }
      modes = modes ? toArray(modes) : Object.values(mode)
      placetypes = placetypes ? toArray(placetypes) : Object.values(placeType)
      interactions = interactions ? toArray(interactions) : Object.values(interactionType)
      const keyFilters = keyFilter ? toArray(keyFilter) : null
      for (const mode of modes) {
        for (const placetype of placetypes) {
          for (const interaction of interactions) {
            this.onHelper(mode, placetype, interaction, keyFilter, callback)
          }
        }
      }
    },
    onHelper (mode, placetype, interaction, keyFilter, callback) {
      const callbacks = this.interactions.callbacks
      callbacks[mode] = callbacks[mode] || {}
      callbacks[mode][placetype] = callbacks[mode][placetype] || {}
      callbacks[mode][placetype][interaction] = callbacks[mode][placetype][interaction] || []
      this.interactions.callbacks[mode][placetype][interaction].push({ keyFilter, callback })
    },

    // Helpers for selecting
    onJointsSelected (joints, deselect = false) {
      const { joints: currentSelection } = this.selections
      const toSelect = []
      const toDeselect = []
      for (const joint of joints) {
        if (currentSelection.indexOf(joint) > -1 && deselect) {
          toDeselect.push(joint)
        } else {
          toSelect.push(joint)
        }
      }
      this.execute([
        new actions.select.SELECT(toSelect),
        new actions.select.DESELECT(toDeselect)
      ])
    },
    onMarchingSelect (joint, size = 2) {
      // Makes the selection act as a queue with max length = {{ size }}
      const { joints: currentSelection } = this.selections
      const toRemove = Math.max(0, currentSelection.length - size + 1)
      const removedJoints = currentSelection.slice(0, toRemove)
      this.execute([
        new actions.select.DESELECT(removedJoints),
        new actions.select.SELECT([joint])
      ])
    },
    onAllDeselected () {
      const { joints: currentSelection } = this.selections
      if (currentSelection.length > 0) {
        this.execute(new actions.select.DESELECT(currentSelection))
      }
    },

    // Render Methods
    setupChildren () {
      const { background, bridge, backgroundGraph, selectionGraph, jointGraph, memberGraph, loadsGraph, app } = this.pixi
      background.addChild(backgroundGraph)
      background.addChild(selectionGraph)
      app.stage.addChild(background)

      bridge.addChild(memberGraph)
      bridge.addChild(loadsGraph)
      bridge.addChild(jointGraph)
      app.stage.addChild(bridge)
    },
    fitPixiCanvas (div) {
      const { app } = this.pixi
      this.visuals.width = div.clientWidth
      this.visuals.height = div.clientHeight
      app.renderer.autoResize = true
      app.renderer.resize(this.visuals.width, this.visuals.height)
    },

    redraw () {
      this.drawBackground()
      this.drawBridge()
    },
    drawBridge () {
      this.drawMemberGraph()
      this.drawLoadsGraph()
      this.drawJointGraph()
    },
    drawBackground () {
      this.drawBackgroundGraph()
      this.drawSelectionGraph()
    },
    drawJointGraph () {
      // Renders the joints based of off the structures.joints object
      const { jointGraph } = this.pixi
      jointGraph.clear()

      /* eslint-disable no-unused-vars */
      for (const [id, joint] of Object.entries(this.structures.joints)) {
        // I might render the ID as well so I am including it
        const [x, y] = this.pointToPix(joint.pos)
        const type = joint.type
        if (this.selections.joints.indexOf(id) > -1) {
          jointGraph.beginFill(0x2ecc71)
          jointGraph.drawCircle(x, y, this.jointRadius)
          jointGraph.endFill()
        } else {
          jointGraph.beginFill(0xf39c12)
          jointGraph.drawCircle(x, y, this.jointRadius)
          jointGraph.endFill()
        }
        if (type === jointType.PIN) {
          jointGraph.beginFill(0x000000)
          jointGraph.drawCircle(x, y, this.jointRadius / 2)
          jointGraph.endFill()
        }
      }
      /* eslint-enable no-unused-vars */
    },
    drawMemberGraph () {
      // Renders the members based of off the structures.members graph
      const { memberGraph } = this.pixi
      const { members } = this.structures
      memberGraph.clear()

      for (const [idOne, idTwo] of members.getAllMembers()) {
        const jointOne = this.structures.joints[idOne]
        const jointTwo = this.structures.joints[idTwo]

        const [x1, y1] = this.pointToPix(jointOne.pos)
        const [x2, y2] = this.pointToPix(jointTwo.pos)

        if (this.selections.joints.indexOf(idOne) > -1 && this.selections.joints.indexOf(idTwo) > -1) {
          // Then both joints are selected and the member should be selected
          memberGraph.lineStyle(this.jointRadius / 2, 0x2ecc71, 1)
        } else {
          memberGraph.lineStyle(this.jointRadius / 2, 0x1abc9c, 1)
        }
        memberGraph.moveTo(x1, y1)
        memberGraph.lineTo(x2, y2)
      }
    },
    drawLoadsGraph () {
      // Renders the loads based of off the structures.loads graph
      const { loadsGraph } = this.pixi
      const { loads } = this.structures
      loadsGraph.clear()

      const magnitudes = Object.values(loads).map(force => force.magnitude)
      const maxMag = Math.max(...magnitudes)
      const minMag = Math.min(...magnitudes)
      const maxDist = this.jointRadius * 6
      const minDist = this.jointRadius * 3
      const flangeLength = this.jointRadius
      function getLength (force) {
        if (magnitudes.length < 2 || maxMag === minMag) {
          return (maxDist + minDist) / 2
        }
        const mag = force.magnitude
        // Linearly interpolate between maxMag and minMag and self.radius * 1.2 and self.radius * 2.5
        return (((mag - minMag) / (maxMag - minMag)) * (maxDist - minDist)) + minDist
      }
      function flangeEnd (direction, startX, startY) {
        const dx = flangeLength * Math.cos(direction * (Math.PI / 180))
        const dy = -1 * flangeLength * Math.sin(direction * (Math.PI / 180))
        const flangeX = startX + dx
        const flangeY = startY + dy
        return [flangeX, flangeY]
      }

      for (const [jointId, force] of Object.entries(loads)) {
        if (this.selections.joints.indexOf(jointId) > -1) {
          loadsGraph.lineStyle(this.jointRadius / 4, 0x2ecc71, 1)
        } else {
          loadsGraph.lineStyle(this.jointRadius / 4, 0x8e44ad, 1)
        }
        const joint = this.structures.joints[jointId]

        const [x, y] = this.pointToPix(joint.pos)
        const length = getLength(force)
        const dx = length * Math.cos(force.direction * (Math.PI / 180))
        const dy = -1 * length * Math.sin(force.direction * (Math.PI / 180))

        const endX = x + dx
        const endY = y + dy

        loadsGraph.moveTo(x, y)
        loadsGraph.lineTo(endX, endY)

        const flangeOneDir = force.direction - 40 + 180
        const flangeTwoDir = force.direction + 40 + 180

        const [flangeOneX, flangeOneY] = flangeEnd(flangeOneDir, endX, endY)
        const [flangeTwoX, flangeTwoY] = flangeEnd(flangeTwoDir, endX, endY)

        loadsGraph.moveTo(endX, endY)
        loadsGraph.lineTo(flangeOneX, flangeOneY)
        loadsGraph.moveTo(endX, endY)
        loadsGraph.lineTo(flangeTwoX, flangeTwoY)
      }
    },
    drawBackgroundGraph () {
      const { backgroundGraph } = this.pixi
      const { height, width, scale, ySep, xSep, viewX, viewY } = this.visuals
      // Renders the background grid based of off the x and y sep values
      backgroundGraph.clear()
      // These define how many tick marks it will take to grid the screen
      const numHoriz = Math.ceil(height / (scale * ySep)) + 2
      const numVert = Math.ceil(width / (scale * xSep)) + 2
      backgroundGraph.lineStyle(1, 0x95a5a6, 1)

      for (let i = -1 * Math.floor(numHoriz / 2 + viewY / (scale * ySep)); i < Math.ceil(numHoriz / 2 - viewY / (scale * ySep)); i++) {
        // i will go from the negative highest grid number value to the positive lowest grid number. Now we need to go from number of pixel.
        const yVal = i * scale * ySep
        backgroundGraph.moveTo(-1 * width - viewX, yVal)
        backgroundGraph.lineTo(width - viewX, yVal)
      }

      for (let i = -1 * Math.floor(numVert / 2 + viewX / (scale * xSep)); i < Math.ceil(numVert / 2 - viewX / (scale * xSep)); i++) {
        // i will go from the negative highest grid number value to the positive lowest grid number. Now we need to go from number of pixel.
        const xVal = i * scale * xSep
        backgroundGraph.moveTo(xVal, -1 * height - viewY)
        backgroundGraph.lineTo(xVal, height - viewY)
      }
    },
    drawSelectionGraph (pointOne, pointTwo) {
      // Renders the selection box based off of interactions.dragStart and the interactions.mousePos
      const { selectionGraph } = this.pixi
      const { dragging } = this.interactions

      selectionGraph.clear()
      selectionGraph.beginFill(0x3498db)
      selectionGraph.lineStyle(1, 0x2980b9, 1)
      selectionGraph.alpha = 0.4

      if (pointOne && pointTwo && this.mode === mode.PRIMARY && dragging) {
        // Then we are in box selection mode and should draw a rectangle
        const p1 = this.pointToPix(pointOne)
        const p2 = this.pointToPix(pointTwo)
        selectionGraph.drawRect(p1[0], p1[1], p2[0] - p1[0], p2[1] - p1[1])
        selectionGraph.endFill()
      }

      selectionGraph.endFill()
    },

    // These functions take us between the point coordiante frame and pixel coordinate frame. They are confusing and I just wrote them by trial and error. Who wants to do math?
    pointToNearest ([x, y]) {
      // "Rounds" the point to the nearest tick mark.
      const { xSep, ySep } = this.visuals
      return [Math.round(x / xSep) * xSep, Math.round(y / ySep) * ySep]
    },
    pixToPoint ([pixX, pixY], toNearest = false) {
      // Outputs the point cooresponding to the pixel values. toNearest rounds for convenience.
      const { width, height, viewX, viewY, scale } = this.visuals
      return [(pixX - width / 2 - viewX) / scale, -1 * (pixY - height / 2 - viewY) / scale]
    },
    pointToPix ([x, y]) {
      // Outputs the pixel values cooresponding to the point.
      return [x * this.visuals.scale, -1 * y * this.visuals.scale]
    },

    // These help simplify keyboard interaction
    holdingKey (code) {
      return this.interactions.heldKeys.indexOf(code) > -1
    },

    // These function allow for interaction with joints, members, and forces
    getClosestJoint (point, possibleJoints, maxPointDist = 1) {
      if (possibleJoints.length < 1) {
        return false
      }
      function isCloser (jointOneArr, jointTwoArr) {
        const d1 = (jointOneArr[1].pos[0] - point[0]) ** 2 + (jointOneArr[1].pos[1] - point[1]) ** 2
        const d2 = (jointTwoArr[1].pos[0] - point[0]) ** 2 + (jointTwoArr[1].pos[1] - point[1]) ** 2
        return d1 < d2 ? jointOneArr : jointTwoArr
      }
      const [closestId, closest] = possibleJoints.map(id => [id, this.structures.joints[id]]).reduce(isCloser)
      const dist = (closest.pos[0] - point[0]) ** 2 + (closest.pos[1] - point[1]) ** 2
      if (maxPointDist !== -1 && maxPointDist ** 2 < dist) {
        return false
      }
      return closestId
    },
    getJointsWithin (posOne, posTwo, possibleJoints) {
      // Finds joints that fall into the rectangle defined by posOne and posTwo
      const joints = []
      const minX = Math.min(posOne[0], posTwo[0])
      const maxX = Math.max(posOne[0], posTwo[0])
      const minY = Math.min(posOne[1], posTwo[1])
      const maxY = Math.max(posOne[1], posTwo[1])

      for (const jointId of possibleJoints) {
        const pos = this.structures.joints[jointId].pos
        if (pos[0] >= minX && pos[0] <= maxX && pos[1] >= minY && pos[1] <= maxY) {
          joints.push(jointId)
        }
      }

      return joints
    },

    getNextJointId () {
      // Ids go A->B->C->...->Z->AA->...->AZ->BA->...->BZ->...
      // It doesn't actually do that but I can't be bothered to write a function that works right now. TODO!!!
      if (this.jointIds.length === 0) {
        return 'A'
      }
      function compare (idOne, idTwo) {
        const lenDiff = idTwo.length - idOne.length
        if (lenDiff !== 0) {
          return lenDiff
        } else {
          return idTwo.charCodeAt(idTwo.length - 1) - idOne.charCodeAt(idOne.length - 1)
        }
      }
      const lastId = this.jointIds.sort(compare)[0]
      const lastChar = lastId.charCodeAt(lastId.length - 1)
      if (lastChar >= 90) {
        return `${lastId.substring(0, lastId.length - 1)}AA`
      } else {
        return `${lastId.substring(0, lastId.length - 1)}${String.fromCharCode(lastChar + 1)}`
      }
    },
    addJoint (point, idRequest) {
      const closest = this.getClosestJoint(point, this.jointIds)
      if (closest) {
        const joint = this.structures.joints[closest]
        if (joint.pos[0] === point[0] && joint.pos[1] === point[1]) {
          // This joint already exists
          this.execute(new actions.joints.REMOVE(point, closest, joint.type))
          return false
        }
      }
      const nextId = idRequest || this.getNextJointId()
      if (this.jointIds.indexOf(nextId) > -1) {
        // Then we can't make a new joint with this id. TODO: Maybe make this throw an error.
        return false
      }
      this.execute(new actions.joints.ADD(point, nextId, jointType.FLOATING))
    },
    removeSelectedJoints () {
      if (this.selections.joints.length > 0) {
        const currActions = []
        // Removing a joint is pretty complicated. We need to do all the actions so they are reversible so we deselect all nodes, remove all force and members, then remove the joint
        currActions.push(new actions.select.DESELECT(this.selections.joints))
        const existingLoads = this.selections.joints.map(id => id in this.structures.loads ? { id, force: this.structures.loads[id] } : false).filter(value => value)
        for (const { id, force } of existingLoads) {
          const { magnitude, direction } = force
          currActions.push(new actions.forces.REMOVE(id, magnitude, direction))
        }
        const existingMembers = this.structures.members.getAllMembers(this.selections.joints)
        for (const member of existingMembers) {
          currActions.push(new actions.members.REMOVE(member[0], member[1]))
        }
        for (const jointId of this.selections.joints) {
          const joint = this.structures.joints[jointId]
          currActions.push(new actions.joints.REMOVE(joint.pos, jointId, joint.type))
        }
        this.execute(currActions)
      }
    },
    setSelectedJointType (type) {
      const currActions = []
      for (const jointId of this.selections.joints) {
        const joint = this.structures.joints[jointId]
        currActions.push(new actions.joints.SETTYPE(jointId, joint.type, type))
      }
      this.execute(currActions)
    },

    addMember (jointOne, jointTwo) {
      this.execute(new actions.members.ADD(jointOne, jointTwo))
    },
    removeMember (jointOne, jointTwo) {
      this.execute(new actions.members.REMOVE(jointOne, jointTwo))
    },
    removeSelectedMembers () {
      const currActions = []
      for (const member of this.selectedMembers) {
        currActions.push(new actions.members.REMOVE(member[0], member[1]))
      }
      this.execute(currActions)
    },

    addForce (joint) {
      this.execute(new actions.forces.ADD(joint, 1, -90))
    },
    removeForce (joint) {
      if (!(joint in this.structures.loads)) {
        return false
      }
      const force = this.structures.loads[joint]
      const { magnitude, direction } = force
      this.execute(new actions.forces.REMOVE(joint, magnitude, direction))
    },
    removeSelectedForces () {
      const currActions = []
      for (const [jointId, force] of Object.entries(this.selectedForces)) {
        currActions.push(new actions.forces.REMOVE(jointId, force.magnitude, force.direction))
      }
      this.execute(currActions)
    },
    setSelectedForceMagnitude (magnitude) {
      if (isNaN(magnitude)) {
        return false
      }
      magnitude = parseFloat(magnitude)
      const currActions = []
      for (const [jointId, force] of Object.entries(this.selectedForces)) {
        currActions.push(new actions.forces.SETMAG(jointId, force.magnitude, magnitude))
      }
      this.execute(currActions)
    },
    setSelectedForceDirection (direction) {
      if (isNaN(direction)) {
        return false
      }
      direction = parseFloat(direction)
      const currActions = []
      for (const [jointId, force] of Object.entries(this.selectedForces)) {
        currActions.push(new actions.forces.SETDIR(jointId, force.direction, direction))
      }
      this.execute(currActions)
    },

    toSlideRule (num) {
      if (num === 0) {
        return 0
      }
      const shifted = num * 10 ** (Math.ceil(Math.log10(1 / num)))
      const prec = Math.floor(shifted) === 1 ? 4 : 3
      return parseFloat(num.toPrecision(prec))
    },
    forceComponentMatrix (unknowns, joints) {
      // Gets the matrix of force components cooresponding to the linear equations for x and y static structure
      const matrixSize = [2 * joints.length, unknowns.length]
      const matrix = new Array(matrixSize[0]).fill(0).map(a => new Array(matrixSize[1]).fill(0))
      for (let i = 0; i < unknowns.length; i++) {
        // This tells us which joints are connected by the member. We then compute the components of each.
        const unknown = unknowns[i]
        const jointOne = this.structures.joints[unknown[0]]
        const jointTwo = this.structures.joints[unknown[1]]
        const displacement = [jointTwo.pos[0] - jointOne.pos[0], jointTwo.pos[1] - jointOne.pos[1]]
        const length = Math.sqrt(displacement[0] ** 2 + displacement[1] ** 2)
        const xComponent = displacement[0] / length
        const yComponent = displacement[1] / length
        for (const unkownJoint of unknown) {
          // Place the components in the correct location with the correct factor
          const factor = unknown.indexOf(unkownJoint) === 0 ? 1 : -1
          const jointIndex = joints.indexOf(unkownJoint)
          const xComponentLocation = [2 * jointIndex + 1, i]
          const yComponentLocation = [2 * jointIndex, i]
          matrix[xComponentLocation[0]][xComponentLocation[1]] = xComponent * factor
          matrix[yComponentLocation[0]][yComponentLocation[1]] = yComponent * factor
        }
      }
      return matrix
    },
    computeReactionForce (referenceJoint, reactionJoint) {
      // We have to iterate over all forces and sum their moments then divide by the distance to the reaction joint.
      // The reaction joint always provides a force to counter all bridge movement.
      // TODO: MAKE THIS WORK WITH HORIZONTAL NET FORCES
      let totalMoment = 0
      const reference = this.structures.joints[referenceJoint]
      const loads = this.structures.loads
      for (const [jointId, force] of Object.entries(loads)) {
        const joint = this.structures.joints[jointId]
        const delta = [joint.pos[0] - reference.pos[0], joint.pos[1] - reference.pos[1]]
        const mag = force.magnitude
        const dir = force.direction * (Math.PI / 180)
        const distance = Math.sqrt(delta[0] ** 2 + delta[1] ** 2)
        const angleDiff = dir - Math.atan2(delta[1], delta[0])
        totalMoment += mag * distance * Math.sin(angleDiff)
      }
      const reaction = this.structures.joints[reactionJoint]
      const reactionDisplacement = [reaction.pos[0] - reference.pos[0], reaction.pos[1] - reference.pos[1]]
      // Since we are currently assuming the reaction force is directly up, lets just take a shortcut and use F*(delta[0])=M
      const reactionForce = totalMoment / reactionDisplacement[0]
      return new Force(90, -1 * reactionForce)
    },
    computeReactionForces () {
      const pinnedJoints = Object.fromEntries(Object.entries(this.structures.joints).filter(([id, joint]) => joint.type === jointType.PIN))
      if (Object.keys(pinnedJoints).length !== 2) {
        throw new Error('Incorrect number of pinned joints')
      }
      const res = {}
      res[Object.keys(pinnedJoints)[1]] = this.computeReactionForce(...Object.keys(pinnedJoints))
      res[Object.keys(pinnedJoints).reverse()[1]] = this.computeReactionForce(...Object.keys(pinnedJoints).reverse())
      return res
    },
    forceSolutionVector (joints) {
      const reactionForces = this.computeReactionForces()
      const solutions = new Array(joints.length * 2).fill(0)
      for (let i = 0; i < joints.length; i++) {
        const jointId = joints[i]
        // Note that force components should go y then x
        if (jointId in reactionForces) {
          const force = reactionForces[jointId]
          solutions[2 * i] -= force.yComponent
          solutions[2 * i + 1] -= force.xComponent
        }
        if (jointId in this.structures.loads) {
          const force = this.structures.loads[jointId]
          solutions[2 * i] -= force.yComponent
          solutions[2 * i + 1] -= force.xComponent
        }
      }
      return solutions
    },
    getInternalForces () {
      if (this.calculatedFailed) {
        return
      }
      const members = this.structures.members.getAllMembers()
      const joints = Object.keys(this.structures.joints)
      const componentMatrix = this.forceComponentMatrix(members, joints)
      let solutionVector
      try {
        solutionVector = this.forceSolutionVector(joints)
      } catch (err) {
        this.onCalculateFailed()
        return
      }
      const solution = linear.solve(componentMatrix, solutionVector)
      const forces = {}
      for (let i = 0; i < members.length; i++) {
        forces[`${members[i][0]}-${members[i][1]}`] = this.toSlideRule(Math.round(solution[i] * 100000) / 100000)
      }
      this.structures.internalForces = forces
      this.showingResults = true
      this.copied = false
      return forces
    },
    onCalculateFailed () {
      this.calculatedFailed = true
      setTimeout(() => {
        this.calculatedFailed = false
      }, 2000)
    },

    // Helpers for exporting and importing
    fromQueryString () {
      // testUrl: localhost:8080/trusstwo?joints=[["A",[-1,0],1],["B",[0,2]],["C",[1,0],1]]&members=[["A","B"],["B","C"]]&forces=[["B",175,-90]]
      const { joints, members, forces } = this.$route.query
      const actionArr = []
      try {
        const jointArr = JSON.parse(joints)
        for (const [id, location, isPin] of jointArr) {
          actionArr.push(new actions.joints.ADD(location, id, isPin ? jointType.PIN : jointType.FLOATING))
        }
      } catch (err) { }
      try {
        const memberArr = JSON.parse(members)
        for (const member of memberArr) {
          actionArr.push(new actions.members.ADD(member[0], member[1]))
        }
      } catch (err) { }
      try {
        const forcesArr = JSON.parse(forces)
        for (const force of forcesArr) {
          actionArr.push(new actions.forces.ADD(force[0], force[1], force[2]))
        }
      } catch (err) { }
      this.execute(actionArr)
    },
    async toQueryString () {
      const { joints, members, forces } = this.exportJSON()
      try {
        await this.$router.replace({ name: 'Trusses', query: { joints: JSON.stringify(joints), members: JSON.stringify(members), forces: JSON.stringify(forces) } })
      } catch (err) { }
    },
    exportJSON () {
      const joints = Object.entries(this.structures.joints).map(([id, joint]) => [id, joint.pos, joint.type === jointType.PIN ? 1 : undefined])
      const members = this.structures.members.getAllMembers()
      const forces = Object.entries(this.structures.loads).map(([id, force]) => [id, force.magnitude, force.direction])
      return { joints, members, forces }
    }
  }
}
/* eslint-disable no-unused-vars */
</script>

<style lang="scss" scoped>
.builder {
  width: 100%;
  height: 100%;
  position: relative;
  color: #ecf0f1;

  .toolbar {
    top: 10px;
    left: 10px;
    background: none;
    position: absolute;
    pointer-events: none;
    text-align: left;

    * {
      pointer-events: auto;
    }

    .input-toolbar {
      max-width: 12em;
      flex-wrap: nowrap;
    }

    .tick-input {
      max-width: 17em;
    }
  }
}
</style>
