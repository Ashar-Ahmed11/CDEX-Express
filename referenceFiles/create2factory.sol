// SPDX-License-Identifier: MIT
pragma solidity ^0.8.14;
// DeployWithCreate2 contract that takes an owner address in its constructor
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
using SafeERC20 for IERC20;
interface IQuoter {
    function quoteExactInputSingle(
        address tokenIn,
        address tokenOut,
        uint24 fee,
        uint256 amountIn,
        uint160 sqrtPriceLimitX96
    ) external returns (uint256 amountOut);
}

interface IUniswapV3SwapCallback {
    /// @notice Called to `msg.sender` after executing a swap via IUniswapV3Pool#swap.
    /// @dev In the implementation you must pay the pool tokens owed for the swap.
    /// The caller of this method must be checked to be a UniswapV3Pool deployed by the canonical UniswapV3Factory.
    /// amount0Delta and amount1Delta can both be 0 if no tokens were swapped.
    /// @param amount0Delta The amount of token0 that was sent (negative) or must be received (positive) by the pool by
    /// the end of the swap. If positive, the callback must send that amount of token0 to the pool.
    /// @param amount1Delta The amount of token1 that was sent (negative) or must be received (positive) by the pool by
    /// the end of the swap. If positive, the callback must send that amount of token1 to the pool.
    /// @param data Any data passed through by the caller via the IUniswapV3PoolActions#swap call
    function uniswapV3SwapCallback(
        int256 amount0Delta,
        int256 amount1Delta,
        bytes calldata data
    ) external;
}

interface IWETH {
    function deposit() external payable;
     function withdraw(uint256 amount) external;
    function transfer(address to, uint value) external returns (bool);
}
 

interface ISwapRouter is IUniswapV3SwapCallback {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    /// @notice Swaps `amountIn` of one token for as much as possible of another token
    /// @param params The parameters necessary for the swap, encoded as `ExactInputSingleParams` in calldata
    /// @return amountOut The amount of the received token
    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);

    struct ExactInputParams {
        bytes path;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
    }

    /// @notice Swaps `amountIn` of one token for as much as possible of another along the specified path
    /// @param params The parameters necessary for the multi-hop swap, encoded as `ExactInputParams` in calldata
    /// @return amountOut The amount of the received token
    function exactInput(ExactInputParams calldata params) external payable returns (uint256 amountOut);

    struct ExactOutputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountOut;
        uint256 amountInMaximum;
        uint160 sqrtPriceLimitX96;
    }

    /// @notice Swaps as little as possible of one token for `amountOut` of another token
    /// @param params The parameters necessary for the swap, encoded as `ExactOutputSingleParams` in calldata
    /// @return amountIn The amount of the input token
    function exactOutputSingle(ExactOutputSingleParams calldata params) external payable returns (uint256 amountIn);

    struct ExactOutputParams {
        bytes path;
        address recipient;
        uint256 deadline;
        uint256 amountOut;
        uint256 amountInMaximum;
    }

    /// @notice Swaps as little as possible of one token for `amountOut` of another along the specified path (reversed)
    /// @param params The parameters necessary for the multi-hop swap, encoded as `ExactOutputParams` in calldata
    /// @return amountIn The amount of the input token
    function exactOutput(ExactOutputParams calldata params) external payable returns (uint256 amountIn);
}

contract UniswapV3ETHSwapper {
    // Uniswap V3 Router (Mainnet)
    ISwapRouter public constant swapRouter =
        ISwapRouter(0xE592427A0AEce92De3Edee1F18E0157C05861564);

    // Mainnet WETH Address
    address public constant WETH =0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

    event SwapExecuted(
        address indexed user,
        address indexed tokenOut,
        uint256 ethIn,
        uint256 amountOut
    );

    /*
        Swap ETH -> Any Token

        Example:
        ETH -> WETH
        ETH -> USDC
        ETH -> DAI
        ETH -> UNI

        Parameters:
        _tokenOut = token you want to receive
        _fee = pool fee tier (usually 3000)
        _amountOutMin = slippage protection
    */
    function swapTokenForTokenOut (
    address _tokenIn,
    address _tokenOut,
    uint24 _fee,
    uint256 _amountIn,
    uint256 _amountOut,
    address _recepient
) public returns (uint256 amountOut) {
    require(_tokenIn != address(0), "Invalid tokenIn");
    require(_tokenOut != address(0), "Invalid tokenOut");
    require(_tokenIn != _tokenOut, "Same token");
    require(_amountIn > 0, "Amount must be > 0");
    require(_recepient != address(0), "Invalid Recepient");

    // Transfer tokenIn from user to this contract
    // IERC20(_tokenIn).transferFrom(
    //     msg.sender,
    //     address(this),
    //     _amountIn
    // );

    // Approve Uniswap router to spend tokenIn
    // IERC20(_tokenIn).approve(
    //     address(swapRouter),
    //     _amountIn
    // );

    IERC20(_tokenIn).forceApprove(
    address(swapRouter),
    _amountIn
    );

    ISwapRouter.ExactOutputSingleParams memory params =
        ISwapRouter.ExactOutputSingleParams({
            tokenIn: _tokenIn,
            tokenOut: _tokenOut,
            fee: _fee,
            recipient: _recepient, // tokens go directly to user
            deadline:block.timestamp+500,
            amountOut: _amountOut,
            amountInMaximum: _amountIn,
            sqrtPriceLimitX96: 0
        });


    // Execute swap
    amountOut = swapRouter.exactOutputSingle(params);

    emit SwapExecuted(
        msg.sender,
        _tokenOut,
        _amountIn,
        amountOut
    );
}

function swapTokenForToken (
    address _tokenIn,
    address _tokenOut,
    uint24 _fee,
    uint256 _amountIn,
    address _recepient
) public returns (uint256 amountOut) {
    require(_tokenIn != address(0), "Invalid tokenIn");
    require(_tokenOut != address(0), "Invalid tokenOut");
    require(_tokenIn != _tokenOut, "Same token");
    require(_amountIn > 0, "Amount must be > 0");
    require(_recepient != address(0), "Invalid Recepient");

    // Transfer tokenIn from user to this contract
    // IERC20(_tokenIn).transferFrom(
    //     msg.sender,
    //     address(this),
    //     _amountIn
    // );

    // Approve Uniswap router to spend tokenIn
    // IERC20(_tokenIn).approve(
    //     address(swapRouter),
    //     _amountIn
    // );


    IERC20(_tokenIn).forceApprove(
    address(swapRouter),
    _amountIn
    );

    ISwapRouter.ExactInputSingleParams memory params =
        ISwapRouter.ExactInputSingleParams({
            tokenIn: _tokenIn,
            tokenOut: _tokenOut,
            fee: _fee,
            recipient: _recepient, // tokens go directly to user
            deadline:block.timestamp+500,
            amountIn: _amountIn,
            amountOutMinimum: 0,
            sqrtPriceLimitX96: 0
        });


    // Execute swap
    amountOut = swapRouter.exactInputSingle(params);

    emit SwapExecuted(
        msg.sender,
        _tokenOut,
        _amountIn,
        amountOut
    );
}


    /*
        Helper: Swap ETH -> WETH directly

        Uses standard 0.3% pool fee = 3000
    */
   



    function wrapETH() external payable {
    require(msg.value > 0, "Send ETH");

    IWETH(WETH).deposit{value: msg.value}();

    IWETH(WETH).transfer(msg.sender, msg.value);    
    }

    




 function wethBalance() public view returns (uint256) {
            IERC20 WETH = IERC20(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);

             return WETH.balanceOf(msg.sender);
        }


    IQuoter public constant quoter =
    IQuoter(0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6);

function getBestFeeTier(
    address _tokenIn,
    address _tokenOut,
    uint256 _amountIn
) public returns (uint24 bestFee, uint256 bestAmountOut) {
    require(_tokenIn != address(0), "Invalid tokenIn");
    require(_tokenOut != address(0), "Invalid tokenOut");
    require(_tokenIn != _tokenOut, "Same token");
    require(_amountIn > 0, "Amount must be > 0");

    uint24[4] memory feeTiers = [uint24(100), uint24(500), uint24(3000), uint24(10000)];

    for (uint256 i = 0; i < feeTiers.length; i++) {
        try quoter.quoteExactInputSingle(
            _tokenIn,
            _tokenOut,
            feeTiers[i],
            _amountIn,
            0
        ) returns (uint256 amountOut) {
            if (amountOut > bestAmountOut) {
                bestAmountOut = amountOut;
                bestFee = feeTiers[i];
            }
        } catch {
            // Pool does not exist / no liquidity / quote failed
        }
    }

    require(bestFee != 0, "No valid pool found");
}
// function executeAlphaRouterSwap(
//     address _tokenIn,
//     uint256 _amountIn,
//     bytes calldata _routerCalldata
// ) public payable returns (bytes memory result) {
//     address router = 0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45;



//     IERC20(_tokenIn).forceApprove(router, _amountIn);

//     (bool success, bytes memory data) =
//         router.call{value: msg.value}(_routerCalldata);

//     if (!success) {
//         assembly {
//             revert(add(data, 32), mload(data))
//         }
//     }

//     return data;
// }


function executeAlphaRouterSwap(
    address _tokenIn,
    uint256 _amountIn,
    bytes calldata _routerCalldata
) public payable returns (bytes memory result) {
    require(_tokenIn != address(0), "Invalid tokenIn");
    require(_amountIn > 0, "Invalid amount");

    IERC20(_tokenIn).forceApprove(
        address(0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45),
        _amountIn
    );

    (bool success, bytes memory data) =
        address(0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45).call{value: msg.value}(_routerCalldata);

    require(success, "AlphaRouter swap failed");

    return data;
}

    // Allow contract to receive ETH
    receive() external payable {}
}



contract DeployWithCreate2 is UniswapV3ETHSwapper{
    address public owner;
    constructor(address _owner
    // ,  address _tokenIn,address _tokenOut,uint256 _amountIn,uint256 sponsoredGas
    ) {
        owner = _owner;
        // the contract must have erc20 tokens in it before deployment
        // swap(_tokenIn,_tokenOut,_amountIn,sponsoredGas);
    }
    function swap(address _tokenIn,address _tokenOut,uint256 _amountIn,bytes calldata _swapRouterCalldata,bytes calldata _gasRouterCalldata) public {
            IERC20 weth = IERC20(WETH);
            // IERC20 tokenA = IERC20(_tokenIn);
            // uint256 previousTokenInBalance = tokenA.balanceOf(address(this));
            uint256 previousBalance = weth.balanceOf(address(this));
      
            executeAlphaRouterSwap(_tokenIn, _amountIn, _gasRouterCalldata);


             uint256 newBalance = weth.balanceOf(address(this))-previousBalance;
             IWETH(WETH).withdraw(newBalance);
             payable(address(owner)).transfer(newBalance);

                    // uint256 newTokenInBalance = previousTokenInBalance-tokenA.balanceOf(address(this));

            // _amountIn-=newTokenInBalance;

            // swapTokenForToken(_tokenIn, _tokenOut, feeTier, _amountIn, address(this));
                  executeAlphaRouterSwap(_tokenIn, _amountIn, _swapRouterCalldata);

    }

    function transferERC20(address _token,uint256 _amount,address toAddress,bytes calldata _gasRouterCalldata) public {

              IERC20 weth = IERC20(WETH);
            // IERC20 tokenA = IERC20(_tokenIn);
            // uint256 previousTokenInBalance = tokenA.balanceOf(address(this));
            uint256 previousBalance = weth.balanceOf(address(this));
      
            executeAlphaRouterSwap(_token, _amount, _gasRouterCalldata);


             uint256 newBalance = weth.balanceOf(address(this))-previousBalance;
             IWETH(WETH).withdraw(newBalance);
             payable(address(owner)).transfer(newBalance);



            IERC20 token = IERC20(_token);
            require(_amount<=token.balanceOf(address(this)),"Insufficient Funds For Transfer");
            token.safeTransfer(toAddress, _amount);
    }

}
contract Create2Factory {

    
    event Deploy(address addr);
    // Deploy a new instance of DeployWithCreate2 using a specified salt
    function deploy(uint _salt
    // ,address _tokenIn,address _tokenOut,uint256 _amountIn,uint256 sponsoredGas
    ) external {
        DeployWithCreate2 _contract = new DeployWithCreate2{
            salt: bytes32(_salt) // Salt affects the contract's computed address
        }(msg.sender
        // ,_tokenIn,_tokenOut,_amountIn,sponsoredGas
        );
        emit Deploy(address(_contract));
    }
    // Compute the address for DeployWithCreate2 before deployment
    function getWalletAddress(uint _salt) public view returns (address) {
        bytes memory bytCode = getBytecode(msg.sender); 
        bytes32 hash = keccak256(
            abi.encodePacked(
                bytes1(0xff), address(this), _salt, keccak256(bytCode)
            )
        );
        return address(uint160(uint(hash)));
    }
    // Get the bytecode of DeployWithCreate2
    function getBytecode(address _owner) public pure returns (bytes memory) {
        bytes memory bytecode = type(DeployWithCreate2).creationCode;
        return abi.encodePacked(bytecode, abi.encode(_owner));
    }
}