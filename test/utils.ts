import { Transaction, Hash, factory } from 'iota-tangle'

export function generateTransaction (): Transaction {
  const buffer = Buffer.alloc(1604)

  buffer.write(String(Math.random()), 0, 18)

  return factory.createTransactionFromBytes(buffer)
}

export function generateHash (): Hash {
  const buffer = Buffer.alloc(49)

  buffer.write(String(Math.random()), 0, 18)

  return factory.createHashFromBytes(buffer)
}
