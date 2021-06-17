import { abi as NFTPositionManagerABI } from '@uniswap/v3-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json';
import { BigNumber, ethers } from 'ethers';
import { TokenFees } from './daily-owner-pool-fees';
import * as dotenv from 'dotenv';

dotenv.config();

const NFTPositionManagerAddress = '0xC36442b4a4522E871399CD717aBDD847Ab11FE88';
const MAX_UINT128 = BigNumber.from(2).pow(128).sub(1);

export async function getPositionFees(
    tokenId: string,
    owner: string,
    blockTag = -1,
): Promise<TokenFees> {
    const provider = new ethers.providers.JsonRpcProvider(process.env.JSON_RPC);
    const positionManager = new ethers.Contract(
        NFTPositionManagerAddress,
        NFTPositionManagerABI,
        provider,
    );

    return positionManager.callStatic
        .collect(
            {
                tokenId: tokenId,
                recipient: owner, // some tokens might fail if transferred to address(0)
                amount0Max: MAX_UINT128,
                amount1Max: MAX_UINT128,
            },
            // need to simulate the call as the owner and set block to the one to which subgraph was indexed to
            { from: owner, blockTag: blockTag },
        )
        .then(results => {
            return {
                feesToken0: results.amount0,
                feesToken1: results.amount1,
            };
        });
}

// (async function main() {
//     const latestIndexedBlock = await getLatestIndexedBlock();
//     const owner = '0x95Ae3008c4ed8c2804051DD00f7A27dAd5724Ed1';
//     const fees = await getPositionFees('34054', owner, latestIndexedBlock);
//     console.log(fees);
// })().catch(error => console.error(error));
