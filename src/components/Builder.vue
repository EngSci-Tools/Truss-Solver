<template>
  <div class='builder' ref='builder' oncontextmenu="return false;">
    <!-- TODO: Add a toolbar to go above the canvas -->
  </div>
</template>

<script>
/* eslint-disable no-unused-vars */
import { mode, placeType, unit, jointType, Joint, Force, MemberGraph, actions, actionTypes, actionErrors, sleep } from '@/assets/utils'
import * as PIXI from 'pixi.js'
const { Application, Container, Graphics } = PIXI

export default {
  name: 'Build',
  data: () => ({
    history: [],
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
      mouseDown: false,
      mousePos: [0, 0],
      dragging: false,
      selectionStart: [], // Stores where a drag started so that we can draw selections correctly. Stored in point coordinate system
      heldKeys: []
    },

    selections: { // Could probably be inside interactions, but it makes watching code more complicated. Lists of points stored in point coordinate system
      joints: [],
      members: [],
      loads: [],
      buildSelection: [] // A list of points that the user will act one to place joints, members, or forces
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
    },
    structures: {
      // If the bridge structure changes, we just need to rerender the bridge
      handler () {
        this.drawBridge()
      },
      deep: true
    },
    selections: {
      // Selections can effect the rendering of the background as well as bridge so we update all
      handler () {
        this.redraw()
      },
      deep: true
    }
  },
  computed: {
    jointRadius () {
      const minSep = Math.min(this.visuals.xSep, this.visuals.ySep)
      if (minSep < 1) {
        return this.visuals.scale * minSep / 5
      } else {
        return this.visuals.scale / 5
      }
    },
    mode () {
      if (this.interactions.heldKeys.indexOf('ShiftLeft') > -1) {
        return mode.MOVING
      } else {
        return mode.EDITING
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
  },
  methods: {
    // NEW METHODS: uses the concept of actions to edit the scene
    executeHelper (action) {
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

    execute (actions, record = true) {
      if (Array.isArray(actions)) {
        for (const action of actions) {
          this.executeHelper(action)
        }
      } else {
        this.executeHelper(actions)
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
        this.execute(reverses, false)
      } else {
        this.execute(action.reverse(), false) // Do the reverse and do not record the history
      }
      return true
    },

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

    // Joint Action Handlers
    aJointAdd (action) {
      const { point, type, id } = action
      if (id in this.structures.joints) {
        throw new actionErrors.Failed(action.constructor.name, 'Joint ID already exists')
      }
      this.structures.joints[id] = new Joint(point, type)
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
      // TODO: Systematically remove all members from this joint so that it can be undone gracefully
      delete this.structures.joints[id]
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

    },

    // Setup Functions
    addEventListeners (div) {
      div.addEventListener('onContextMenu', e => {
        console.log('Context!')
        e.preventDefault()
        return false
      })

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
        if (this.interactions.heldKeys.indexOf(e.code) < 0) {
          this.interactions.heldKeys.push(e.code)
        }
      })

      this.pixi.app.view.addEventListener('wheel', e => {
        this.visuals.scale -= e.deltaY / 2
        e.preventDefault()
        return false
      })

      this.pixi.app.view.addEventListener('mousemove', e => {
        const { movementX: dx, movementY: dy } = e
        const { layerX: x, layerY: y } = e
        this.onMove([dx, dy], [x, y])
      })

      this.pixi.app.renderer.plugins.interaction.on('mousedown', e => this.onMouseDown(e, false))
      this.pixi.app.renderer.plugins.interaction.on('mouseup', e => this.onMouseUp(e, false))
      this.pixi.app.renderer.plugins.interaction.on('rightdown', e => this.onMouseDown(e, true))
      this.pixi.app.renderer.plugins.interaction.on('rightup', e => this.onMouseUp(e, true))
    },
    onMouseDown (e, rightButton) {
      const { x: pixX, y: pixY } = e.data.global
      if (!rightButton) {
        this.interactions.mouseDown = true
        if (this.mode === mode.EDITING) {
          // Then we want to start a selection in case the user draggs
          this.interactions.selectionStart = this.pixToPoint([pixX, pixY])
        } else if (this.mode === mode.MOVING) {
          // Then we do nothing?
        }
      }
    },
    onMouseUp (e, rightButton) {
      if (!rightButton) {
        if (this.mode === mode.EDITING) {
          // Then we want to place or remove a joint at the nearest grid point
          const mousePoint = this.pixToPoint(this.interactions.mousePos)
          if (this.interactions.dragging) {
            // Then the user wants to select an area
            const selected = this.getJointsWithin(this.interactions.selectionStart, mousePoint, Object.keys(this.structures.joints))
            this.selectJoints(selected)
          } else {
            const selected = this.getClosestJoint(mousePoint, Object.keys(this.structures.joints), 1)
            if (!selected) {
              this.selections.joints = []
            } else {
              this.selectJoints([selected], true)
            }
          }
        } else if (this.mode === mode.MOVING) {
          // Then we do nothing I guess?
        }
        this.interactions.mouseDown = false
        this.interactions.dragging = false
      } else {
        if (this.mode === mode.EDITING) {
          const mousePoint = this.pixToPoint(this.interactions.mousePos)
          const nearestTick = this.pointToNearest(mousePoint)
          this.placeMarker(nearestTick)
        }
      }
      this.redraw()
    },
    onMove ([dx, dy], [x, y]) {
      // We always want to set the mouse position and dragging state before doing mode specific stuff
      const { mouseDown } = this.interactions
      this.interactions.mousePos = [x, y]
      if (mouseDown) {
        const dSqr = (this.mousePoint[0] - this.interactions.selectionStart[1]) ** 2 + (this.mousePoint[1] - this.interactions.selectionStart[1]) ** 2
        if (dSqr > 3) {
          this.interactions.dragging = true
        }
      }
      if (this.mode === mode.EDITING) {
        // Then we will draw a box around the selection area
        if (mouseDown && this.interactions.dragging) {
          this.drawSelectionGraph()
        }
      } else if (this.mode === mode.MOVING) {
        // Then we want to move the view by some distance
        if (mouseDown && this.interactions.dragging) {
          this.visuals.viewX += dx
          this.visuals.viewY += dy
        }
      }
    },
    setupChildren () {
      const { background, bridge, backgroundGraph, selectionGraph, jointGraph, memberGraph, loadsGraph, app } = this.pixi
      background.addChild(backgroundGraph)
      background.addChild(selectionGraph)
      bridge.addChild(memberGraph)
      bridge.addChild(loadsGraph)
      bridge.addChild(jointGraph)

      app.stage.addChild(background)
      app.stage.addChild(bridge)
    },
    fitPixiCanvas (div) {
      const { app } = this.pixi
      this.visuals.width = div.clientWidth
      this.visuals.height = div.clientHeight
      app.renderer.autoResize = true
      app.renderer.resize(this.visuals.width, this.visuals.height)
    },

    // Render Methods
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
    drawSelectionGraph () {
      // Renders the selection box based off of interactions.selectionStart and the interactions.mousePos
      const { selectionGraph } = this.pixi

      selectionGraph.clear()
      selectionGraph.beginFill(0x3498db)
      selectionGraph.lineStyle(1, 0x2980b9, 1)
      selectionGraph.alpha = 0.4

      if (this.mode === mode.EDITING && this.interactions.dragging) {
        // Then we are in box selection mode and should draw a rectangle
        const p1 = this.pointToPix(this.interactions.selectionStart)
        const p2 = this.pointToPix(this.pixToPoint(this.interactions.mousePos))
        selectionGraph.drawRect(p1[0], p1[1], p2[0] - p1[0], p2[1] - p1[1])
        selectionGraph.endFill()
      }

      const { buildSelection } = this.selections
      selectionGraph.beginFill(0xf39c12)
      for (const point of buildSelection) {
        const [x, y] = this.pointToPix(point)
        selectionGraph.drawCircle(x, y, this.jointRadius)
      }
      selectionGraph.beginFill(0xf39c12)

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
      if (maxPointDist ** 2 < dist) {
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
    selectJoints (jointIds, removeIfExists = false) {
      // Updates the selected joints list to include the joinIds. If removeIfExists, joints already in the selection will be removed.
      for (const id of jointIds) {
        const index = this.selections.joints.indexOf(id)
        if (index < 0) {
          this.selections.joints.push(id)
        } else if (removeIfExists) {
          this.selections.joints.splice(index, 1)
        }
      }
    },
    placeMarker ([x, y]) {
      // Places a buildMarker at the cooresponding point. If it is already selected, remove it.
      const { buildSelection } = this.selections
      const index = buildSelection.map(point => point[0] === x && point[1] === y).indexOf(true)
      if (index > -1) {
        buildSelection.splice(index, 1)
      } else {
        buildSelection.push([x, y])
      }
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
