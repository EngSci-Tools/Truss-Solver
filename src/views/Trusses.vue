<template>
  <div id='truss-view'>
    <p>PIXI Render</p>
    <div id='pixi' ref='pixi'></div>
  </div>
</template>

<script>
import * as PIXI from 'pixi.js'
const Application = PIXI.Application
const Container = PIXI.Container
const Graphics = PIXI.Graphics

const mode = {
  MOVING: 'moving',
  SELECTING: 'selecting'
}

export default {
  name: 'Trusses',
  data () {
    return {
      width: 0,
      height: 0,
      scale: 50, // How many pixels per grid line?
      scaleMax: 200,
      scaleMin: 10,
      viewX: 0,
      viewY: 0,

      interactions: {
        mouseDown: false,
        mousePos: [0, 0],
        dragging: false,
        heldKeys: [], // Not using a set because vue doesnt watch it
        mode: mode.MOVING,

        selectionOne: [-1, -1],
        selectionTwo: [-1, -1],
        selectedNodes: [],
        selectedMembers: []
      },

      app: new Application({ width: 0, height: 0, antialias: true, backgroundColor: 0x34495e }),

      background: new Container(),
      backgroundGraph: new Graphics(),
      selectionGraph: new Graphics(),

      bridge: new Container(),
      bridgeGraph: new Graphics(),
      bridgeNodes: [[0, 0], [1, 1]],
      bridgeMembers: [],

      loads: new Container(),
      loadsGraph: new Graphics(),
      forces: [],
      pins: []
    }
  },
  computed: {
    nodeRadius () {
      return this.scale / 5
    },
    mode () {
      if (this.interactions.heldKeys.indexOf('ShiftLeft') > -1) {
        return mode.SELECTING
      } else {
        return mode.MOVING
      }
    }
  },
  watch: {
    'interactions.selectedNodes' (to) {
      this.drawBridge()
    },
    // We have to redraw whenever one of these properties changes
    height () {
      this.redraw()
    },
    width () {
      this.redraw()
    },
    viewX () {
      this.redraw()
    },
    viewY () {
      this.redraw()
    },
    scale (to) {
      // We catch scale events to make sure that limits are not exceeded
      if (to > this.scaleMax) {
        this.scale = this.scaleMax
      }
      if (to < this.scaleMin) {
        this.scale = this.scaleMin
      }
      this.redraw()
    }
  },
  mounted () {
    const pixiDiv = this.$refs.pixi
    // Make sure that the canvas resizes when it needs to
    this.width = pixiDiv.clientWidth
    this.height = pixiDiv.clientHeight
    this.app.renderer.autoResize = true
    this.app.renderer.resize(pixiDiv.clientWidth, pixiDiv.clientHeight)
    window.addEventListener('resize', () => {
      this.app.renderer.resize(pixiDiv.clientWidth, pixiDiv.clientHeight)
      this.width = pixiDiv.clientWidth
      this.height = pixiDiv.clientHeight
    })

    // Register the children so stuff is actually drawn
    this.background.addChild(this.backgroundGraph)
    this.background.addChild(this.selectionGraph)
    this.drawBackground()
    this.bridge.addChild(this.bridgeGraph)
    this.drawBridge()
    this.app.stage.addChild(this.background)
    this.app.stage.addChild(this.bridge)

    // Add event listeners
    this.app.renderer.plugins.interaction.on('pointerdown', this.onMouseDown)
    this.app.renderer.plugins.interaction.on('pointerup', this.onMouseUp)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('keydown', this.onKeyDown)
    this.app.view.addEventListener('wheel', (event) => {
      this.scale -= event.deltaY / 2
      event.preventDefault()
      return false
    })
    this.app.view.addEventListener('mousemove', (event) => {
      const { movementX: dx, movementY: dy } = event
      const { layerX: x, layerY: y } = event
      this.onMove([dx, dy], [x, y])
    })

    // Add the canvas into the DOM
    pixiDiv.appendChild(this.app.view)
  },
  methods: {
    // These make sure we always know which keys are held
    onKeyUp (e) {
      const index = this.interactions.heldKeys.indexOf(e.code)
      if (index > -1) {
        this.interactions.heldKeys.splice(index, 1)
      }
    },
    onKeyDown (e) {
      if (this.interactions.heldKeys.indexOf(e.code) < 0) {
        this.interactions.heldKeys.push(e.code)
      }
    },
    // These handle what we do when the user interacts with the mouse
    onMove ([dx, dy], [x, y]) {
      this.interactions.mousePos = [x, y]
      if (this.interactions.mouseDown) {
        this.interactions.dragging = true
        if (this.mode === mode.MOVING) {
          // Then we want to move the view by some distance
          this.viewX += dx
          this.viewY += dy
        } else if (this.mode === mode.SELECTING) {
          // Then we will draw a box around the selection area
          this.drawSelection()
        }
      }
    },
    onMouseDown (e) {
      const { x: width, y: height } = e.data.global
      const point = this.pixToPoint([width, height])
      this.interactions.mouseDown = true
      this.interactions.selectionOne = point
    },
    onMouseUp (e) {
      const { x: width, y: height } = e.data.global
      const point = this.pixToPoint([width, height])
      if (this.interactions.dragging) {
        this.interactions.dragging = false
        if (this.mode === mode.SELECTING) {
          // Then we want to select any nodes within these two selected points.
          this.interactions.selectionTwo = point
          this.interactions.selectedNodes = this.getNodesWithin(this.interactions.selectionOne, this.interactions.selectionTwo)
          this.drawSelection()
        }
      } else {
        if (this.mode === mode.MOVING) {
          // The moving interaction also inclues placing and removing
          this.placeNode([width, height])
        } else if (this.mode === mode.SELECTING) {
          // Then we want to select a specific node, but it has to exist to select it
          console.log('Selection mode and clicked')
          if (this.hasNode(point) > -1) {
            console.log('Node exists')
            const selectedIndex = this.hasNode(point, this.interactions.selectedNodes)
            if (selectedIndex > -1) {
              // Then the node is already selected. Let's deselect it
              console.log('Node is already selected')
              this.interactions.selectedNodes.splice(selectedIndex, 1)
            } else {
              // Then we want to add it to the selection
              console.log('Node is not selected')
              this.interactions.selectedNodes.push(point)
            }
            this.interactions.selectedNodes = [point]
          } else {
            // If the user clicks somewhere else, let's deselect
            this.interactions.selectedNodes = []
          }
        }
      }
      this.interactions.mouseDown = false
    },
    redraw () {
      this.drawBackground()
      this.drawBridge()
    },
    getNodesWithin (nodeOne, nodeTwo) {
      const nodes = []
      const minX = Math.min(nodeOne[0], nodeTwo[0])
      const maxX = Math.max(nodeOne[0], nodeTwo[0])
      const minY = Math.min(nodeOne[1], nodeTwo[1])
      const maxY = Math.max(nodeOne[1], nodeTwo[1])
      for (const node of this.bridgeNodes) {
        if (node[0] >= minX && node[0] <= maxX && node[1] >= minY && node[1] <= maxY) {
          nodes.push(node)
        }
      }
      return nodes
    },
    hasNode (node, override = undefined) {
      const nodes = override || this.bridgeNodes
      console.log('Using nodes: ', nodes, node)
      for (const index in nodes) {
        const compNode = this.bridgeNodes[index]
        if (node[0] === compNode[0] && node[1] === compNode[1]) {
          return index
        }
      }
      return -1
    },
    placeNode ([width, height]) {
      const point = this.pixToPoint([width, height])

      const index = this.hasNode(point)
      if (index > -1) {
        this.bridgeNodes.splice(index, 1)
      } else {
        this.bridgeNodes.push(point)
      }

      this.drawBridge()
    },
    drawBackground () {
      this.backgroundGraph.clear()
      const numHoriz = Math.floor(this.height / this.scale)
      const numVert = Math.floor(this.width / this.scale)
      this.backgroundGraph.lineStyle(1, 0x95a5a6, 1)
      this.backgroundGraph.x = this.viewX + this.width / 2
      this.backgroundGraph.y = this.viewY + this.height / 2
      // Draw horizontal lines
      for (let i = -1 * Math.floor(numHoriz / 2 + this.viewY / this.scale); i < Math.ceil(numHoriz / 2 - this.viewY / this.scale) + 1; i++) {
        const yVal = this.scale * i
        this.backgroundGraph.moveTo(-1 * this.width - this.viewX, yVal)
        this.backgroundGraph.lineTo(this.width - this.viewX, yVal)
      }
      // Draw vertical lines
      for (let i = -1 * Math.floor(numVert / 2 + this.viewX / this.scale); i < Math.ceil(numVert / 2 - this.viewX / this.scale) + 1; i++) {
        const xVal = this.scale * i
        this.backgroundGraph.moveTo(xVal, -1 * this.height - this.viewY)
        this.backgroundGraph.lineTo(xVal, this.height - this.viewY)
      }
    },
    drawSelection () {
      // Draw the selection
      this.selectionGraph.clear()
      this.selectionGraph.beginFill(0x3498db)
      this.selectionGraph.lineStyle(1, 0x2980b9, 1)
      this.selectionGraph.alpha = 0.4
      this.selectionGraph.x = this.viewX + this.width / 2
      this.selectionGraph.y = this.viewY + this.height / 2
      if (this.mode === mode.SELECTING && this.interactions.dragging) {
        // Then we are in box selection mode and should draw a rectangle
        const p1 = this.pointToPix(this.interactions.selectionOne)
        const p2 = this.pointToPix(this.pixToPoint(this.interactions.mousePos))
        this.selectionGraph.drawRect(p1[0], p1[1], p2[0] - p1[0], p2[1] - p1[1])
        this.selectionGraph.endFill()
      }
    },
    drawBridge () {
      this.bridgeGraph.clear()
      // this.bridgeGraph.lineStyle(2, 0xf39c12, 1)
      this.bridgeGraph.x = this.viewX + this.width / 2
      this.bridgeGraph.y = this.viewY + this.height / 2
      // console.log(this.bridgeGraph.x, this.bridgeGraph.y)
      // Draw nodes
      this.bridgeGraph.beginFill(0xf39c12)
      for (const node of this.bridgeNodes) {
        const [x, y] = this.pointToPix(node)
        this.bridgeGraph.drawCircle(x, y, this.nodeRadius)
      }
      this.bridgeGraph.beginFill(0x2ecc71)
      for (const selectedNode of this.interactions.selectedNodes) {
        const [x, y] = this.pointToPix(selectedNode)
        this.bridgeGraph.drawCircle(x, y, this.nodeRadius)
      }
    },
    pointToPix ([x, y]) {
      return [x * this.scale, -1 * y * this.scale]
    },
    pixToPoint ([width, height]) {
      return [Math.round((width - this.width / 2 - this.viewX) / this.scale), -1 * Math.round((height - this.height / 2 - this.viewY) / this.scale)]
    }
  }
}
</script>

<style lang="scss" scoped>
#truss-view {
  height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  #title {
    flex: 0 1 auto;
  }

  #pixi {
    flex: 1 0 auto;
    width: 100vw;
  }
}
</style>
