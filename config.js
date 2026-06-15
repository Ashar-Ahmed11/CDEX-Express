const { createConfig, http } = require('@wagmi/core')
const { mainnet, sepolia } = require('@wagmi/core/chains')
const hardhat = require('./customChain')

const { privateKeyToAccount } = require('viem/accounts')


const account = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80') 


const config = createConfig({
  chains: [mainnet, sepolia, hardhat],
  transports: {
    [mainnet.id]: http(),
    [sepolia.id]: http(),
    [hardhat.id]: http("http://127.0.0.1:8545"),
  },
})

module.exports = { config, account }
