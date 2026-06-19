const express = require('express')
const router = express.Router()
const { getBalance, getGasPrice, getPublicClient, readContract, waitForTransactionReceipt, writeContract } = require('@wagmi/core')
const { erc20Abi, parseEther } = require('viem')

const fetchUser = require('../middleware/fetchUser')
const User = require('../models/user')
const Transaction = require('../models/transactions')
const { config, account } = require('../config')
const SwapRouter = require('../referenceFiles/alpharouter')
const SwapRouterOutput = require('../referenceFiles/alpharouterOutput')

const CHAIN_ID = 31337
const WETH_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
const CREATE2_FACTORY_ADDRESS = "0x40D8D1afeeD9f58B78e70c0e2c0E80008f3E5931"

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
    },
    {
        inputs: [
            { internalType: 'address', name: '_token', type: 'address' },
            { internalType: 'uint256', name: '_amount', type: 'uint256' },
            { internalType: 'address', name: 'toAddress', type: 'address' },
            { internalType: 'bytes', name: '_gasRouterCalldata', type: 'bytes' }
        ],
        name: 'transferERC20',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function'
    }
]

const decimalsCache = new Map()

async function getTokenDecimalsCached(tokenAddress) {
    const cacheKey = tokenAddress.toLowerCase()

    if (decimalsCache.has(cacheKey)) {
        return decimalsCache.get(cacheKey)
    }

    const decimalsRaw = await readContract(config, {
        abi: erc20Abi,
        address: tokenAddress,
        functionName: 'decimals',
        chainId: CHAIN_ID
    })
    const decimals = Number(decimalsRaw)
    decimalsCache.set(cacheKey, decimals)

    return decimals
}

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

        const [tokenInBalance, userPreviousBalance] = await Promise.all([
            readContract(config, {
                abi: erc20Abi,
                address: tokenIn,
                functionName: 'balanceOf',
                args: [userAddress],
                chainId: CHAIN_ID
            }),
            readContract(config, {
                abi: erc20Abi,
                address: tokenOut,
                functionName: 'balanceOf',
                args: [userAddress],
                chainId: CHAIN_ID
            })
        ])

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
            parseEther('0.0001'),
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
console.log('gas estimation started')
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

        console.log('gas estimation ended')
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
// more gas will be deducted and less amount will be swapped from the user.

        const sponsoredGasInToken = BigInt(gasSponsorRoute.quote.quotient.toString())+(BigInt(amountIn) * 5n / 100n)

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
        console.log("transaction initiated")
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

        const userNewBalance = await readContract(config, {
            abi: erc20Abi,
            address: tokenOut,
            functionName: 'balanceOf',
            args: [userAddress],
            chainId: CHAIN_ID
        })
        const transactionTokenOutAmount = userNewBalance - userPreviousBalance

        if (!Array.isArray(user.assets)) {
            user.assets = []
        }

        const tokenOutExists = user.assets.some(
            (assetAddress) => assetAddress.toLowerCase() === tokenOut.toLowerCase()
        )

        if (!tokenOutExists) {
            user.assets.push(tokenOut)
            await user.save()
        }

        await Transaction.create({
            transactionType: 'swap',
            transferToken: null,
            transferTokenAmount: null,
            from: null,
            to: null,
            swapper: userAddress,
            tokenIn,
            tokenOut,
            tokenOutAmount: transactionTokenOutAmount.toString()
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

router.get('/swap-quote', fetchUser, async(req, res) => {
    try {
        const tokenIn = req.body.tokenIn ?? req.query.tokenIn
        const tokenOut = req.body.tokenOut ?? req.query.tokenOut
        const amountInRaw = req.body.amountIn ?? req.query.amountIn

        if (!tokenIn || !tokenOut || !amountInRaw) {
            return res.status(400).send('tokenIn, tokenOut and amountIn are required')
        }

        const amountIn = BigInt(amountInRaw)

        const user = await User.findById(req.user)
        if (!user) {
            return res.status(404).send('User not found')
        }

        if (!CREATE2_FACTORY_ADDRESS) {
            return res.status(500).send('CREATE2_FACTORY_ADDRESS is not configured')
        }

        const publicClient = getPublicClient(config, { chainId: CHAIN_ID })
        const userAddress = user.address

        const [
            tokenInBalance,
            tokenOutDecimals,
            tokenInDecimals,
            wethDecimals,
            gasPrice
        ] = await Promise.all([
            readContract(config, {
                abi: erc20Abi,
                address: tokenIn,
                functionName: 'balanceOf',
                args: [userAddress],
                chainId: CHAIN_ID
            }),
            getTokenDecimalsCached(tokenOut),
            getTokenDecimalsCached(tokenIn),
            getTokenDecimalsCached(WETH_ADDRESS),
            getGasPrice(config, {
                chainId: CHAIN_ID
            })
        ])

        if (amountIn > tokenInBalance) {
            return res.status(400).send('Insufficient token balance')
        }

        const [gasSponserSwapCallData, swapRouterCalldata] = await Promise.all([
            SwapRouterOutput(
                tokenIn,
                tokenInDecimals,
                WETH_ADDRESS,
                wethDecimals,
                parseEther('0.5'),
                userAddress
            ),
            SwapRouter(
                tokenIn,
                tokenInDecimals,
                tokenOut,
                tokenOutDecimals,
                amountIn * 50n / 100n,
                userAddress
            )
        ])

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

        const sponsoredGasAmount = estimatedGas * gasPrice

        const gasSponsorRoute = await SwapRouterOutput(
            tokenIn,
            tokenInDecimals,
            WETH_ADDRESS,
            wethDecimals,
            sponsoredGasAmount,
            userAddress
        )

        const estimatedGasInToken = BigInt(gasSponsorRoute.quote.quotient.toString()) + (BigInt(amountIn) * 5n / 100n)

        if (estimatedGasInToken >= amountIn) {
            return res.status(400).send('Amount is too low after gas sponsorship calculation')
        }

        const swapRouterCalldataLive = await SwapRouter(
            tokenIn,
            tokenInDecimals,
            tokenOut,
            tokenOutDecimals,
            amountIn - estimatedGasInToken,
            userAddress
        )

        res.json({
            quoteAmountOut: swapRouterCalldataLive.quote.quotient.toString(),
            estimatedGasInToken: estimatedGasInToken.toString()
        })
    } catch (error) {
        console.error(error)
        res.status(500).send(error.message || 'Error calculating swap quote')
    }
})

router.get('/quick-swap-quote', fetchUser, async(req, res) => {
    try {
        const tokenIn = req.body.tokenIn ?? req.query.tokenIn
        const tokenInDecimalsRaw = req.body.tokenInDecimals ?? req.query.tokenInDecimals
        const tokenOut = req.body.tokenOut ?? req.query.tokenOut
        const tokenOutDecimalsRaw = req.body.tokenOutDecimals ?? req.query.tokenOutDecimals
        const amountInRaw = req.body.amountIn ?? req.query.amountIn

        if (!tokenIn || !tokenInDecimalsRaw || !tokenOut || !tokenOutDecimalsRaw || !amountInRaw) {
            return res.status(400).send('tokenIn, tokenInDecimals, tokenOut, tokenOutDecimals and amountIn are required')
        }

        const tokenInDecimals = Number(tokenInDecimalsRaw)
        const tokenOutDecimals = Number(tokenOutDecimalsRaw)
        const amountIn = BigInt(amountInRaw)

        if (!Number.isFinite(tokenInDecimals) || !Number.isFinite(tokenOutDecimals)) {
            return res.status(400).send('tokenInDecimals and tokenOutDecimals must be valid numbers')
        }

        const user = await User.findById(req.user)
        if (!user) {
            return res.status(404).send('User not found')
        }

        const route = await SwapRouter(
            tokenIn,
            tokenInDecimals,
            tokenOut,
            tokenOutDecimals,
            amountIn,
            user.address
        )

        res.json({
            quoteAmountOut: route.quote.quotient.toString()
        })
    } catch (error) {
        console.error(error)
        res.status(500).send(error.message || 'Error calculating quick swap quote')
    }
})

router.get("/quote", async (req, res) => {
  try {
    const tokenIn = req.body.tokenIn ?? req.query.tokenIn;
    const tokenInDecimals =
      Number(req.body.tokenInDecimals ?? req.query.tokenInDecimals);

    const tokenOut = req.body.tokenOut ?? req.query.tokenOut;
    const tokenOutDecimals =
      Number(req.body.tokenOutDecimals ?? req.query.tokenOutDecimals);

    const amountIn = BigInt(
      req.body.amountIn ?? req.query.amountIn
    );

    const response = await fetch(
      "https://trade-api.gateway.uniswap.org/v1/quote",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": "sAyxwnSwU7SJvagVbnUBZVXNhEBBVCu9HmRJEuZcthU",
        },
        body: JSON.stringify({
          type: "EXACT_INPUT",
          amount: amountIn.toString(),
          tokenIn,
          tokenOut,
          swapper:CREATE2_FACTORY_ADDRESS,
          tokenInChainId: 1,
          tokenOutChainId: 1,
          protocols: ["V3"],
          routingPreference: "BEST_PRICE",
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText);
    }

    const quote = await response.json();

    const amountOutRaw = BigInt(
      quote.quote.output.amount
    );

    return res.json({
      amountOutRaw: amountOutRaw.toString(),
      amountOut:
        Number(amountOutRaw) / 10 ** tokenOutDecimals,
      quote,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: error.message,
    });
  }
});

router.post('/transfer', fetchUser, async(req, res) => {
    try {
        const token = req.body.token
        const amount = BigInt(req.body.amount)
        const toAddress = req.body.toAddress

        const user = await User.findById(req.user)
        if (!user) {
            return res.status(404).send('User not found')
        }

        if (!CREATE2_FACTORY_ADDRESS) {
            return res.status(500).send('CREATE2_FACTORY_ADDRESS is not configured')
        }

        const publicClient = getPublicClient(config, { chainId: CHAIN_ID })
        const userAddress = user.address

        const tokenBalance = await readContract(config, {
            abi: erc20Abi,
            address: token,
            functionName: 'balanceOf',
            args: [userAddress],
            chainId: CHAIN_ID
        })
        const userPreviousBalance = tokenBalance
        // console.log("Token Balance:", tokenBalance.toString())
        if (amount > tokenBalance) {
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

        const tokenDecimalsRaw = await readContract(config, {
            abi: erc20Abi,
            address: token,
            functionName: 'decimals',
            chainId: CHAIN_ID
        })
        const tokenDecimals = Number(tokenDecimalsRaw)

        const wethDecimalsRaw = await readContract(config, {
            abi: erc20Abi,
            address: WETH_ADDRESS,
            functionName: 'decimals',
            chainId: CHAIN_ID
        })
        const wethDecimals = Number(wethDecimalsRaw)

        const dummyGasCallData = await SwapRouterOutput(
            token,
            tokenDecimals,
            WETH_ADDRESS,
            wethDecimals,
            parseEther('0.0001'),
            userAddress
        )

        const estimatedTransferGas = await publicClient.estimateContractGas({
            account: account,
            address: userAddress,
            abi: deployWithCreate2Abi,
            functionName: 'transferERC20',
            args: [
                token,
                amount*50n/100n,
                toAddress,
                dummyGasCallData.methodParameters.calldata
            ]
        })

        const gasPrice = await getGasPrice(config, {
            chainId: CHAIN_ID
        })


        
        const platformFeeInToken = amount * 5n / 100n;

          // Quote tokenIn -> WETH
          const platformFeeRoute = await SwapRouter(
              token,
              tokenDecimals,
              WETH_ADDRESS,
              wethDecimals,
              platformFeeInToken,
              userAddress
          );

          const platformFeeInWeth =BigInt(platformFeeRoute.quote.quotient.toString());

// 2% difference


        const sponsoredGasAmount = estimatedTransferGas * gasPrice

        const gasSponsorRoute = await SwapRouterOutput(
            token,
            tokenDecimals,
            WETH_ADDRESS,
            wethDecimals,
            sponsoredGasAmount+platformFeeInWeth,
            userAddress
        )

        const sponsoredGasInToken = BigInt(gasSponsorRoute.quote.quotient.toString())
        const amountToTransfer = amount - (BigInt(amount)* 3n / 100n)

        if (amountToTransfer <= 0n) {
            return res.status(400).send('Amount is too low after gas sponsorship calculation')
        }

        const liveGasCallData = await SwapRouterOutput(
            token,
            tokenDecimals,
            WETH_ADDRESS,
            wethDecimals,
            sponsoredGasAmount,
            userAddress
        )

        const transferHash = await writeContract(config, {
            abi: deployWithCreate2Abi,
            address: userAddress,
            functionName: 'transferERC20',
            args: [
                token,
                amountToTransfer,
                toAddress,
                liveGasCallData.methodParameters.calldata
            ],
            chainId: CHAIN_ID,
            account: account
        })

        const receipt = await waitForTransactionReceipt(config, {
            chainId: CHAIN_ID,
            hash: transferHash
        })

        const userNewBalance = await readContract(config, {
            abi: erc20Abi,
            address: token,
            functionName: 'balanceOf',
            args: [userAddress],
            chainId: CHAIN_ID
        })
        const transferTokenAmount = userNewBalance - userPreviousBalance

        await Transaction.create({
            transactionType: 'transfer',
            transferToken: token,
            transferTokenAmount: transferTokenAmount.toString(),
            from: userAddress,
            to: toAddress,
            swapper: null,
            tokenIn: null,
            tokenOut: null,
            tokenOutAmount: null
        })

        res.json({
            deployHash,
            transferHash,
            amountToTransfer: amountToTransfer.toString(),
            sponsoredGasAmount: sponsoredGasAmount.toString(),
            sponsoredGasInToken: sponsoredGasInToken.toString(),
            receipt: {
                transactionHash: receipt.transactionHash,
                status: receipt.status,
                blockNumber: receipt.blockNumber.toString()
            }
        })
    } catch (error) {
        console.error(error)
        res.status(500).send(error.message || 'Error executing transfer')
    }
})

router.get('/transactions', fetchUser, async(req, res) => {
    try {
        const user = await User.findById(req.user).select('address')

        if (!user) {
            return res.status(404).send('User not found')
        }

        const transactions = await Transaction.find({
            $or: [
                { from: user.address },
                { to: user.address },
                { swapper: user.address }
            ]
        }).sort({ _id: -1 })

        res.json(transactions)
    } catch (error) {
        console.error(error)
        res.status(500).send(error.message || 'Error fetching transactions')
    }
})

module.exports = router
