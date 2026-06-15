const {
  AlphaRouter,
  SwapType,
} = require("@uniswap/smart-order-router");
const { Token, CurrencyAmount, TradeType, Percent } = require("@uniswap/sdk-core");
const { ethers } = require("ethers");
const { JsonRpcProvider } = require("@ethersproject/providers");
const { parseUnits } = require("@ethersproject/units");

module.exports = async function SwapRouter(_tokenIn,_tokenInDecimals, _tokenOut,_tokenOutDecimals, _amountIn,_recepient) {
  const chainId = 1;

  // ethers v5 provider for AlphaRouter
  const provider = new JsonRpcProvider("https://solitary-young-dew.ethereum-mainnet.quiknode.pro/ec71847cf12fa6ceb8d11fc76ad189b20f2f4685/", chainId);

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

  const amountIn = _amountIn

  const recipient = _recepient;

  const route = await alphaRouter.route(
    CurrencyAmount.fromRawAmount(USDT, amountIn.toString()),
    WBTC,
    TradeType.EXACT_INPUT,
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

