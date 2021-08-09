import { gql } from '@apollo/client/core'
import { client } from '../apollo/client'
import { BigNumber } from 'ethers'
import { getFeeGrowthInside, getVmContractAddressAccountAddress } from './contract-utils'

// See https://docs.uniswap.org/reference/core/libraries/FixedPoint128 for details
const Q128 = BigNumber.from('0x100000000000000000000000000000000')

export interface TokenFees {
  amount0: BigNumber
  amount1: BigNumber
}

export interface Tick {
  idx: number
  feeGrowthOutside0X128: BigNumber
  feeGrowthOutside1X128: BigNumber
}

const POSITIONS_QUERY = gql`
  query positions($owner: String, $pool: String) {
    positions(where: { owner: $owner, pool: $pool }) {
      pool {
        tick
        feeGrowthGlobal0X128
        feeGrowthGlobal1X128
      }
      tickLower {
        tickIdx
        feeGrowthOutside0X128
        feeGrowthOutside1X128
      }
      tickUpper {
        tickIdx
        feeGrowthOutside0X128
        feeGrowthOutside1X128
      }
      liquidity
      feeGrowthInside0LastX128
      feeGrowthInside1LastX128
    }
  }
`

export function parseTick(tick: any): Tick {
  return {
    idx: Number(tick.tickIdx),
    feeGrowthOutside0X128: BigNumber.from(tick.feeGrowthOutside0X128),
    feeGrowthOutside1X128: BigNumber.from(tick.feeGrowthOutside1X128),
  }
}

export function getTotalPositionFees(
  feeGrowthInside0X128: BigNumber,
  feeGrowthInside1X128: BigNumber,
  feeGrowthInside0LastX128: BigNumber,
  feeGrowthInside1LastX128: BigNumber,
  liquidity: BigNumber
): TokenFees {
  return {
    amount0: feeGrowthInside0X128.sub(feeGrowthInside0LastX128).mul(liquidity).div(Q128),
    amount1: feeGrowthInside1X128.sub(feeGrowthInside1LastX128).mul(liquidity).div(Q128),
  }
}

export async function getTotalOwnerPoolFees(owner: string, pool: string): Promise<TokenFees> {
  const result = await client.query({
    query: POSITIONS_QUERY,
    variables: {
      owner,
      pool,
    },
  })

  const [vm, contractAddress, accountAddress] = await getVmContractAddressAccountAddress()

  const totalFees: TokenFees = {
    amount0: BigNumber.from(0),
    amount1: BigNumber.from(0),
  }

  for (const position of result.data.positions) {
    let [feeGrowthInside0X128, feeGrowthInside1X128] = await getFeeGrowthInside(
      vm,
      contractAddress,
      accountAddress,
      parseTick(position.tickLower),
      parseTick(position.tickUpper),
      Number(position.pool.tick),
      BigNumber.from(position.pool.feeGrowthGlobal0X128),
      BigNumber.from(position.pool.feeGrowthGlobal1X128)
    )
    let fees = getTotalPositionFees(
      feeGrowthInside0X128,
      feeGrowthInside1X128,
      BigNumber.from(position.feeGrowthInside0LastX128),
      BigNumber.from(position.feeGrowthInside1LastX128),
      BigNumber.from(position.liquidity)
    )

    totalFees.amount0 = totalFees.amount0.add(fees.amount0)
    totalFees.amount1 = totalFees.amount1.add(fees.amount1)
  }
  return totalFees
}

// (async function main() {
//     const totalFees = await getTotalOwnerPoolFees(
//         '0x95ae3008c4ed8c2804051dd00f7a27dad5724ed1',
//         '0x151ccb92bc1ed5c6d0f9adb5cec4763ceb66ac7f',
//     );
//     console.log(totalFees.amount0.toString());
//     console.log(totalFees.amount1.toString());
// })().catch(error => console.error(error));
