import { gql } from '@apollo/client/core';
import { Position } from '@uniswap/v3-sdk';
import { client } from '../apollo/client';
import { getPool } from '../sdk-utils';
import { getFeeGrowthInside, getTotalPositionFees, parseTick } from './total-user-fees';
import { BigNumber } from 'ethers';
import { getBlockNumDaysAgo } from './utils';
import { formatUnits } from 'ethers/lib/utils';

export const FEE_ESTIMATE_QUERY = gql`
    query feeEstimationData($pool: String, $tickLower: Int, $tickUpper: Int, $block: Int) {
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
            feeGrowthGlobal0X128
            feeGrowthGlobal1X128
        }
        tickLower: ticks(
            first: 1
            where: { poolAddress: $pool, tickIdx_gte: $tickLower }
            orderBy: tickIdx
            orderDirection: asc
        ) {
            idx: tickIdx
            feeGrowthOutside0X128
            feeGrowthOutside1X128
        }
        tickUpper: ticks(
            first: 1
            where: { poolAddress: $pool, tickIdx_lte: $tickUpper }
            orderBy: tickIdx
            orderDirection: desc
        ) {
            idx: tickIdx
            feeGrowthOutside0X128
            feeGrowthOutside1X128
        }
        poolOld: pool(id: $pool, block: { number: $block }) {
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
            feeGrowthGlobal0X128
            feeGrowthGlobal1X128
        }
        tickLowerOld: ticks(
            first: 1
            where: { poolAddress: $pool, tickIdx_gte: $tickLower }
            orderBy: tickIdx
            orderDirection: asc
            block: { number: $block }
        ) {
            idx: tickIdx
            feeGrowthOutside0X128
            feeGrowthOutside1X128
        }
        tickUpperOld: ticks(
            first: 1
            where: { poolAddress: $pool, tickIdx_lte: $tickUpper }
            orderBy: tickIdx
            orderDirection: desc
            block: { number: $block }
        ) {
            idx: tickIdx
            feeGrowthOutside0X128
            feeGrowthOutside1X128
        }
    }
`;

export function getPosition(
    result: any,
    tickLower: number,
    tickUpper: number,
    liquidityUsd: number,
    token0Price: number,
    token1Price: number,
): Position {
    const tick = Number(result.data.pool.tick);

    const poolInstance = getPool(result.data.pool);

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

    const token0Amount =
        (liquidityUsd / token0Price) * token0Share * 10 ** Number(result.data.pool.token0.decimals);

    const token1Amount =
        (liquidityUsd / token1Price) * token1Share * 10 ** Number(result.data.pool.token1.decimals);

    return Position.fromAmounts({
        pool: poolInstance,
        tickLower: tickLower,
        tickUpper: tickUpper,
        amount0: token0Amount,
        amount1: token1Amount,
        useFullPrecision: true,
    });
}

export async function estimate24hUsdFees(
    pool: string,
    liquidityUsd: number,
    tickLower: number,
    tickUpper: number,
    numDaysAgo: number,
): Promise<number> {
    // 1. Fetch block from numDaysAgo
    const blockNumDaysAgo = await getBlockNumDaysAgo(numDaysAgo);

    // 2. fetch all the other data
    let result = await client.query({
        query: FEE_ESTIMATE_QUERY,
        variables: {
            pool: pool,
            tickLower: tickLower,
            tickUpper: tickUpper,
            block: blockNumDaysAgo,
        },
    });

    // 3. Parse and verify data
    const poolDataCurrent = result.data.pool;
    const tickLowerInstanceCurrent = parseTick(result.data.tickLower[0]);
    const tickUpperInstanceCurrent = parseTick(result.data.tickUpper[0]);

    if (tickLowerInstanceCurrent.idx.gte(tickUpperInstanceCurrent.idx)) {
        console.error('Lower tick Idx >= Upper tick Idx');
        return 0;
    }

    const poolDataOld = result.data.poolOld;
    const tickLowerInstanceOld = parseTick(result.data.tickLowerOld[0]);
    const tickUpperInstanceOld = parseTick(result.data.tickUpperOld[0]);

    if (tickLowerInstanceOld.idx.gte(tickUpperInstanceOld.idx)) {
        console.error('Old lower tick Idx >= Old upper tick Idx');
        return 0;
    }

    // 3. get fee growth between given ticks
    let [feeGrowthInside0X128, feeGrowthInside1X128] = getFeeGrowthInside(
        tickLowerInstanceCurrent,
        tickUpperInstanceCurrent,
        BigNumber.from(poolDataCurrent.tick),
        BigNumber.from(poolDataCurrent.feeGrowthGlobal0X128),
        BigNumber.from(poolDataCurrent.feeGrowthGlobal1X128),
    );

    let [feeGrowthInside0LastX128, feeGrowthInside1LastX128] = getFeeGrowthInside(
        tickLowerInstanceOld,
        tickUpperInstanceOld,
        BigNumber.from(poolDataOld.tick),
        BigNumber.from(poolDataOld.feeGrowthGlobal0X128),
        BigNumber.from(poolDataOld.feeGrowthGlobal1X128),
    );

    // 4. convert liquidityUsd to liquidity
    const ethPrice = Number(result.data.bundle.ethPriceUSD);
    const token0Price = ethPrice * Number(result.data.pool.token0.derivedETH);
    const token1Price = ethPrice * Number(result.data.pool.token1.derivedETH);

    const liquidityJSBI = getPosition(
        result,
        tickLower,
        tickUpper,
        liquidityUsd,
        token0Price,
        token1Price,
    ).liquidity;

    // 5. compute fees
    let fees = getTotalPositionFees(
        feeGrowthInside0X128,
        feeGrowthInside1X128,
        feeGrowthInside0LastX128,
        feeGrowthInside1LastX128,
        BigNumber.from(liquidityJSBI.toString()),
    );

    const feesToken0 = Number(formatUnits(fees.feesToken0, result.data.pool.token0.decimals));
    const feesToken1 = Number(formatUnits(fees.feesToken1, result.data.pool.token1.decimals));

    return (feesToken0 * token0Price + feesToken1 * token1Price) / numDaysAgo;
}

// (async function main() {
//     const feesUsd = await estimate24hUsdFees(
//         '0x151ccb92bc1ed5c6d0f9adb5cec4763ceb66ac7f',
//         15902,
//         -31980,
//         -28320,
//         7,
//     );
//     console.log(feesUsd);
// })().catch(error => console.error(error));
