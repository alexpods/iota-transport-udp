import { expect } from 'chai'
import { UdpNeighbor } from '../src/udp-neighbor'

describe("UdpNeighbor", () => {
  let neighbor: UdpNeighbor

  beforeEach(() => {
    neighbor = new UdpNeighbor({ host: 'google.com', port: 80 })
  })

  describe("match(neighborAddress)", () => {
    it("should return true if address is equal to the neighbor's host", () => {
      expect(neighbor.match("google.com")).to.be.true
    })
  })
})
