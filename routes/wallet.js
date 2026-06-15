const express = require('express')
const router = express.Router()
const { getBalance, getGasPrice, getPublicClient, readContract, waitForTransactionReceipt, writeContract } = require('@wagmi/core')
const { erc20Abi, parseEther } = require('viem')

const fetchUser = require('../middleware/fetchUser')
const User = require('../models/user')
const { config, account } = require('../config')
const SwapRouter = require('../referenceFiles/alpharouter')
const SwapRouterOutput = require('../referenceFiles/alpharouterOutput')

const CHAIN_ID = 31337
const WETH_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
const CREATE2_FACTORY_ADDRESS = "0x8a8C8FB21F3099e787b5ad1221310663d73b1d81"

const create2FactoryAbi = [
    {
        inputs: [{ internalType: 'uint256', name: '_salt', type: 'uint256' }],
        name: 'deploy',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function'
    }
]

const deployWithCreate2Abi = [
    {
        inputs: [
            { internalType: 'address', name: '_tokenIn', type: 'address' },
            { internalType: 'address', name: '_tokenOut', type: 'address' },
            { internalType: 'uint256', name: '_amountIn', type: 'uint256' },
            { internalType: 'bytes', name: '_swapRouterCalldata', type: 'bytes' },
            { internalType: 'bytes', name: '_gasRouterCalldata', type: 'bytes' }
        ],
        name: 'swap',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function'
    }
]

router.post('/', async(req, res) => {
    try {
        const balance = await getBalance(config, {
            chainId: CHAIN_ID,
            address: '0x4557B18E779944BFE9d78A672452331C186a9f48',
        })
        res.send(balance.value.toString())
    } catch (error) {
        console.error(error)
        res.status(500).send('Error fetching balance')
    }
})

router.post('/swap', fetchUser, async(req, res) => {
    try {
        const tokenIn = req.body.tokenIn
        const tokenOut = req.body.tokenOut
        const amountIn = BigInt(req.body.amountIn)

        const user = await User.findById(req.user)
        if (!user) {
            return res.status(404).send('User not found')
        }

        if (!CREATE2_FACTORY_ADDRESS) {
            return res.status(500).send('CREATE2_FACTORY_ADDRESS is not configured')
        }

        const publicClient = getPublicClient(config, { chainId: CHAIN_ID })
        const userAddress = user.address

        const tokenInBalance = await readContract(config, {
            abi: erc20Abi,
            address: tokenIn,
            functionName: 'balanceOf',
            args: [userAddress],
            chainId: CHAIN_ID
        })

        if (amountIn > tokenInBalance) {
            return res.status(400).send('Insufficient token balance')
        }

        const deployedCode = await publicClient.getCode({
            address: userAddress
        })

        let deployHash = null

        if (!deployedCode || deployedCode === '0x') {
            deployHash = await writeContract(config, {
                abi: create2FactoryAbi,
                address: CREATE2_FACTORY_ADDRESS,
                functionName: 'deploy',
                args: [BigInt(user.salt)],
                chainId: CHAIN_ID,
                account: account
            })

            await waitForTransactionReceipt(config, {
                chainId: CHAIN_ID,
                hash: deployHash
            })
        }

        const tokenOutDecimalsRaw = await readContract(config, {
            abi: erc20Abi,
            address: tokenOut,
            functionName: 'decimals',
            chainId: CHAIN_ID
        })
        const tokenOutDecimals = Number(tokenOutDecimalsRaw)

        const tokenInDecimalsRaw = await readContract(config, {
            abi: erc20Abi,
            address: tokenIn,
            functionName: 'decimals',
            chainId: CHAIN_ID
        })
        const tokenInDecimals = Number(tokenInDecimalsRaw)

        const wethDecimalsRaw = await readContract(config, {
            abi: erc20Abi,
            address: WETH_ADDRESS,
            functionName: 'decimals',
            chainId: CHAIN_ID
        })
        const wethDecimals = Number(wethDecimalsRaw)

        const gasSponserSwapCallData = await SwapRouterOutput(
            tokenIn,
            tokenInDecimals,
            WETH_ADDRESS,
            wethDecimals,
            parseEther('1'),
            userAddress
        )

        const swapRouterCalldata = await SwapRouter(
            tokenIn,
            tokenInDecimals,
            tokenOut,
            tokenOutDecimals,
            amountIn * 80n / 100n,
            userAddress
        )

        const estimatedGas = await publicClient.estimateContractGas({
            account: account,
            address: userAddress,
            abi: deployWithCreate2Abi,
            functionName: 'swap',
            args: [
                tokenIn,
                tokenOut,
                amountIn,
                swapRouterCalldata.methodParameters.calldata,
                gasSponserSwapCallData.methodParameters.calldata
            ]
        })

        const gasPrice = await getGasPrice(config, {
            chainId: CHAIN_ID
        })

        const sponsoredGasAmount = estimatedGas * gasPrice

        const gasSponsorRoute = await SwapRouterOutput(
            tokenIn,
            tokenInDecimals,
            WETH_ADDRESS,
            wethDecimals,
            sponsoredGasAmount,
            userAddress
        )

        const platformFeeInToken = amountIn * 3n / 100n;

          // Quote tokenIn -> WETH
          const platformFeeRoute = await SwapRouter(
              tokenIn,
              tokenInDecimals,
              WETH_ADDRESS,
              wethDecimals,
              platformFeeInToken,
              userAddress
          );

          const platformFeeInWeth =BigInt(platformFeeRoute.quote.quotient.toString());


        const sponsoredGasInToken = BigInt(gasSponsorRoute.quote.quotient.toString())+(BigInt(amountIn) * 3n / 100n)

        if (sponsoredGasInToken >= amountIn) {
            return res.status(400).send('Amount is too low after gas sponsorship calculation')
        }

        const gasSponserSwapCallDataLive = await SwapRouterOutput(
            tokenIn,
            tokenInDecimals,
            WETH_ADDRESS,
            wethDecimals,
            sponsoredGasAmount+platformFeeInWeth,
            userAddress
        )

        const swapRouterCalldataLive = await SwapRouter(
            tokenIn,
            tokenInDecimals,
            tokenOut,
            tokenOutDecimals,
            amountIn - sponsoredGasInToken,
            userAddress
        )

        const swapHash = await writeContract(config, {
            abi: deployWithCreate2Abi,
            address: userAddress,
            functionName: 'swap',
            args: [
                tokenIn,
                tokenOut,
                amountIn,
                swapRouterCalldataLive.methodParameters.calldata,
                gasSponserSwapCallDataLive.methodParameters.calldata
            ],
            chainId: CHAIN_ID,
            account: account
        })

        const receipt = await waitForTransactionReceipt(config, {
            chainId: CHAIN_ID,
            hash: swapHash
        })

        res.json({
            deployHash,
            swapHash,
            receipt: {
                transactionHash: receipt.transactionHash,
                status: receipt.status,
                blockNumber: receipt.blockNumber.toString()
            },
            sponsoredGasAmount: sponsoredGasAmount.toString(),
            sponsoredGasInToken: sponsoredGasInToken.toString()
        })
    } catch (error) {
        console.error(error)
        res.status(500).send(error.message || 'Error executing swap')
    }
})

module.exports = router
