<template>
  <div class='builder' ref='builder' oncontextmenu="return false;">
    <!-- TODO: Add a toolbar to go above the canvas -->
  </div>
</template>

<script>
/* eslint-disable no-unused-vars */
import Vue from 'vue'
import { mode, placeType, interactionType, unit, jointType, Joint, Force, MemberGraph, actions, actionTypes, actionErrors, sleep } from '@/assets/utils'
import * as PIXI from 'pixi.js'
const { Application, Container, Graphics } = PIXI

export default {
  name: 'Build',
  data: () => ({
    history: [],
    undoneActions: [],
    visuals: { // When any of the visuals update, the whole image should be redrawn
      width: 0,
      height: 0,
      scale: 50, // Pixels per unit of measurement.
      units: unit.METERS,
      ySep: 1.5, // These define how many units are between each background tick
      xSep: 1,
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
    await this.testAdd()

    this.addInteractionListeners()
  },
  methods: {
    // There are three major method types, Action methods, Interaction methods, and Helper methods.
    // Action methods: These are the handlers for actions and act using helpers to directly modify the scene
    // Interaction methods: These add and execute event callbacks for interactions such as drags, mouse clicks, and key presses. These evetually create and execute action objects.
    // Helper methods: These are used by both action and interaction methods to reduce the amount of code in each callback. They modify component data, parse component data, and create actions out of parameters.

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
        } else if (action instanceof actions.force.SETDIR) {
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
      this.execute(new actions.joints.ADD([-1, 0], 'X', jointType.FLOATING))
      this.execute(new actions.joints.ADD([0, 2], 'Y', jointType.FLOATING))
      this.execute(new actions.joints.ADD([1, 0], 'Z', jointType.FLOATING))
      this.execute(new actions.members.ADD('X', 'Y'))
      this.execute(new actions.members.ADD('Y', 'Z'))
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
        // this.onKeyDown(e.code)
        return this.onKeyDownV2(e)
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
        // this.onMove([dx, dy], [x, y])
        this.onMouseMoveV2([dx, dy], [x, y])
      })

      this.pixi.app.renderer.plugins.interaction.on('mousedown', e => {
        // this.onMouseDown(e, false)
        this.onMouseDownV2(e, false)
      })
      this.pixi.app.renderer.plugins.interaction.on('mouseup', e => {
        // this.onMouseUp(e, false)
        this.onMouseUpV2(e, false)
      })
      this.pixi.app.renderer.plugins.interaction.on('rightdown', e => {
        // this.onMouseDown(e, true)
        this.onMouseDownV2(e, true)
      })
      this.pixi.app.renderer.plugins.interaction.on('rightup', e => {
        // this.onMouseUp(e, true)
        this.onMouseUpV2(e, true)
      })
    },
    onKeyDown (code) {
      if (this.mode === mode.PRIMARY) {
        if (code === 'Backspace') {
          this.removeSelectedJoints()
        }
      } else if (this.mode === mode.SECONDARY) {
      } else if (this.mode === mode.COMMAND) {
        if (code === 'KeyZ') {
          if (this.holdingKey('ShiftLeft')) {
            this.redo()
          } else {
            this.undo()
          }
        }
      }
    },
    onMouseDown (e, rightButton) {
      // To keep consistent structure, we order our if statments as 'mousebutton' -> 'mode' -> 'specifics'
      this.interactions.dragging = false
      if (rightButton) {
        if (this.mode === mode.PRIMARY) {
        } else if (this.mode === mode.SECONDARY) {
        } else if (this.mode === mode.COMMAND) {
        }
      } else {
        this.interactions.leftMouseDown = true
        this.interactions.dragStart = this.mousePoint
        if (this.mode === mode.PRIMARY) {
        } else if (this.mode === mode.SECONDARY) {
        } else if (this.mode === mode.COMMAND) {
        }
      }
      this.redraw()
    },
    onMouseUp (e, rightButton) {
      // To keep consistent structure, we order our if statments as 'mousebutton' -> 'mode' -> 'specifics'
      // First we do things that we always do to update the interactions
      const { dragging } = this.interactions
      this.interactions.leftMouseDown = false
      if (rightButton) {
        if (this.mode === mode.PRIMARY) {
          if (!dragging) {
            // Then we want to place a new joint
            const placePoint = this.pointToNearest(this.mousePoint)
            this.addJoint(placePoint)
          }
        } else if (this.mode === mode.SECONDARY) {
        } else if (this.mode === mode.COMMAND) {
        }
      } else {
        if (this.mode === mode.PRIMARY) {
          if (dragging) {
            // Then we just selected an area
            const selected = this.getJointsWithin(this.interactions.dragStart, this.mousePoint, Object.keys(this.structures.joints))
            this.onJointsSelected(selected)
          } else {
            // Then we just clicked to get a joint
            const selected = this.getClosestJoint(this.mousePoint, Object.keys(this.structures.joints), 1)
            if (!selected) {
              // Then the user clicked away from all points
              this.onAllDeselected()
            } else {
              // Then the user clicked on a joint. If it is already selected we remove it.
              this.onJointsSelected([selected], true)
            }
          }
        } else if (this.mode === mode.SECONDARY) {
        } else if (this.mode === mode.COMMAND) {
        }
      }
      this.interactions.dragging = false
      this.redraw()
    },
    onMove ([dx, dy], [x, y]) {
      // To keep consistent structure, we order our if statments as mode' -> 'specifics'
      // First we do things that we always do to update the interactions
      this.interactions.mousePos = [x, y]
      if (this.interactions.leftMouseDown) {
        const dSqr = (this.mousePoint[0] - this.interactions.dragStart[0]) ** 2 + (this.mousePoint[1] - this.interactions.dragStart[1]) ** 2
        if (dSqr > 0.01) {
          this.interactions.dragging = true
        }
      }
      const { dragging } = this.interactions
      if (this.mode === mode.PRIMARY) {
        if (dragging) {
          this.drawSelectionGraph()
        }
      } else if (this.mode === mode.SECONDARY) {
      } else if (this.mode === mode.COMMAND) {
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
      })
      this.on({ modes: mode.PRIMARY, placetypes: placeType.JOINT, interactions: interactionType.LEFTCLICK }, ({ mousePoint }) => this.addJoint(this.pointToNearest(mousePoint)))
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
      this.on({ modes: mode.PRIMARY, placetypes: placeType.SELECTING, interactions: interactionType.LEFTDRAGUP }, ({ dragStart, mousePoint }) => {
        const selected = this.getJointsWithin(this.interactions.dragStart, this.mousePoint, Object.keys(this.structures.joints))
        this.onJointsSelected(selected)
        this.drawSelectionGraph()
      })
      this.on({ modes: mode.PRIMARY, placetypes: placeType.SELECTING, interactions: interactionType.LEFTDRAG }, ({ dragStart, mousePoint }) => {
        this.drawSelectionGraph(dragStart, mousePoint)
      })
      this.on({ modes: mode.PRIMARY, placetypes: placeType.SELECTING, interactions: interactionType.KEYPRESS, keyFilter: ['Backspace'] }, () => {
        this.removeSelectedJoints()
      })
      // this.on({ modes: [mode.PRIMARY, mode.SECONDARY], interactions: interactionType.RIGHTDRAG }, res => {
      //   console.log('Right Drag: ', res)
      // })
      // this.on({ mode: mode.PRIMARY, placetype: placeType.SELECTING,  })
      console.log(this.interactions.callbacks)
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
    onKeyDownV2 (e) {
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
    onMouseDownV2 (e, rightButton) {
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
    onMouseUpV2 (e, rightButton) {
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
    onMouseMoveV2 ([dx, dy], [x, y]) {
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
      const currActions = []
      for (const jointId of this.selections.joints) {
        const joint = this.structures.joints[jointId]
        currActions.push(new actions.joints.REMOVE(joint.pos, jointId, joint.type))
      }
      this.execute(currActions)
    }
  }
}
/* eslint-disable no-unused-vars */
</script>

<style lang="scss" scoped>
.builder {
  width: 100%;
  height: 100%;
}
</style>
