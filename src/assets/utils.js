export const mode = { // MODE SHOULD BE A COMPUTED PROPERTY!!
  PRIMARY: 'primary', // This is the default mode.
  SECONDARY: 'secondary', // Used to perform secondary actions
  COMMAND: 'command' // Used to do special actions such as ctrl+z or ctrl+c
}

export const placeType = { // Used to define what clicks do. Right drag always pans
  SELECTING: 'Selecting', // Can make infinite selections. Used to do en masse chages like moving or deleting (Deleting joints, members, or forces)
  JOINT: 'Joints', // Left click places a joint and selects the joint. Shift left click changes the joint type. Only one joint can be selected at a time.
  MEMBER: 'Members', // Left click selects a joint, then another. On second selection places a member. Selecting another rotates the selection so the second and third are selected and places a joint. Delete removes one joint.
  FORCE: 'Loads' // Left click on a joint places a force and selects it. Selecting many forces allows you to change all their values at once.
}

export const interactionType = {
  KEYPRESS: 'keypress',
  LEFTCLICK: 'leftClick',
  LEFTCLICKDOWN: 'leftClickDown',
  LEFTDRAG: 'leftDrag',
  LEFTDRAGUP: 'leftDragUP',
  RIGHTCLICK: 'rightClick',
  RIGHTCLICKDOWN: 'rightClickDown',
  RIGHTDRAG: 'rightDrag',
  RIGHTDRAGUP: 'rightDragUP'
}

export const unit = {
  METERS: 'Meters',
  MILLIMETERS: 'Millimeters'
}

export const jointType = {
  PIN: 'pin',
  FLOATING: 'floating'
}

export class Joint {
  // Joints have a location in point coordinates and a type. We can store a lot of info and variations on position, but it is O(n) to search positions. This is fine because we only need O(1) on member search.
  // Pin joints oppose all motion and have forces calculated based on the nodes. There should not be more than 2 of these so that the structure is statically determinate.
  // Floating joints have zero net force on them and no external forces.
  constructor ([x, y], type) {
    this.pos = [x, y]
    this.type = type
  }
}

export class Force {
  constructor (direction, magnitude) {
    this.direction = direction
    this.magnitude = magnitude
  }

  // TODO: Get force components in here
  get xComponent () {
    return this.magnitude * Math.cos(this.direction * (Math.PI / 180))
  }

  get yComponent () {
    return this.magnitude * Math.sin(this.direction * (Math.PI / 180))
  }
}

// Lets play the game of how many times I misspell adjacent
export class MemberGraph {
  // This is the most confusing portion of the app. Members are represented as an undirected graph stored as a adjacency list.
  // Since adding and removing connections and joints is confusing, we seperate it out into its own class.
  constructor () {
    this.graph = {}
  }

  get joints () {
    return Object.keys(this.graph)
  }

  hasJoint (jointId) {
    return this.joints.indexOf(jointId) > -1
  }

  hasAdjacent (jointOne, jointTwo) {
    return this.graph[jointOne].indexOf(jointTwo) > -1
  }

  addJoint (jointId) {
    if (!this.hasJoint(jointId)) {
      // Then the joint is not in the graph. We will add it.
      this.graph[jointId] = []
    }
    // Otherwise it already exists so no reason to do anything
  }

  removeJoint (jointId) {
    // First we remove the adjacency information fo the node itself.
    if (this.hasJoint(jointId)) {
      delete this.graph[jointId]
    }
    // Then we remove the joint from other adjacents
    for (const adjacents of Object.values(this.graph)) {
      const index = adjacents.indexOf(jointId)
      if (index > -1) {
        adjacents.splice(index, 1)
      }
    }
  }

  addAdjacent (jointOne, jointTwo) {
    // A helper function for addMember. It basically makes the array act like a set. This is because arrays are observable by vue while sets are not.
    if (!this.hasAdjacent(jointOne, jointTwo)) {
      this.graph[jointOne].push(jointTwo)
    }
  }

  addMember (jointOne, jointTwo) {
    // We add the joints if they are not already in the graph. Sure, this may lead to bad practices, but I want this to be easy not correct.
    this.addJoint(jointOne)
    this.addJoint(jointTwo)
    // Then we add the adjacents to the two joints
    this.addAdjacent(jointOne, jointTwo)
    this.addAdjacent(jointTwo, jointOne)
  }

  removeAdjacent (jointOne, jointTwo) {
    // A helper for remove member. Safely remove a the adjacent.
    if (this.hasAdjacent(jointOne, jointTwo)) {
      const index = this.graph[jointOne].indexOf(jointTwo)
      this.graph[jointOne].splice(index, 1)
    }
  }

  removeMember (jointOne, jointTwo) {
    // We add the joints if they are not already in the graph. Sure, this may lead to bad practices, but I want this to be easy not correct.
    this.addJoint(jointOne)
    this.addJoint(jointTwo)
    // Then we remove the two adjacency values.
    this.removeAdjacent(jointOne, jointTwo)
    this.removeAdjacent(jointTwo, jointOne)
  }

  getAllMembers (jointFilter = []) {
    // Returns a list of joint-joint pairs
    const reviewedJoints = [] // Contains all jointIds that have already been added
    const pairs = []
    const joints = Object.entries(this.graph).filter(joint => jointFilter.length === 0 || jointFilter.indexOf(joint[0]) > -1)
    for (const [jointId, adjacents] of joints) {
      for (const adjacent of adjacents) {
        if (reviewedJoints.indexOf(adjacent) < 0) {
          // Then we have not already added this joint
          pairs.push([jointId, adjacent])
        }
      }
      reviewedJoints.push(jointId)
    }
    return pairs
  }
}

// Here we define all the possible actions. For an action to be valid, all of its values must be set
// All actions must be executed perfect or error. All actions must contain all information neccesary to reverse them. These precautions ensure that all actions are reversable.
class Action {
  // Actions are datacalasses that define reversable opperations that act on some scene objects. In order to change the scene, an action is "executed".
  reverse () {
    // All actions must define an inverse which returns another action that exactly undoes the original
  }
}

// Define joint actions
class JointAction extends Action {}
const joints = {
  ADD: class AddJoint extends JointAction {
    // Add joint actions define a point to be added to the scene
    _point = undefined
    get point () {
      return [...this._point]
    }

    type = undefined
    id = undefined
    constructor ([pointX, pointY], id, type = jointType.FLOATING) {
      super()
      if (pointX == null || pointY == null || id == null || type == null) {
        throw new MalformedActionError('AddJoint')
      }
      this._point = [pointX, pointY]
      this.id = id
      this.type = type
    }

    reverse () {
      return new joints.REMOVE(this._point, this.id, this.type)
    }
  },

  REMOVE: class RemoveJoint extends JointAction {
    // Remvoe joint identifies a join that should be removed. Only id or point is neccesary to execute, but all are required to ensure reverability
    _point = undefined
    get point () {
      return [...this._point]
    }

    type = undefined
    id = undefined
    constructor ([pointX, pointY], id, type = jointType.FLOATING) {
      super()
      if (pointX == null || pointY == null || id == null || type == null) {
        throw new MalformedActionError('RemoveJoint')
      }
      this._point = [pointX, pointY]
      this.id = id
      this.type = type
    }

    reverse () {
      return new joints.ADD(this._point, this.id, this.type)
    }
  },

  MOVE: class MoveJoint extends JointAction {
    // Moves a joint by some dx and dy
    _displacement = undefined
    get displacement () {
      return [...this._displacement]
    }

    id = undefined
    constructor ([dx, dy], id) {
      super()
      if (dx == null || dy == null || id == null) {
        throw new MalformedActionError('MoveJoint')
      }
      this._displacement = [dx, dy]
      this.id = id
    }

    reverse () {
      return new joints.MOVE([-1 * this._displacement[0], -1 * this._displacement[1]], this.id)
    }
  },

  SETTYPE: class SetJointType extends JointAction {
    id = undefined
    oldType = undefined
    newType = undefined
    constructor (id, oldType, newType) {
      super()
      if (id == null || oldType == null || newType == null) {
        throw new MalformedActionError('SetJointType')
      }
      this.id = id
      this.oldType = oldType
      this.newType = newType
    }

    reverse () {
      return new joints.SETTYPE(this.id, this.newType, this.oldType)
    }
  },

  SETID: class SetJointId extends JointAction {
    oldId = undefined
    newId = undefined
    constructor (oldId, newId) {
      super()
      if (oldId == null || newId == null) {
        throw new MalformedActionError(this.constructor.name)
      }
      this.oldId = oldId
      this.newId = newId
    }
  }
}

class MemberAction extends Action {}
const members = {
  ADD: class AddMember extends MemberAction {
    jointOne = undefined
    jointTwo = undefined
    linArea = 0
    constructor (jointOne, jointTwo, linArea = 0) {
      super()
      if (jointOne == null || jointTwo == null || linArea == null) {
        throw new MalformedActionError('AddMember')
      }
      this.jointOne = jointOne
      this.jointTwo = jointTwo
      this.linArea = linArea
    }

    reverse () {
      return new members.REMOVE(this.jointOne, this.jointTwo, this.linArea)
    }
  },

  REMOVE: class RemoveMember extends MemberAction {
    jointOne = undefined
    jointTwo = undefined
    linArea = undefined
    constructor (jointOne, jointTwo, linArea = 0) {
      super()
      if (jointOne == null || jointTwo == null || linArea == null) {
        throw new MalformedActionError('RemoveMember')
      }
      this.jointOne = jointOne
      this.jointTwo = jointTwo
      this.linArea = linArea
    }

    reverse () {
      return new members.ADD(this.jointOne, this.jointTwo, this.linArea)
    }
  },

  SETLINAREA: class SetMemberLinearArea extends MemberAction {
    jointOne = undefined
    jointTwo = undefined
    oldLinArea = undefined
    newLinArea = undefined
    constructor (jointOne, jointTwo, oldLinArea, newLinArea) {
      super()
      if (jointOne == null || jointTwo == null || oldLinArea == null || newLinArea == null) {
        throw new MalformedActionError('SetMemberLinearArea')
      }
      this.jointOne = jointOne
      this.jointTwo = jointTwo
      this.oldLinArea = oldLinArea
      this.newLinArea = newLinArea
    }

    reverse () {
      return new members.SETLINAREA(this.jointOne, this.jointTwo, this.newLinArea, this.oldLinArea)
    }
  }
}

class ForceAction extends Action { }
const forces = {
  ADD: class AddForce extends ForceAction {
    jointId = undefined
    magnitude = undefined
    direction = -90
    constructor (joint, magnitude, direction = -90) {
      super()
      if (joint == null || magnitude == null || direction == null) {
        throw new MalformedActionError(this.constructor.name)
      }
      this.jointId = joint
      this.magnitude = magnitude
      this.direction = direction
    }

    reverse () {
      return new forces.REMOVE(this.jointId, this.magnitude, this.direction)
    }
  },
  REMOVE: class RemoveForce extends ForceAction {
    jointId = undefined
    magnitude = undefined
    direction = undefined
    constructor (joint, magnitude, direction) {
      super()
      if (joint == null || magnitude == null || direction == null) {
        throw new MalformedActionError(this.constructor.name)
      }
      this.jointId = joint
      this.magnitude = magnitude
      this.direction = direction
    }

    reverse () {
      return new forces.ADD(this.jointId, this.magnitude, this.direction)
    }
  },
  SETMAG: class SetForceMagnitude extends ForceAction {
    jointId = undefined
    oldMag = undefined
    newMag = undefined
    constructor (joint, oldMag, newMag) {
      super()
      if (joint == null || oldMag == null || newMag == null) {
        throw new MalformedActionError(this.constructor.name)
      }
      this.jointId = joint
      this.oldMag = oldMag
      this.newMag = newMag
    }

    reverse () {
      return new forces.SETMAG(this.jointId, this.newMag, this.oldMag)
    }
  },
  SETDIR: class SetForceDirection extends ForceAction {
    jointId = undefined
    oldDir = undefined
    newDir = undefined
    constructor (joint, oldDir, newDir) {
      super()
      if (joint == null || oldDir == null || newDir == null) {
        throw new MalformedActionError(this.constructor.name)
      }
      this.jointId = joint
      this.oldDir = oldDir
      this.newDir = newDir
    }

    reverse () {
      return new forces.SETDIR(this.jointId, this.newDir, this.oldDir)
    }
  }
}

class SelectAction extends Action { }
const select = {
  SELECT: class SelectJoint extends SelectAction {
    _ids = undefined
    get ids () {
      return [...this._ids]
    }

    constructor (ids) {
      super()
      if (ids == null) {
        throw new MalformedActionError(this.constructor.name)
      }
      this._ids = [...ids]
    }

    reverse () {
      return new select.DESELECT(this._ids)
    }
  },
  DESELECT: class DeselectJoint extends SelectAction {
    _ids = undefined
    get ids () {
      return [...this._ids]
    }

    constructor (ids) {
      super()
      if (ids == null) {
        throw new MalformedActionError(this.constructor.name)
      }
      this._ids = [...ids]
    }

    reverse () {
      return new select.SELECT(this._ids)
    }
  },
  COPY: null
}

class GhostAction extends Action { }
const ghosts = {
  CREATEFROMSELECTED: null,
  PLACE: null
}

class MalformedActionError extends Error {
  constructor (action) {
    const message = `${action} must have all parameters set`
    super(message)
    this.name = 'MalformedActionError'
  }
}

class NonActionError extends Error {
  constructor () {
    super('Attempted to execute a class was of the correct action type')
    this.name = 'NonActionError'
  }
}

class ActionFailed extends Error {
  constructor (action, reason) {
    super(`${action} failed: ${reason}`)
    this.name = 'ActionFailed'
  }
}

export const actionErrors = {
  Malformed: MalformedActionError, NonAction: NonActionError, Failed: ActionFailed
}

export const actions = {
  joints, members, forces, select, ghosts
}

export const actionTypes = {
  all: Action, joints: JointAction, members: MemberAction, forces: ForceAction, select: SelectAction, ghosts: GhostAction
}

export function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
