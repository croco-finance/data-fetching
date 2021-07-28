import { gql } from '@apollo/client/core'
import { maxLiquidityForAmounts, TickMath } from '@uniswap/v3-sdk'
import { client } from '../apollo/client'
import { getPool, RawPoolData } from '../sdk-utils'
import { getFeeGrowthInside, getTotalPositionFees, parseTick } from './total-owner-pool-fees'
import { BigNumber } from 'ethers'
import { getBlockNumDaysAgo } from './utils'
import { formatUnits } from 'ethers/lib/utils'

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
      tickIdx
      feeGrowthOutside0X128
      feeGrowthOutside1X128
    }
    tickUpper: ticks(
      first: 1
      where: { poolAddress: $pool, tickIdx_lte: $tickUpper }
      orderBy: tickIdx
      orderDirection: desc
    ) {
      tickIdx
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
      tickIdx
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
      tickIdx
      feeGrowthOutside0X128
      feeGrowthOutside1X128
    }
  }
`

export function getLiquidity(
  rawPoolData: RawPoolData,
  tickLower: number,
  tickUpper: number,
  liquidityUsd: number,
  token0Price: number,
  token1Price: number
): BigNumber {
  const pool = getPool(rawPoolData)

  let token0Share: number
  let token1Share: number

  if (pool.tickCurrent <= tickLower) {
    token0Share = 1
    token1Share = 0
  } else if (tickLower < pool.tickCurrent && pool.tickCurrent < tickUpper) {
    token0Share = (tickUpper - pool.tickCurrent) / (tickUpper - tickLower)
    token1Share = (pool.tickCurrent - tickLower) / (tickUpper - tickLower)
  } else {
    token0Share = 0
    token1Share = 1
  }

  const token0Amount = (liquidityUsd / token0Price) * token0Share * 10 ** pool.token0.decimals
  const token1Amount = (liquidityUsd / token1Price) * token1Share * 10 ** pool.token1.decimals

  const liquidityJSBI = maxLiquidityForAmounts(
    pool.sqrtRatioX96,
    TickMath.getSqrtRatioAtTick(tickLower),
    TickMath.getSqrtRatioAtTick(tickUpper),
    token0Amount.toFixed(0),
    token1Amount.toFixed(0),
    true
  )
  return BigNumber.from(liquidityJSBI.toString())
}

export async function estimate24hUsdFees(
  pool: string,
  liquidityUsd: number,
  tickLower: number,
  tickUpper: number,
  numDaysAgo: number
): Promise<number> {
  // 1. fetch block from numDaysAgo
  const blockNumDaysAgo = await getBlockNumDaysAgo(numDaysAgo)

  // 2. fetch all the other data
  let result = await client.query({
    query: FEE_ESTIMATE_QUERY,
    variables: {
      pool,
      tickLower,
      tickUpper,
      block: blockNumDaysAgo,
    },
  })

  // 3. parse and verify data
  const poolDataCurrent = result.data.pool
  const tickLowerInstanceCurrent = parseTick(result.data.tickLower[0])
  const tickUpperInstanceCurrent = parseTick(result.data.tickUpper[0])

  if (tickLowerInstanceCurrent.idx >= tickUpperInstanceCurrent.idx) {
    console.error('Lower tick Idx >= Upper tick Idx')
    return 0
  }

  const poolDataOld = result.data.poolOld
  const tickLowerInstanceOld = parseTick(result.data.tickLowerOld[0])
  const tickUpperInstanceOld = parseTick(result.data.tickUpperOld[0])

  if (tickLowerInstanceOld.idx >= tickUpperInstanceOld.idx) {
    console.error('Old lower tick Idx >= Old upper tick Idx')
    return 0
  }

  // 4. get fee growth between given ticks at present moment
  let [feeGrowthInside0X128, feeGrowthInside1X128] = getFeeGrowthInside(
    tickLowerInstanceCurrent,
    tickUpperInstanceCurrent,
    Number(poolDataCurrent.tick),
    BigNumber.from(poolDataCurrent.feeGrowthGlobal0X128),
    BigNumber.from(poolDataCurrent.feeGrowthGlobal1X128)
  )

  // 5. get fee growth at the beginning of the estimation period
  let [feeGrowthInside0LastX128, feeGrowthInside1LastX128] = getFeeGrowthInside(
    tickLowerInstanceOld,
    tickUpperInstanceOld,
    Number(poolDataOld.tick),
    BigNumber.from(poolDataOld.feeGrowthGlobal0X128),
    BigNumber.from(poolDataOld.feeGrowthGlobal1X128)
  )

  // 6. convert liquidityUsd to liquidity
  const ethPrice = Number(result.data.bundle.ethPriceUSD)
  const token0Price = ethPrice * Number(poolDataCurrent.token0.derivedETH)
  const token1Price = ethPrice * Number(poolDataCurrent.token1.derivedETH)

  const liquidity = getLiquidity(result.data.pool, tickLower, tickUpper, liquidityUsd, token0Price, token1Price)

  // 7. compute fees
  let fees = getTotalPositionFees(
    feeGrowthInside0X128,
    feeGrowthInside1X128,
    feeGrowthInside0LastX128,
    feeGrowthInside1LastX128,
    liquidity
  )

  const feesToken0 = Number(formatUnits(fees.amount0, poolDataCurrent.token0.decimals))
  const feesToken1 = Number(formatUnits(fees.amount1, poolDataCurrent.token1.decimals))

  return (feesToken0 * token0Price + feesToken1 * token1Price) / numDaysAgo
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
