import { expect, use } from 'chai'
import { spy, SinonSpy } from 'sinon'

use(require('sinon-chai'))

import { Gateway, Data } from 'iota-gateway'

import { UdpTransport } from '../src/udp-transport'
import { UdpNeighbor } from '../src/udp-neighbor'

import { generateTransaction, generateHash } from './utils'

describe("Gateway with udp transport", () => {
  let localPort = 3000
  let remotePort = 3010

  let localGateway: Gateway
  let remoteGateway: Gateway

  let localTransport: UdpTransport
  let remoteTransport: UdpTransport

  let localNeighbor: UdpNeighbor
  let remoteNeighbor: UdpNeighbor

  beforeEach(async () => {
    localGateway = new Gateway({
      neighbors: [
        remoteNeighbor = new UdpNeighbor({ host: '127.0.0.1', port: remotePort })
      ],
      transports: [
        localTransport = new UdpTransport({ port: localPort })
      ]
    })

    remoteGateway = new Gateway({
      neighbors: [
        localNeighbor = new UdpNeighbor({ host: '127.0.0.1', port: localPort })
      ],
      transports: [
        remoteTransport = new UdpTransport({ port: remotePort })
      ]
    })
  })

  afterEach(async () => {
    await [localGateway, remoteGateway].map((gateway: Gateway) => {
      if (gateway.isRunning) {
        return gateway.shutdown()
      }
    })
  })

  it("should launch transports on running", async () => {
    expect(localGateway.isRunning).to.be.false
    expect(localTransport.isRunning).to.be.false

    await localGateway.run()

    expect(localGateway.isRunning).to.be.true
    expect(localTransport.isRunning).to.be.true
  })

  it("should stop transports on shutting down", async () => {
    await localGateway.run()

    expect(localGateway.isRunning).to.be.true
    expect(localGateway.isRunning).to.be.true

    await localGateway.shutdown()

    expect(localGateway.isRunning).to.be.false
    expect(localGateway.isRunning).to.be.false
  })

  it("should send data to the remote gateway", async () => {
    await localGateway.run()
    await remoteGateway.run()

    for (let i = 0; i < 5; ++i) {
      const receiveListener = spy()
      const data: Data = { transaction: generateTransaction(), requestHash: generateHash() }

      remoteGateway.on("receive", receiveListener)

      expect(receiveListener).to.not.have.been.called

      await localGateway.send(data, remoteNeighbor.address)
      await new Promise(resolve => setTimeout(resolve, 50))

      expect(receiveListener).to.have.been.called

      const [receivedData, receivedAddress] = receiveListener.args[0]

      expect(receivedData.transaction.bytes.equals(data.transaction.bytes)).to.be.true
      expect(receivedData.requestHash.bytes.equals(data.requestHash.bytes.slice(0, 46))).to.be.true
      expect(receivedAddress, localNeighbor.address)
    }
  })
})
