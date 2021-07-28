import { client } from './apollo/client'
import { gql } from '@apollo/client/core'
import { Position } from '@uniswap/v3-sdk'
import { getPool } from './sdk-utils'

const LIQUIDITY_QUERY = gql`
  query liquidity($owner: String, $pool: String) {
    bundle(id: "1") {
      ethPriceUSD
    }
    positions(where: { owner: $owner, pool: $pool }) {
      tickLower {
        tickIdx
      }
      tickUpper {
        tickIdx
      }
      liquidity
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
  }
`

interface DensityChart {
  investmentUsd: number
  priceMin: number
  priceMax: number
}

async function getLiquidityOfUserPoolPositions(user: string, pool: string): Promise<DensityChart[]> {
  let result = await client.query({
    query: LIQUIDITY_QUERY,
    variables: {
      owner: user,
      pool: pool,
    },
  })

  const poolInstance = getPool(result.data.pool)
  const ethPrice = Number(result.data.bundle.ethPriceUSD)

  const liquidityOfPositions: DensityChart[] = []

  for (const rawPosition of result.data.positions) {
    const position = new Position({
      pool: poolInstance,
      liquidity: rawPosition.liquidity,
      tickLower: parseInt(rawPosition.tickLower.tickIdx),
      tickUpper: parseInt(rawPosition.tickUpper.tickIdx),
    })
    const token0LiquidityUsd =
      Number(position.amount0.toExact()) * ethPrice * Number(result.data.pool.token0.derivedETH)
    const token1LiquidityUsd =
      Number(position.amount1.toExact()) * ethPrice * Number(result.data.pool.token1.derivedETH)

    liquidityOfPositions.push({
      investmentUsd: token0LiquidityUsd + token1LiquidityUsd,
      priceMin: Number(position.token0PriceUpper.invert().toSignificant()),
      priceMax: Number(position.token0PriceLower.invert().toSignificant()),
    })
  }
  return liquidityOfPositions
}

;(async function main() {
  const liquidity = await getLiquidityOfUserPoolPositions(
    '0x95ae3008c4ed8c2804051dd00f7a27dad5724ed1',
    '0x151ccb92bc1ed5c6d0f9adb5cec4763ceb66ac7f'
  )
  console.log(liquidity)
})().catch((error) => console.error(error))
