/**
 * ADD FOR BOTH HANDS WITH CHOOSEN ACTION
 *
 * VR controller movement using "wasd-control" component by faking pressed keys
 *
 * Entity state: run, hold, exe
 */
import { DetailEvent, Entity } from "aframe"
import { Intersection } from "super-three/src/core/Raycaster"
import { AxisDetail, ButtonDetail, Hand, InputMapping, EmulatedKeys, ControllerMap, AObject3D } from "../../types"

AFRAME.registerComponent("wasd-vr", {
  dependencies: ["raycaster"],

  schema: {
    action: { default: "move" /* oneOf: ["move", "turn"], */ },
    run: { default: 2 }, // multiplier
    target: { type: "selector" },
    zombody: { type: "selector" },
    hand: { type: "string" },
  },

  intersections: [], // objects in ray
  uuids: [], // object(s) in hand

  update(old) {
    let { data } = this

    if (data.zombody !== old.zombody && data.zombody) {
      this.rmWasd()
      if (data.target) data.target.setAttribute("wasd-ext", "enabled", false)

      if (data.zombody.hasLoaded) this.addWasd(data.zombody)
      else data.zombody.addEventListener("loaded", this.addWasd.bind(this, data.zombody))
    } else if (data.target) {
      if (old.target) this.rmControls()

      data.target.setAttribute("wasd-ext", "enabled", true)
      if (data.target.hasLoaded) this.addControls()
      else data.target.addEventListener("loaded", this.addControls.bind(this))
    }
  },

  play() {
    let { el, data } = this
    if (data.target && !data.zombody) {
      el.addEventListener("raycaster-intersection", this.rayIn.bind(this))
      el.addEventListener("raycaster-intersection-cleared", this.rayOut.bind(this))
      el.addEventListener("stateadded", this.newState.bind(this))
      el.addEventListener("stateremoved", this.delState.bind(this))
      el.addEventListener("controllerconnected", this.ctrlConn.bind(this))
      el.addEventListener("controllerdisconnected", this.ctrlDisconn.bind(this))
    }
  },

  pause() {
    let { el } = this
    el.removeEventListener("raycaster-intersection", this.rayIn)
    el.removeEventListener("raycaster-intersection-cleared", this.rayOut)
    el.removeEventListener("stateadded", this.newState)
    el.removeEventListener("stateremoved", this.delState)
    el.removeEventListener("controllerconnected", this.ctrlConn)
    el.removeEventListener("controllerdisconnected", this.ctrlDisconn)
  },

  rayIn() {
    this.intersections = this.el.components["raycaster"].intersections
  },

  rayOut() {
    this.intersections = []
  },

  newState({ detail }: DetailEvent<string>) {
    switch (detail) {
      case "connected":
        if (this.data.target?.hasLoaded) this.addControls()
        break
      case "hold": // hold an object
        let int: Intersection | any, child: AObject3D, parent: AObject3D
        for (int of this.intersections) {
          parent = int.object.parent
          if (parent.type !== "Group") {
            parent = parent.parent
          }
          child = parent.el.object3D
          this.uuids.push(child.uuid)
          this.el.object3D.attach(child) // copy position and rotation
          //TODO: better base then `children[0]`
          child.children[0].el.emit("hand", true)
        }
        break
      case "exe": // execute something
        let a: AObject3D
        for (a of this.el.object3D.children as AObject3D[]) {
          if (this.uuids.includes(a.uuid)) {
            a.el.addState("exe")
          }
        }
        break
    }
  },

  delState({ detail }: DetailEvent<string>) {
    switch (detail) {
      case "run":
        if (this.data.action === "turn" && this.ext) {
          this.ext.turn = 0
        }
        break
      case "connected":
        this.rmControls()
        break
      case "hold":
        let i = this.uuids.length
        while (i--) {
          let child = this.el.object3D.children.find(obj3d => obj3d.uuid === this.uuids[i])
          if (child) {
            this.uuids.splice(i, 1)
            this.el.sceneEl.object3D.attach(child) // copy position and rotation
            /// @ts-ignore
            child.children[0].el.emit("hand", false)
          }
        }
        break
      case "exe":
        let a
        for (a of this.el.object3D.children) {
          if (this.uuids.includes(a.uuid)) {
            a.el.removeState("exe")
          }
        }
        break
    }
  },

  ctrlConn() {
    this.el.addState("connected")
  },

  ctrlDisconn() {
    this.el.removeState("connected")
  },

  move(x: number, y: number) {
    if (!this.wasd) return

    let keys: EmulatedKeys = {}
    if (y < 0) keys.KeyW = 1
    else if (y > 0) keys.KeyS = 1
    if (x < 0) keys.KeyA = 1
    else if (x > 0) keys.KeyD = 1

    this.wasd.data.acceleration =
      Math.max(Math.abs(y), Math.abs(x)) * (this.acceleration * (this.el.is("run") ? this.data.run : 1))
    this.wasd.keys = keys
  },

  turn(x: number) {
    if (!this.ext) return

    if (x === 0) {
      this.ext.turn = 0
      window.dispatchEvent(new KeyboardEvent("keyup", { key: "Q" }))
    } else if (this.el.is("run")) {
      this.ext.turn = -x
    } else {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: x < 0 ? "Q" : "E" }))
    }
  },

  addWasd(target: Entity) {
    if (!target) return
    this.ext = target.components["wasd-ext"]
    this.wasd = target.components["wasd-controls"]
    if (this.wasd) {
      this.acceleration = this.wasd.data.acceleration
    }
  },

  rmWasd() {
    if (this.wasd && this.acceleration) {
      this.wasd.data.acceleration = this.acceleration
    }
    this.wasd = undefined
    this.ext = undefined
  },

  addControls() {
    let { el, data } = this

    this.addWasd(data.target)

    el.addEventListener("buttonchanged", this.btnChg.bind(this))
    el.addEventListener("axismove", this.axMv.bind(this))
    el.setAttribute("raycaster", { enabled: true })
  },

  rmControls() {
    let { el } = this

    this.rmWasd()

    el.removeEventListener("buttonchanged", this.btnChg)
    el.removeEventListener("axismove", this.axMv)
    el.setAttribute("raycaster", { enabled: false })
  },

  btnChg({ detail }: DetailEvent<ButtonDetail>) {
    let { el } = this
    let fn = detail.state.pressed ? "addState" : "removeState"
    let button
    try {
      button = this.mapping().buttons[detail.id]
    } catch {
      button = ["thumbstick", "trigger", "grip"][detail.id]
    }

    switch (button) {
      case "thumbstick":
        el[fn]("run")
        break
      case "grip":
        el[fn]("hold")
        break
      case "trigger":
        el[fn]("exe")
        el.object3D.userData.exe = detail.state
        break
    }
  },

  axMv({ detail: { axis } }: DetailEvent<AxisDetail>) {
    try {
      // @ts-ignore
      let [x, y] = Object.values(this.mapping().axes)[0]
      this[this.data.action](axis[x], axis[y])
    } catch {
      this[this.data.action](axis[0], axis[1])
    }
  },

  mapping(): ControllerMap {
    let { id, hand } = this.el.components["tracked-controls"].data as { id: number; hand: Hand }
    let mapping: InputMapping = this.el.components[`${id}-controls`].mapping
    return mapping[hand]
  },
})
