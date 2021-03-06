import { jointType } from '@/assets/utils.js'

class QueryConstructor {
  constructor () {
    this.joints = []
    this.members = []
    this.forces = []
    this.seperation = [1, 1]
  }

  setSeperation ([xSep, ySep]) {
    this.seperation = [xSep, ySep]
  }

  get jointIds () {
    return this.joints.map(joint => joint[0])
  }

  jointIndex (id) {
    return this.jointIds.indexOf(id)
  }

  hasJoint (id) {
    return this.jointIndex(id) > -1
  }

  addJoint (id, location, type) {
    const index = this.jointIndex(id)
    const jointTypes = Object.values(jointType)
    if (index > -1) {
      this.joints[index] = [id, location, jointTypes.indexOf(type)]
    } else {
      this.joints.push([id, location, jointTypes.indexOf(type)])
    }
  }

  addMember (idOne, idTwo) {
    const hasOne = this.jointIndex(idOne) > -1
    const hasTwo = this.jointIndex(idTwo) > -1
    if (hasOne && hasTwo) {
      this.members.push([idOne, idTwo].sort())
    }
  }

  addForce (id, mag, dir) {
    if (this.jointIndex(id) > -1 && this.forces.map(force => force[0]).indexOf(id) === -1) {
      this.forces.push([id, mag, dir])
    }
  }

  toQuery () {
    return {
      joints: JSON.stringify(this.joints),
      members: JSON.stringify(this.members),
      forces: JSON.stringify(this.forces),
      seperation: JSON.stringify(this.seperation)
    }
  }
}

export class WarrenTrussConstructor extends QueryConstructor {
  constructor ({ height, memberLength, bridgeLength, bridgeWidth, jointLoad, uniformLoad }) {
    super()
    this.jointLoad = parseFloat(jointLoad) || 0
    if (uniformLoad) {
      const tributaryArea = memberLength * bridgeWidth / 2
      const load = parseFloat(uniformLoad) * tributaryArea
      this.jointLoad += load
    }
    this.height = height
    this.memberLength = memberLength
    this.numSections = bridgeLength / memberLength
    this.numNodes = 2 * this.numSections + 1
    this.xStart = -1 * bridgeLength / 2

    this.setSeperation([memberLength / 2, height])

    if (!Number.isInteger(this.numSections)) {
      throw Error('Bridge Length / Member Length must be an integer value')
    }

    this.addJoints()
    this.addMembers()
    this.addForces()
  }

  addJoints () {
    const firstId = 'A'.charCodeAt(0)
    for (let i = 0; i < this.numNodes; i++) {
      const y = i % 2 ? this.height : 0
      const x = this.xStart + i * this.memberLength / 2
      const id = String.fromCharCode(firstId + i)
      let type = jointType.FLOATING
      if (i === 0) {
        type = jointType.PIN
      }
      if (i === this.numNodes - 1) {
        type = jointType.ROLLER
      }
      this.addJoint(id, [x, y], type)
    }
  }

  addMembers () {
    const firstId = 'A'.charCodeAt(0)
    for (let i = 0; i < this.numNodes - 1; i++) {
      const id = String.fromCharCode(firstId + i)
      const next = String.fromCharCode(firstId + i + 1)
      const nextnext = String.fromCharCode(firstId + i + 2)
      if (this.hasJoint(next)) {
        this.addMember(id, next)
      }
      if (this.hasJoint(nextnext)) {
        this.addMember(id, nextnext)
      }
    }
  }

  addForces () {
    for (const joint of this.joints.slice(1, -1)) {
      if (joint[1][1] === 0) {
        this.addForce(joint[0], this.jointLoad, -90)
      }
    }
  }
}

export class PrattTrussConstructor extends QueryConstructor {
  constructor ({ height, memberLength, bridgeLength, bridgeWidth, jointLoad, uniformLoad }) {
    super()
    this.jointLoad = parseFloat(jointLoad) || 0
    if (uniformLoad) {
      const tributaryArea = memberLength * bridgeWidth / 2
      const load = parseFloat(uniformLoad) * tributaryArea
      this.jointLoad += load
    }
    this.height = height
    this.memberLength = memberLength
    this.numSections = bridgeLength / memberLength
    this.numNodes = 2 * this.numSections
    this.xStart = -1 * bridgeLength / 2

    this.setSeperation([memberLength / 2, height])

    if (!Number.isInteger(this.numSections)) {
      throw Error('Bridge Length / Member Length must be an integer value')
    }

    this.addJoints()
    this.addMembers()
    this.addForces()
  }

  addJoints () {
    const firstId = 'A'.charCodeAt(0)
    for (let i = 0; i < this.numNodes; i++) {
      let y = i % 2 ? this.height : 0
      const x = this.xStart + Math.ceil(i / 2) * this.memberLength
      const id = String.fromCharCode(firstId + i)
      let type = jointType.FLOATING
      if (i === 0) {
        type = jointType.PIN
      }
      if (i === this.numNodes - 1) {
        type = jointType.ROLLER
        y = 0
      }
      this.addJoint(id, [x, y], type)
    }
  }

  addMembers () {
    // const firstId = 'A'.charCodeAt(0)
    const firstId = 'A'.charCodeAt(0)
    const getId = (i, diff, reverse = false) => {
      if (reverse) {
        let delta
        if (i + diff === 0) {
          delta = i + diff
        } else if ((i + diff) % 2 === 0) {
          delta = i + diff - 1
        } else {
          delta = i + diff + 1
        }
        return String.fromCharCode(firstId + this.numNodes - delta - 1)
      } else {
        return String.fromCharCode(firstId + i + diff)
      }
    }
    for (let i = 0; i < Math.ceil(this.numNodes / 2); i++) {
      const bottom = i % 2 === 0
      const first = i === 0
      const last = i === Math.ceil(this.numNodes / 2) - 1
      const id = getId(i, 0)
      const reverseId = getId(i, 0, true)
      if (!last) {
        if (bottom) {
          this.addMember(id, getId(i, 2))
          this.addMember(reverseId, getId(i, 2, true))
        } else {
          this.addMember(id, getId(i, 1))
          this.addMember(id, getId(i, 2))
          this.addMember(id, getId(i, 3))
          this.addMember(reverseId, getId(i, 1, true))
          this.addMember(reverseId, getId(i, 2, true))
          this.addMember(reverseId, getId(i, 3, true))
        }
      } else {
        if (reverseId === id) {
          this.addMember(id, getId(i, 1))
        } else {
          this.addMember(id, reverseId)
        }
      }
      if (first) {
        this.addMember(id, getId(i, 1))
        this.addMember(reverseId, getId(i, 1, true))
      }
    }
  }

  addForces () {
    for (const joint of this.joints.slice(1, -1)) {
      if (joint[1][1] === 0) {
        this.addForce(joint[0], this.jointLoad, -90)
      }
    }
  }
}

export class HoweTrussConstructor extends QueryConstructor {
  constructor ({ height, memberLength, bridgeLength, bridgeWidth, jointLoad, uniformLoad }) {
    super()
    this.jointLoad = parseFloat(jointLoad) || 0
    if (uniformLoad) {
      const tributaryArea = memberLength * bridgeWidth / 2
      const load = parseFloat(uniformLoad) * tributaryArea
      this.jointLoad += load
    }
    this.height = height
    this.memberLength = memberLength
    this.numSections = bridgeLength / memberLength
    this.numNodes = 2 * this.numSections
    this.xStart = -1 * bridgeLength / 2

    this.setSeperation([memberLength / 2, height])

    if (!Number.isInteger(this.numSections)) {
      throw Error('Bridge Length / Member Length must be an integer value')
    }

    this.addJoints()
    this.addMembers()
    this.addForces()
  }

  addJoints () {
    const firstId = 'A'.charCodeAt(0)
    for (let i = 0; i < this.numNodes; i++) {
      let y = i % 2 ? this.height : 0
      const x = this.xStart + Math.ceil(i / 2) * this.memberLength
      const id = String.fromCharCode(firstId + i)
      let type = jointType.FLOATING
      if (i === 0) {
        type = jointType.PIN
      }
      if (i === this.numNodes - 1) {
        type = jointType.ROLLER
        y = 0
      }
      this.addJoint(id, [x, y], type)
    }
  }

  addMembers () {
    // const firstId = 'A'.charCodeAt(0)
    const firstId = 'A'.charCodeAt(0)
    const getId = (i, diff, reverse = false) => {
      if (reverse) {
        let delta
        if (i + diff === 0) {
          delta = i + diff
        } else if ((i + diff) % 2 === 0) {
          delta = i + diff - 1
        } else {
          delta = i + diff + 1
        }
        return String.fromCharCode(firstId + this.numNodes - delta - 1)
      } else {
        return String.fromCharCode(firstId + i + diff)
      }
    }
    for (let i = 0; i < Math.ceil(this.numNodes / 2); i++) {
      const bottom = i % 2 === 0
      const first = i === 0
      const last = i === Math.ceil(this.numNodes / 2) - 1
      const id = getId(i, 0)
      const reverseId = getId(i, 0, true)
      if (!last) {
        if (bottom) {
          this.addMember(id, getId(i, 1))
          this.addMember(id, getId(i, 2))
          this.addMember(reverseId, getId(i, 1, true))
          this.addMember(reverseId, getId(i, 2, true))
        } else {
          this.addMember(id, getId(i, 1))
          this.addMember(id, getId(i, 2))
          this.addMember(reverseId, getId(i, 1, true))
          this.addMember(reverseId, getId(i, 2, true))
        }
      } else {
        if (reverseId === id) {
          this.addMember(id, getId(i, 1))
        } else {
          this.addMember(id, reverseId)
          this.addMember(id, getId(i, 1))
          this.addMember(reverseId, getId(i, 1, true))
        }
      }
      if (first) {
        this.addMember(id, getId(i, 1))
        this.addMember(reverseId, getId(i, 1, true))
      }
    }
  }

  addForces () {
    for (const joint of this.joints.slice(1, -1)) {
      if (joint[1][1] === 0) {
        this.addForce(joint[0], this.jointLoad, -90)
      }
    }
  }
}
