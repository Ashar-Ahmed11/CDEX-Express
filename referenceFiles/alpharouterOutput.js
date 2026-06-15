const {
  AlphaRouter,
  SwapType,
} = require("@uniswap/smart-order-router");
const { Token, CurrencyAmount, TradeType, Percent } = require("@uniswap/sdk-core");
const { ethers } = require("ethers");
const { JsonRpcProvider } = require("@ethersproject/providers");
const { parseUnits } = require("@ethersproject/units");

module.exports = async function SwapRouterOutput(_tokenIn,_tokenInDecimals, _tokenOut,_tokenOutDecimals, _amountOut,_recepient) {
  const chainId = 1;

  // ethers v5 provider for AlphaRouter
  const provider = new JsonRpcProvider("https://eth-mainnet.g.alchemy.com/v2/3bP_dCBvn8Y50_cGNX8k26ygTP-P_QSx", chainId);

  const USDT = new Token(
    chainId,
   _tokenIn,
    _tokenInDecimals,
    "TokenA",
    "TokenA"
  );

  const WBTC = new Token(
    chainId,
    _tokenOut,
    _tokenOutDecimals,
    "TokenB",
    "TokenB"
  );

  const alphaRouter = new AlphaRouter({
    chainId,
    provider,
  });

  const amountIn = _amountOut

  const recipient = _recepient;

  const route = await alphaRouter.route(
    CurrencyAmount.fromRawAmount(WBTC, amountIn.toString()),
    USDT,
    TradeType.EXACT_OUTPUT,
    {
      recipient,
      slippageTolerance: new Percent(5000, 10_000), // 0.5%
      deadline: Math.floor(Date.now() / 1000) + 1200, // 20 mins
      type: SwapType.SWAP_ROUTER_02,
    }
  );

  if (!route) throw new Error("No route found");

  // console.log("Expected output:", route.quote.toFixed());
  // console.log("Gas adjusted quote:", route.quoteGasAdjusted.toFixed());
  // console.log("Router address:", route.methodParameters.to);
  // console.log("Value:", route.methodParameters.value);
  // console.log("Calldata:", route.methodParameters.calldata);
  
  // console.log("router", route.route[0].route.pools);

  return route;
  
}

