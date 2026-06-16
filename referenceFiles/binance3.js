// scripts/test-create2-flow.js

const { parseEther, parseUnits,formatUnits } = require("ethers");
const { ethers } = require("hardhat");
const SwapRouter = require("./alpharouter.js");
const SwapRouterOutput = require("./alpharouterOutput.js");
async function main() {
    const [signer] = await ethers.getSigners();

    const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
    const DAI_ADDRESS = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
    const RNDR_ADDRESS = "0x514910771AF9Ca656af840dff83E8264EcF986CA";
        const BTC_ADDRESS = "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599";

    const TEN_ETH = ethers.parseEther("10");

    console.log("Signer:", signer.address);

    // =====================================================
    // 1. Deploy Create2Factory
    // =====================================================

    const Factory = await ethers.getContractFactory("Create2Factory");
    const create2Factory = await Factory.deploy();
    await create2Factory.waitForDeployment();

    const factoryAddress = await create2Factory.getAddress();

    console.log("Create2Factory:", factoryAddress);

    // =====================================================
    // 2. Compute CREATE2 Address using salt = 1
    // =====================================================

    const computedAddress = await create2Factory.getWalletAddress(1);

    console.log("Computed Address:", computedAddress);

    // =====================================================
    // 3. Deploy UniswapV3ETHSwapper
    // =====================================================

    const Swapper = await ethers.getContractFactory("UniswapV3ETHSwapper");


    const swapper = await Swapper.deploy();

    await swapper.waitForDeployment();

    const swapperAddress = await swapper.getAddress();

   

// const [bestFee] =
//   await swapper.getBestFeeTier.staticCall(
//     WETH_ADDRESS,
//     DAI_ADDRESS,
//     parseEther("10")
//   );

// console.log("Best Fee:", bestFee);
// // console.log("Best Amount Out:", bestAmountOut.toString());

    console.log("Swapper:", swapperAddress);

    // =====================================================
    // 4. Wrap 10 ETH
    // =====================================================

    const wrapTx = await swapper.wrapETH({
        value: TEN_ETH,
    });

    await wrapTx.wait();

    console.log("Wrapped 10 ETH");

    // =====================================================
    // 5. Transfer 10 WETH to swapper contract
    // =====================================================


        const dai = await ethers.getContractAt(
        "ERC20",
        DAI_ADDRESS
    );

    const weth = await ethers.getContractAt(
        "ERC20",
        WETH_ADDRESS
    );

    const transferTx = await weth.transfer(
        swapperAddress,
        TEN_ETH
    );

    await transferTx.wait();

    console.log("Transferred 10 WETH to swapper");

//     // =====================================================
//     // 6. Swap WETH -> DAI
//     // recipient = computedAddress
//     // =====================================================


    // console.log("Token Symbol:", tokenSymbol);
    const wethdecimalsraw = await weth.decimals();
    const wethdecimals = Number(wethdecimalsraw);

        const daidecimalsraw = await dai.decimals();
    const daidecimals = Number(daidecimalsraw);

     const route = await SwapRouter(
      WETH_ADDRESS,
      wethdecimals,
      DAI_ADDRESS,
      daidecimals,
      TEN_ETH,
      computedAddress
    );

    // console.log("Route:", route);



    const swapTx = await swapper.executeAlphaRouterSwap(
        WETH_ADDRESS,
        TEN_ETH,
          route.methodParameters.calldata,
            {
                value: route.methodParameters.value
            }
    );

    await swapTx.wait();

    console.log("Swapped WETH -> DAI");
    console.log("Recipient:", computedAddress);

    // console.log(swapTx);

    const daiBalance = await dai.balanceOf(
        computedAddress
    );

    console.log(
        "DAI Balance at computed address:",
        ethers.formatUnits(daiBalance, 6)
    );
    

    // =====================================================
    // 7. Deploy CREATE2 Contract
    // =====================================================

    const deployTx = await create2Factory.deploy(1);

    await deployTx.wait();

    console.log("CREATE2 Contract Deployed");

    // =====================================================
    // 8. Create instance at computedAddress
    // =====================================================

    const create2Contract = await ethers.getContractAt(
        "DeployWithCreate2",
        computedAddress
    );

    const theAddress = await create2Contract.getAddress();

    console.log(theAddress);
    

    // =====================================================
    // 9. Estimate gas for swap()
    // =====================================================

    const initiateSwap=async(_tokenIn, _tokenOut,_amountIn)=>{
  const rndr = await ethers.getContractAt(
        "ERC20",
        _tokenOut
    );

    const rndrDecimalsRaw = await rndr.decimals();
    const rndrDecimals = Number(rndrDecimalsRaw);


           const tokenA = await ethers.getContractAt(
        "ERC20",
        _tokenIn
    );

    const tokenADecimalsRaw = await tokenA.decimals();
    const tokenADecimals = Number(tokenADecimalsRaw);


    
    const gasSponserSwapCallData = await SwapRouterOutput(
        _tokenIn,
        tokenADecimals,
      WETH_ADDRESS,
      wethdecimals,
      parseEther("1"),
      computedAddress
    );

      const swapRouterCalldata = await SwapRouter(
          _tokenIn,
          tokenADecimals,
          _tokenOut,
          rndrDecimals,
    _amountIn * 80n / 100n,
      computedAddress
    );


   const estimatedGas =
    await create2Contract.getFunction("swap").estimateGas(
        _tokenIn,
        _tokenOut,
         _amountIn,
      swapRouterCalldata.methodParameters.calldata,
      gasSponserSwapCallData.methodParameters.calldata
    );
const gasPrice = (await ethers.provider.getFeeData()).gasPrice;

    const sponsoredGasAmount =
        estimatedGas*gasPrice;



    console.log(
        "Estimated Gas:",
        sponsoredGasAmount
    );

    const gasSponsorRoute = await SwapRouterOutput(
  _tokenIn,
  tokenADecimals,
  WETH_ADDRESS,
  wethdecimals,
  sponsoredGasAmount+sponsoredGasAmount,
  computedAddress
);

    // console.log(BigInt(gasSponsorRoute.quote.quotient.toString()));

    const sponsoredGasInDai = BigInt(gasSponsorRoute.quote.quotient.toString());
console.log(sponsoredGasInDai)
    
 const gasSponserSwapCallDataLive = await SwapRouterOutput(
        _tokenIn,
        tokenADecimals,
      WETH_ADDRESS,
      wethdecimals,
      sponsoredGasAmount,
      computedAddress
    );

      const swapRouterCalldataLive = await SwapRouter(
          _tokenIn,
          tokenADecimals,
          _tokenOut,
          rndrDecimals,
    _amountIn - sponsoredGasInDai,
      computedAddress
    );


   const create2Swap =
    await create2Contract.swap(
        _tokenIn,
        _tokenOut,
         _amountIn,
      swapRouterCalldataLive.methodParameters.calldata,
      gasSponserSwapCallDataLive.methodParameters.calldata
    );

    create2Swap.wait();
    }
     
    await initiateSwap(DAI_ADDRESS, RNDR_ADDRESS, daiBalance);
    
    console.log("Swap executed via CREATE2 contract");

    const rndr = await ethers.getContractAt(
        "ERC20",
        RNDR_ADDRESS
    );

        const rndrDecimalsRaw = await rndr.decimals();
        const rndrDecimals = Number(rndrDecimalsRaw);
    const rndrBalanceAfter = await rndr.balanceOf(computedAddress);

    console.log("render balance ", formatUnits(rndrBalanceAfter, rndrDecimals));


    
    await initiateSwap(RNDR_ADDRESS, BTC_ADDRESS, rndrBalanceAfter);
       const btc = await ethers.getContractAt(
        "ERC20",
        BTC_ADDRESS
    );

    const newDaiBalance = await btc.balanceOf(computedAddress);
    const btcDecimalsRaw = await btc.decimals();
    const btcDecimals = Number(btcDecimalsRaw);
    console.log("BTC BALANCE ",newDaiBalance);

    const btcBalance= newDaiBalance;

    // ===============================
// Transfer BTC/WBTC to signer
// ===============================

const dummyGasCallData = await SwapRouterOutput(
  BTC_ADDRESS,
  btcDecimals,
  WETH_ADDRESS,
  wethdecimals,
  parseEther("1"),
  computedAddress
);

const estimatedTransferGas =
  await create2Contract.getFunction("transferERC20").estimateGas(
    BTC_ADDRESS,
    btcBalance*50n/100n,
    signer.address,
    dummyGasCallData.methodParameters.calldata
  );

const gasPrice = (await ethers.provider.getFeeData()).gasPrice;
const sponsoredGasAmount = estimatedTransferGas * gasPrice;

console.log("Transfer sponsored gas WETH:", sponsoredGasAmount.toString());

const gasSponsorRoute = await SwapRouterOutput(
  BTC_ADDRESS,
  btcDecimals,
  WETH_ADDRESS,
  wethdecimals,
  sponsoredGasAmount,
  computedAddress
);

const sponsoredGasInBtc = BigInt(gasSponsorRoute.quote.quotient.toString());

const btcAmountToTransfer = btcBalance-sponsoredGasInBtc;

const liveGasCallData = await SwapRouterOutput(
  BTC_ADDRESS,
  btcDecimals,
  WETH_ADDRESS,
  wethdecimals,
  sponsoredGasAmount,
  computedAddress
);
console.log("btc amount to transfer", btcAmountToTransfer);
const transferBtcTx = await create2Contract.transferERC20(
  BTC_ADDRESS,
  btcAmountToTransfer,
  signer.address,
  liveGasCallData.methodParameters.calldata
);

await transferBtcTx.wait();

console.log(
  "BTC transferred to signer:",
  formatUnits(await btc.balanceOf(signer.address), btcDecimals)
);
//      const rndr = await ethers.getContractAt(
//         "ERC20",
//         RNDR_ADDRESS
//     );


//     const rndrDecimalsRaw = await rndr.decimals();
//     const rndrDecimals = Number(rndrDecimalsRaw);

//     const daiBalance = await dai.balanceOf(
//         computedAddress
//     );
//     const tokenSymbol = await dai.symbol();
//     console.log("Token Symbol:", tokenSymbol);
//     const daidecimalsRaw = await dai.decimals();
//     const daidecimals = Number(daidecimalsRaw);
//     // console.log(
//     //     "DAI Decimals:",
//     //     daidecimals
//     // );
    

    
//     console.log(
//         "DAI Balance:",
//         ethers.formatUnits(daiBalance, daidecimals)
//     );



//     const [swapFee] =
//     await swapper.getBestFeeTier.staticCall(
//         DAI_ADDRESS,
//         RNDR_ADDRESS,
//     parseUnits("10", daidecimals),
 
//   );
  

// console.log("Best Fee:", swapFee);

// const [gasSponserFee] =
//   await swapper.getBestFeeTier.staticCall(
//       WETH_ADDRESS,
//       DAI_ADDRESS,
//     parseEther("10")
//   );

// console.log("Best Fee:", gasSponserFee);



//    const estimatedGas =
//     await create2Contract.getFunction("swap").estimateGas(
//         DAI_ADDRESS,
//         RNDR_ADDRESS,
        
//         daiBalance,
//         swapFee,
//           ethers.parseEther("1"),
//         gasSponserFee
//     );

//     const gasPrice = await ethers.provider.getFeeData();

//     const sponsoredGasAmount =
//         estimatedGas;

//     console.log(
//         "Estimated Gas:",
//         estimatedGas
//     );

//     // console.log(
//     //     "Sponsored Gas Amount:",
//     //     sponsoredGasAmount.toString()
//     // );

//     // =====================================================
//     // 10. Balances BEFORE
//     // =====================================================

//     const signerEthBefore =
//         await ethers.provider.getBalance(
//             signer.address
//         );

//     const wethBalanceBefore =
//         await weth.balanceOf(computedAddress);

//     const daiBalanceBefore =
//         await dai.balanceOf(computedAddress);

//     console.log("\n========== BEFORE ==========");
//     console.log(
//         "Signer ETH:",
//         ethers.formatEther(signerEthBefore)
//     );

//     console.log(
//         "Contract WETH:",
//         ethers.formatEther(wethBalanceBefore)
//     );

//     console.log(
//         "Contract DAI:",
//         ethers.formatUnits(
//             daiBalanceBefore,
//             daidecimals
//         )
//     );

//     // =====================================================
//     // 11. Execute swap()
//     // =====================================================

//     const executeTx = await create2Contract.swap(
//         DAI_ADDRESS,
//         RNDR_ADDRESS,
//         // 500, 

//         daiBalance,
//                 swapFee,
//         sponsoredGasAmount,
//         gasSponserFee
//     );

//     await executeTx.wait();

//     console.log("\nswap() executed");

//     // =====================================================
//     // 12. Balances AFTER
//     // =====================================================

//     const signerEthAfter =
//         await ethers.provider.getBalance(
//             signer.address
//         );

//     const wethBalanceAfter =
//         await weth.balanceOf(computedAddress);

//     const daiBalanceAfter =
//         await dai.balanceOf(computedAddress);

//     const rndrBalanceAfter =
//         await rndr.balanceOf(computedAddress);
    
//     const rndrDecimalsRaw = await rndr.decimals();
//     const rndrDecimals = Number(rndrDecimalsRaw);

//     console.log("\n========== AFTER ==========");
//     console.log(
//         "Signer ETH:",
//         ethers.formatEther(signerEthAfter)
//     );

//     console.log(
//         "Contract WETH:",
//         ethers.formatEther(wethBalanceAfter)
//     );

//     console.log(
//         "Contract DAI:",
//         ethers.formatUnits(
//             daiBalanceAfter,
//             daidecimals
//         )
//     );
//     console.log(
//         "Contract RNDR:",
//         ethers.formatUnits(
//             rndrBalanceAfter,
//             rndrDecimals
//         )
//     );


//     // =====================================================
// // 13. Execute reverse swap RNDR -> DAI
// // =====================================================

// console.log("\n\n========== REVERSE SWAP: RNDR -> DAI ==========");

// const rndrBalanceBeforeReverse = await rndr.balanceOf(computedAddress);
// const daiBalanceBeforeReverse = await dai.balanceOf(computedAddress);
// const wethBalanceBeforeReverse = await weth.balanceOf(computedAddress);

// console.log("\n========== BEFORE REVERSE ==========");
// console.log(
//     "Contract RNDR:",
//     ethers.formatUnits(rndrBalanceBeforeReverse, rndrDecimals)
// );
// console.log(
//     "Contract DAI:",
//     ethers.formatUnits(daiBalanceBeforeReverse, daidecimals)
// );
// console.log(
//     "Contract WETH:",
//     ethers.formatEther(wethBalanceBeforeReverse)
// );

// // Best fee for RNDR -> DAI
// const [reverseSwapFee] =
//     await swapper.getBestFeeTier.staticCall(
//         RNDR_ADDRESS,
//         DAI_ADDRESS,
//         rndrBalanceBeforeReverse,
//           {
//             gasLimit: 16_000_000
//         }
//     );

// console.log("Reverse Swap Fee RNDR -> DAI:", reverseSwapFee);

// // Fee tier for gas sponsor swap WETH -> RNDR
// const [reverseGasSponsorFee] =
//     await swapper.getBestFeeTier.staticCall(
//         WETH_ADDRESS,
//         RNDR_ADDRESS,
//         ethers.parseEther("10")
//     );

// console.log("Reverse Gas Sponsor Fee WETH -> RNDR:", reverseGasSponsorFee);

// // Estimate gas for RNDR -> DAI
// const reverseEstimatedGas =
//     await create2Contract.getFunction("swap").estimateGas(
//         RNDR_ADDRESS,
//         DAI_ADDRESS,
//         rndrBalanceBeforeReverse,
//         reverseSwapFee,
//         ethers.parseEther("1"),
//         reverseGasSponsorFee
//     );

// console.log("Reverse Estimated Gas:", reverseEstimatedGas.toString());

// const reverseSponsoredGasAmount = reverseEstimatedGas;

// // Execute reverse swap
// const reverseTx = await create2Contract.swap(
//     RNDR_ADDRESS,
//     DAI_ADDRESS,
//     rndrBalanceBeforeReverse,
//     reverseSwapFee,
//     reverseSponsoredGasAmount,
//     reverseGasSponsorFee
// );

// await reverseTx.wait();

// console.log("\nReverse swap RNDR -> DAI executed");

// // =====================================================
// // 14. Balances AFTER reverse swap
// // =====================================================

// const rndrBalanceAfterReverse = await rndr.balanceOf(computedAddress);
// const daiBalanceAfterReverse = await dai.balanceOf(computedAddress);
// const wethBalanceAfterReverse = await weth.balanceOf(computedAddress);
// const signerEthAfterReverse = await ethers.provider.getBalance(signer.address);

// console.log("\n========== AFTER REVERSE ==========");
// console.log(
//     "Signer ETH:",
//     ethers.formatEther(signerEthAfterReverse)
// );
// console.log(
//     "Contract WETH:",
//     ethers.formatEther(wethBalanceAfterReverse)
// );
// console.log(
//     "Contract DAI:",
//     ethers.formatUnits(daiBalanceAfterReverse, daidecimals)
// );
// console.log(
//     "Contract RNDR:",
//     ethers.formatUnits(rndrBalanceAfterReverse, rndrDecimals)
// );
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});