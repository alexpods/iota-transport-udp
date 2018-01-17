import { Socket, createSocket, AddressInfo } from 'dgram'
import { Serializer, Factory } from 'iota-tangle'
import { Transport, Neighbor, Data, Packer } from 'iota-gateway'
import { UdpNeighbor } from './udp-neighbor';

const globalSerializer = new Serializer()
const globalFactory    = new Factory({ serializer: globalSerializer })
const globalPacker     = new Packer({ factory: globalFactory })

export class UdpTransport extends Transport {
  private _host: string|undefined
  private _port: number

  private _isRunning   = false

  private _packer: Packer
  private _receiveUnknownNeighbor: boolean

  private _socket: Socket|null = null
  private _neighbors = new Set<UdpNeighbor>()

  private _onSocketMessage: ((packet: Buffer, rinfo: AddressInfo) => void)|null = null
  private _onSocketError:   ((error: any) => void)|null = null
  private _onSocketClose:   (() => void)|null = null

  constructor(params: {
    host?: string
    port: number
    packer?: Packer
    receiveUnknownNeighbor?: boolean
  }) {
    super()
    this._host = typeof params.host !== 'undefined' ? String(params.host) : undefined
    this._port = Number(params.port)

    this._packer = typeof params.packer !== 'undefined' ? params.packer : globalPacker

    this._receiveUnknownNeighbor = Boolean(params.receiveUnknownNeighbor)
  }

  get isRunning(): boolean {
    return this._isRunning
  }

  supports(neighbor: Neighbor): boolean {
    return neighbor instanceof UdpNeighbor
  }

  getNeighbor(neighborAddress: string): UdpNeighbor|null {
    for (const neighbor of this._neighbors) {
      if (neighbor.match(neighborAddress)) {
        return neighbor
      }
    }

    return null
  }

  async addNeighbor(neighbor: UdpNeighbor): Promise<void> {
    if (this._neighbors.has(neighbor)) {
      throw new Error(`Couldn't add a neighbor: the neighbor '${neighbor.address}' already exists!`)
    }

    this._neighbors.add(neighbor)
  }

  async removeNeighbor(neighbor: UdpNeighbor): Promise<void> {
    if (!this._neighbors.has(neighbor)) {
      throw new Error(`Couldn't remove a neighbor: the neighbor '${neighbor.address}' doesn't exists!`)
    }

    this._neighbors.delete(neighbor)
  }

  async run(): Promise<void> {
    if (this._isRunning) {
      throw new Error('The udp transport is already running!')
    }

    const socket = createSocket({ type: 'udp4' })

    await new Promise((resolve, reject) => {
      let onListening, onError

      socket.on("listening", onListening = () => {
        socket.removeListener("listening", onListening)
        socket.removeListener("error", onError)
        resolve()
      })

      socket.on("error", onError = (error: any) => {
        socket.removeListener("listening", onListening)
        socket.removeListener("error", onError)
        reject(error)
      })

      socket.bind(this._port)
    })

    let onMessage, onError, onClose

    socket.on("message", onMessage = (packet: Buffer, rinfo: AddressInfo) => {
      let neighbor = this.getNeighbor(rinfo.address)

      if (!neighbor) {
        if (this._receiveUnknownNeighbor) {
          neighbor = new UdpNeighbor({ host: rinfo.address, port: rinfo.port })
          this.addNeighbor(neighbor)
          this.emit("neighbor", neighbor)
        } else {
          return
        }
      }

      if (!neighbor.gatewayCanReceiveFrom) {
        return
      }

      let data: Data

      try {
        data = this._packer.unpack(packet)
      } catch (error) {}


      if (data) {
        this.emit("receive", data, neighbor)
      }
    })

    socket.on("error", onError = (error: any) => {
      this.emit("error", error)
    })

    socket.on("close", onClose = () => {
      this.shutdown()
    })

    this._socket = socket

    this._onSocketMessage = onMessage
    this._onSocketError   = onError
    this._onSocketClose   = onClose

    this._isRunning = true
  }

  async shutdown(): Promise<void> {
    if (!this._isRunning) {
      throw new Error('The udp transport is not running!')
    }

    const socket = this._socket

    socket.removeListener("message", this._onSocketMessage)
    socket.removeListener("error", this._onSocketError)
    socket.removeListener("close", this._onSocketClose)

    this._onSocketMessage = null
    this._onSocketError = null
    this._onSocketClose = null

    await new Promise((resolve) => {
      let onClose = () => {
        socket.removeListener("error", onClose)
        socket.removeListener("close", onClose)
        resolve()
      }

      socket.on("close", onClose)
      socket.on("error", onClose)

      socket.close()
    })

    this._socket = null

    this._isRunning = false
  }

  async send(data: Data, neighbor: UdpNeighbor): Promise<void> {
    if (!this._isRunning) {
      throw new Error("Couldn't send data to the neighbor: the transport is not running!")
    }

    if (!neighbor.gatewayCanSendTo) {
      throw new Error(`It's restricted to send data to the neighbor with address "${neighbor.address}"!`)
    }

    const address = neighbor.address
    const port    = neighbor.port

    const packet = this._packer.pack(data)

    await new Promise(resolve => this._socket.send(packet, port, address, resolve))
  }
}