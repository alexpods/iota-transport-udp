import { Neighbor } from 'iota-gateway'

export class UdpNeighbor extends Neighbor {
  private _host: string
  private _port: number

  constructor(params: {
    host: string
    port: number
  }) {
    super()
    this._host = String(params.host)
    this._port = Number(params.port)
  }

  get address(): string {
    return this._host
  }

  get port(): number {
    return this._port
  }
}
