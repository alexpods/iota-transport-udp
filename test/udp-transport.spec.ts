import { expect, use } from 'chai'
import { spy, SinonSpy } from 'sinon'

use(require('chai-as-promised'))
use(require('sinon-chai'))

import { Neighbor, Data } from 'iota-gateway'
import { UdpTransport } from '../src/udp-transport'
import { UdpNeighbor } from '../src/udp-neighbor'
import { generateTransaction, generateHash } from './utils'

describe("UdpTransport", () => {
  const localPort  = 3500
  const remotePort = 3600

  let localTransport:  UdpTransport
  let remoteTransport: UdpTransport
  let localNeighbor:   UdpNeighbor
  let remoteNeighbor:  UdpNeighbor

  beforeEach(() => {
    localTransport  = new UdpTransport({ port: localPort  })
    remoteTransport = new UdpTransport({ port: remotePort })

    localNeighbor  = new UdpNeighbor({ host: '127.0.0.1', port: localPort  })
    remoteNeighbor = new UdpNeighbor({ host: '127.0.0.1', port: remotePort })
  })

  afterEach(async () => {
    await Promise.all([localTransport, remoteTransport].map((t) => {
      if (t.isRunning) {
        return t.shutdown()
      }
    }))
  })

  describe("supports(neighbor)", () => {
    it("should return true for udp neighbor", () => {
      expect(localTransport.supports(remoteNeighbor)).to.be.true
    })

    it("should return false for any other neighbor type", () => {
      class NeighborStub extends Neighbor {
        get address() { return '127.0.0.1' }
      }

      expect(localTransport.supports(new NeighborStub())).to.be.false
    })
  })

  describe("run()", () => {
    it('should make isRunning flag return true', async () => {
      expect(localTransport.isRunning).to.be.false
      await expect(localTransport.run()).to.be.fulfilled
      expect(localTransport.isRunning).to.be.true
    })

    it('should be rejected if the transport is already running', async () => {
      await expect(localTransport.run()).to.not.be.rejected
      await expect(localTransport.run()).to.be.rejected
    })

    it("should start receiving packets", async () => {
      const receiveListener = spy()
      const data = { transaction: generateTransaction(), requestHash: generateHash() }

      await localTransport.addNeighbor(remoteNeighbor)
      await remoteTransport.addNeighbor(localNeighbor)
      await remoteTransport.run()

      localTransport.on("receive", receiveListener)

      expect(receiveListener).to.not.have.been.called

      remoteTransport.send(data, localNeighbor)
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(receiveListener).to.not.have.been.called

      await localTransport.run()

      expect(receiveListener).to.not.have.been.called

      await remoteTransport.send(data, localNeighbor)
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(receiveListener).to.have.been.called

      const [receivedData, receivedRequestedHash] = receiveListener.args[0]

      expect(receivedData.transaction.bytes.equals(data.transaction.bytes)).to.be.true
      expect(receivedData.requestHash.bytes.equals(data.requestHash.bytes.slice(0, 46))).to.be.true
    })
  })

  describe("shutdown()", () => {
    beforeEach(async () => {
      await localTransport.run()
    })

    it('should make isRunning flag return false', async () => {
      expect(localTransport.isRunning).to.be.true
      await expect(localTransport.shutdown()).to.be.fulfilled
      expect(localTransport.isRunning).to.be.false
    })

    it('should be rejected if the transport is not running', async () => {
      await expect(localTransport.shutdown()).to.not.be.rejected
      await expect(localTransport.shutdown()).to.be.rejected
    })

    it("should stop receiving packets", async () => {
      const receiveListener = spy()
      const data = { transaction: generateTransaction(), requestHash: generateHash() }

      await localTransport.addNeighbor(remoteNeighbor)
      await remoteTransport.addNeighbor(localNeighbor)
      await remoteTransport.run()

      localTransport.on("receive", receiveListener)

      expect(receiveListener).to.not.have.been.called

      remoteTransport.send(data, localNeighbor)
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(receiveListener).to.have.been.calledOnce

      await localTransport.shutdown()

      expect(receiveListener).to.have.been.calledOnce

      await remoteTransport.send(data, localNeighbor)
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(receiveListener).to.been.calledOnce
    })
  })

  describe("addNeighbor(neighbor)", () => {
    it("should add neighbor to the udp transport", async () => {
      expect(localTransport.getNeighbor(remoteNeighbor.address)).to.be.null
      await expect(localTransport.addNeighbor(remoteNeighbor)).to.be.fulfilled
      expect(localTransport.getNeighbor(remoteNeighbor.address)).to.equal(remoteNeighbor)
    })

    it("should be rejected if the neighbor already exists", async () => {
      await expect(localTransport.addNeighbor(remoteNeighbor)).to.be.fulfilled
      await expect(localTransport.addNeighbor(remoteNeighbor)).to.be.rejected
    })
  })

  describe("removeNeighbor(neighbor)", () => {
    beforeEach(async () => {
      await localTransport.addNeighbor(remoteNeighbor)
    })

    it("should remove the neighbor from the tcp transport", async () => {
      expect(localTransport.getNeighbor(remoteNeighbor.address)).to.equal(remoteNeighbor)
      await expect(localTransport.removeNeighbor(remoteNeighbor)).to.be.fulfilled
      expect(localTransport.getNeighbor(remoteNeighbor.address)).to.be.null
    })

    it("should be rejected if the neighbor does not exist", async () => {
      await expect(localTransport.removeNeighbor(remoteNeighbor)).to.be.fulfilled
      await expect(localTransport.removeNeighbor(remoteNeighbor)).to.be.rejected
    })
  })

  describe("send(data, neighbor)", () => {
    let receiveListener: SinonSpy
    let data: Data

    beforeEach(async () => {
      await localTransport.addNeighbor(remoteNeighbor)
      await remoteTransport.addNeighbor(localNeighbor)

      await localTransport.run()
      await remoteTransport.run()

      remoteTransport.on("receive", receiveListener = spy())

      data = { transaction: generateTransaction(), requestHash: generateHash() }
    })

    it("should send data to the specified neighbor", async () => {
      expect(receiveListener).to.not.have.been.called

      await expect(localTransport.send(data, remoteNeighbor)).to.be.fulfilled
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(receiveListener).to.have.been.called

      const [receivedData, receivedRequestedHash] = receiveListener.args[0]

      expect(receivedData.transaction.bytes.equals(data.transaction.bytes)).to.be.true
      expect(receivedData.requestHash.bytes.equals(data.requestHash.bytes.slice(0, 46))).to.be.true
    })

    it("should be rejected if the transport is not running", async () => {
      await localTransport.shutdown()

      expect(receiveListener).to.not.have.been.called

      await expect(localTransport.send(data, remoteNeighbor)).to.be.rejected
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(receiveListener).to.not.have.been.called
    })

    it("should be rejected if it's restricted to send data to the specified neighbor", async () => {
      await localTransport.removeNeighbor(remoteNeighbor)
      await localTransport.addNeighbor(remoteNeighbor = new UdpNeighbor({ host: '127.0.0.1', port: remotePort, send: false }))

      expect(receiveListener).to.not.have.been.called

      await expect(localTransport.send(data, remoteNeighbor)).to.be.rejected
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(receiveListener).to.not.have.been.called
    })
  })

  describe("receiving data", () => {
    let data: Data
    let neighborListener: SinonSpy
    let receiveListener: SinonSpy

    beforeEach(async () => {
      await localTransport.addNeighbor(remoteNeighbor)
      await remoteTransport.addNeighbor(localNeighbor)

      await localTransport.run()
      await remoteTransport.run()

      localTransport.on("neighbor", neighborListener = spy())
      localTransport.on("receive",  receiveListener = spy())

      data = { transaction: generateTransaction(), requestHash: generateHash() }
    })

    it("shoulld receive data from the remote transport", async () => {
      expect(neighborListener).to.not.have.been.called
      expect(receiveListener).to.not.have.been.called

      await remoteTransport.send(data, localNeighbor)
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(neighborListener).to.not.have.been.called
      expect(receiveListener).to.have.been.called

      const [receivedData, receivedRequestedHash] = receiveListener.args[0]

      expect(receivedData.transaction.bytes.equals(data.transaction.bytes)).to.be.true
      expect(receivedData.requestHash.bytes.equals(data.requestHash.bytes.slice(0, 46))).to.be.true
    })

    it("shoulld not receive data from the unknown neighbor if receiveUnknownNeighbor prop is false", async () => {
      await localTransport.removeNeighbor(remoteNeighbor)

      expect(receiveListener).to.not.have.been.called

      await remoteTransport.send(data, localNeighbor)
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(receiveListener).to.not.have.been.called
    })

    it("should not recieve data from a neighbor with gatewayCanReceiveFrom = false", async () => {
      await localTransport.removeNeighbor(remoteNeighbor)
      await localTransport.addNeighbor(new UdpNeighbor({ host: '127.0.0.1', port: remotePort, receive: false }))

      expect(receiveListener).to.not.have.been.called

      await remoteTransport.send(data, localNeighbor)
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(receiveListener).to.not.have.been.called
    })
  })

  describe("receiving unknown neighbors", () => {
    let receiveListener: SinonSpy
    let neighborListener: SinonSpy
    let localTransport: UdpTransport
    let data: Data

    beforeEach(async () => {
      localTransport = new UdpTransport({ port: localPort, receiveUnknownNeighbor: true })

      localTransport.on("neighbor", neighborListener = spy())
      localTransport.on("receive",  receiveListener = spy())

      await localTransport.run()
      await remoteTransport.run()

      data = { transaction: generateTransaction(), requestHash: generateHash() }
    })

    afterEach(async () => {
      if (localTransport.isRunning) {
        await localTransport.shutdown()
      }
    })

    it("should create a new udp neighbor " +
        "if data received from an unknown neighbor and receiveUnknownNeighbor is true", async () => {

      expect(localTransport.getNeighbor(remoteNeighbor.address)).to.not.be.ok
      expect(receiveListener).to.not.have.been.called
      expect(neighborListener).to.not.have.been.called

      await remoteTransport.send(data, localNeighbor)
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(localTransport.getNeighbor(remoteNeighbor.address)).to.be.ok
      expect(receiveListener).to.have.been.called
      expect(neighborListener).to.have.been.called

      const [receivedData, receivedRequestedHash] = receiveListener.args[0]

      expect(receivedData.transaction.bytes.equals(data.transaction.bytes)).to.be.true
      expect(receivedData.requestHash.bytes.equals(data.requestHash.bytes.slice(0, 46))).to.be.true

      const [receivedNeigbhor] = neighborListener.args[0]

      expect(receivedNeigbhor.address).to.equal(remoteNeighbor.address)
    })
  })
})
