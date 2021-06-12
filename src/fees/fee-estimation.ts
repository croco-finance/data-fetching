import { gql } from '@apollo/client/core';
import { Position } from '@uniswap/v3-sdk';
import { client } from '../apollo/client';
import { getPool } from '../sdk-utils';

const FEE_ESTIMATE_QUERY = gql`
    query feeEstimationData($pool: String, $tickLower: Int, $tickUpper: Int) {
        bundle(id: "1") {
            ethPriceUSD
        }
        pool(id: $pool) {
            token0 {
                id
                decimals
                derivedETH
            }
            token1 {
                id
                decimals
                derivedETH
            }
            feeTier
            liquidity
            sqrtPrice
            tick
        }
        tickLower: ticks(first: 1, where: { poolAddress: $pool, tickIdx_gte: $tickLower }) {
            feeGrowthOutside0X128
            feeGrowthOutside1X128
        }
        tickUpper: ticks(first: 1, where: { poolAddress: $pool, tickIdx_lte: $tickUpper }) {
            feeGrowthOutside0X128
            feeGrowthOutside1X128
        }
    }
`;

async function estimate24hFees(
    pool: string,
    liquidityUsd: number,
    tickLower: number,
    tickUpper: number,
    numDaysBack: number,
): Promise<number> {
    let result = await client.query({
        query: FEE_ESTIMATE_QUERY,
        variables: {
            pool: pool,
            tickLower: tickLower,
            tickUpper: tickUpper,
        },
    });

    const poolInstance = getPool(result.data.pool);

    const ethPrice = Number(result.data.bundle.ethPriceUSD);

    const tick = Number(result.data.pool.tick);

    let token0Share: number;
    let token1Share: number;

    if (tick <= tickLower) {
        token0Share = 0;
        token1Share = 1;
    } else if (tickLower < tick && tick < tickUpper) {
        token1Share = (tick - tickLower) / (tickUpper - tickLower);
        token0Share = (tickUpper - tick) / (tickUpper - tickLower);
    } else {
        token0Share = 1;
        token1Share = 0;
    }

    const token0Price = ethPrice * Number(result.data.pool.token0.derivedETH);
    const token0Amount =
        (liquidityUsd / token0Price) * token0Share * 10 ** Number(result.data.pool.token0.decimals);

    const token1Price = ethPrice * Number(result.data.pool.token1.derivedETH);
    const token1Amount =
        (liquidityUsd / token1Price) * token1Share * 10 ** Number(result.data.pool.token1.decimals);

    // 1. convert liquidityUsd to liquidity
    const position = Position.fromAmounts({
        pool: poolInstance,
        tickLower: tickLower,
        tickUpper: tickUpper,
        amount0: token0Amount,
        amount1: token1Amount,
        useFullPrecision: true,
    });

    // 2. fetch ticksLower and tickUpper - if they are uninitialized fetch
    // the closest one within range
    // 3. get fee growth between given ticks
    return 0;
}

(async function main() {
    await estimate24hFees('0x151ccb92bc1ed5c6d0f9adb5cec4763ceb66ac7f', 15902, -31980, -28320, 7);
})().catch(error => console.error(error));
