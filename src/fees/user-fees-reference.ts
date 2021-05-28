import { abi as NFTPositionManagerABI } from '@uniswap/v3-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json'
import { BigNumber, ethers } from 'ethers';

const NFTPositionManagerAddress = '0xC36442b4a4522E871399CD717aBDD847Ab11FE88'
const MAX_UINT128 = BigNumber.from(2).pow(128).sub(1)

async function printPositionFees(tokenId: BigNumber, owner: string): Promise<void> {
    const provider = new ethers.providers.JsonRpcProvider('http://localhost:8545/');
    const positionManager = new ethers.Contract(NFTPositionManagerAddress, NFTPositionManagerABI, provider)

    positionManager.callStatic
        .collect(
            {
                tokenId: tokenId.toHexString(),
                recipient: owner, // some tokens might fail if transferred to address(0)
                amount0Max: MAX_UINT128,
                amount1Max: MAX_UINT128,
            },
            { from: owner } // need to simulate the call as the owner
        )
        .then((results) => {
            console.log('amount0:', results.amount0.toString(), 'amount1:', results.amount1.toString())
        })
}

(async function main() {
    const tokenId = BigNumber.from(101)
    const owner = '0x48c89d77ae34ae475e4523b25ab01e363dce5a78'
    await printPositionFees(tokenId, owner);
})().catch((error) => console.error(error));