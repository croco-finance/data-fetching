import { gql } from '@apollo/client/core'
import { client } from '../apollo/client'
import dayjs from 'dayjs'
import { BigNumber } from 'ethers'
import { Tick, TokenFees } from './total-owner-pool-fees'
import { getFeeGrowthInside, getPositionFees, deployContractAndGetVm } from './contract-utils'

const POSITION_AND_SNAPS = gql`
  query tickIds($positionId: String) {
    position(id: $positionId) {
      id
      pool {
        id
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
    }
    positionSnapshots(where: { position: $positionId }, orderBy: timestamp, orderDirection: asc) {
      position {
        id
      }
      timestamp
      liquidity
      feeGrowthInside0LastX128
      feeGrowthInside1LastX128
    }
  }
`

export interface DailyFees {
  // key is timestamp
  [key: number]: TokenFees
}

function buildQuery(pool: string, minTimestamp: number, relevantTickIds: string[]): string {
  let query = `{
            poolDayDatas(where: {pool: "${pool}", date_gt: ${minTimestamp}}, orderBy: date, orderDirection: asc) {
                date
                tick
                feeGrowthGlobal0X128
                feeGrowthGlobal1X128
            }`
  for (const tickId of relevantTickIds) {
    const processedId = tickId.replace('#', '_').replace('-', '_')
    query += `
        t${processedId}: tickDayDatas(where: {tick: "${tickId}", date_gt: ${minTimestamp}}, orderBy: date, orderDirection: desc) {
            date
            tick {
                tickIdx
            }
            feeGrowthOutside0X128
            feeGrowthOutside1X128
        }`
    query += `
        t${processedId}_first_smaller: tickDayDatas(first: 1, where: {tick: "${tickId}", date_lte: ${minTimestamp}}, orderBy: date, orderDirection: desc) {
            date
            tick {
                tickIdx
            }
            feeGrowthOutside0X128
            feeGrowthOutside1X128
        }`
  }
  query += '}'
  return query
}

function parseTickDayData(tickDayData: any): Tick {
  return {
    idx: Number(tickDayData.tick.tickIdx),
    feeGrowthOutside0X128: BigNumber.from(tickDayData.feeGrowthOutside0X128),
    feeGrowthOutside1X128: BigNumber.from(tickDayData.feeGrowthOutside1X128),
  }
}

export async function computeFees(data: any, position: any, positionSnaps: any): Promise<DailyFees> {
  const vm = await deployContractAndGetVm()
  const positionFees: DailyFees = {}

  // 1. Get tickDayDatas and merge first smaller with the rest
  let processedId = 't' + position.pool.id + '_' + position.tickLower.tickIdx.replace('-', '_')
  const lowerTickDayDatas = data[processedId].concat(data[processedId + '_first_smaller'])

  processedId = 't' + position.pool.id + '_' + position.tickUpper.tickIdx.replace('-', '_')
  const upperTickDayDatas = data[processedId].concat(data[processedId + '_first_smaller'])

  // 2. Iterate over pool day data
  let feeGrowthInside0SnapX128 = BigNumber.from(positionSnaps[0].feeGrowthInside0LastX128)
  let feeGrowthInside1SnapX128 = BigNumber.from(positionSnaps[0].feeGrowthInside1LastX128)
  let prevTotalFeesSinceSnap = {
    amount0: BigNumber.from('0'),
    amount1: BigNumber.from('0'),
  }
  let currentSnapIndex = 0

  // workaround variable
  let remaining0 = BigNumber.from('0')
  let remaining1 = BigNumber.from('0')

  for (const poolDayData of data.poolDayDatas) {
    // 3. Get the first tickDayData whose date is smaller or equal to current poolDayData
    const lowerTickDayDataRaw = lowerTickDayDatas.find(
      (tickDayData: { date: any }) => tickDayData.date <= poolDayData.date
    )

    const upperTickDayDataRaw = upperTickDayDatas.find(
      (tickDayData: { date: any }) => tickDayData.date <= poolDayData.date
    )

    const lowerTickDayData = parseTickDayData(lowerTickDayDataRaw)
    const upperTickDayData = parseTickDayData(upperTickDayDataRaw)

    // 4. increment snap index if necessary
    if (
      currentSnapIndex < positionSnaps.length - 1 &&
      positionSnaps[currentSnapIndex + 1].timestamp <= poolDayData.date
    ) {
      currentSnapIndex += 1
      feeGrowthInside0SnapX128 = BigNumber.from(positionSnaps[currentSnapIndex].feeGrowthInside0LastX128)
      feeGrowthInside1SnapX128 = BigNumber.from(positionSnaps[currentSnapIndex].feeGrowthInside1LastX128)
      prevTotalFeesSinceSnap = {
        amount0: BigNumber.from('0'),
        amount1: BigNumber.from('0'),
      }
    }

    const [feeGrowthInside0X128, feeGrowthInside1X128] = await getFeeGrowthInside(
      vm,
      lowerTickDayData,
      upperTickDayData,
      Number(poolDayData.tick),
      BigNumber.from(poolDayData.feeGrowthGlobal0X128),
      BigNumber.from(poolDayData.feeGrowthGlobal1X128)
    )

    const liquidity = BigNumber.from(positionSnaps[currentSnapIndex].liquidity)
    const fees0Promise = getPositionFees(vm, feeGrowthInside0X128, feeGrowthInside0SnapX128, liquidity)
    const fees1Promise = getPositionFees(vm, feeGrowthInside1X128, feeGrowthInside1SnapX128, liquidity)

    const currentTotalFeesSinceSnap = {
      amount0: await fees0Promise,
      amount1: await fees1Promise,
    }

    positionFees[poolDayData.date] = {
      amount0: currentTotalFeesSinceSnap.amount0.sub(prevTotalFeesSinceSnap.amount0),
      amount1: currentTotalFeesSinceSnap.amount1.sub(prevTotalFeesSinceSnap.amount1),
    }

    // Workaround
    if (positionFees[poolDayData.date].amount0.isNegative()) {
      positionFees[poolDayData.date].amount0 = positionFees[poolDayData.date].amount0.add(remaining0)
      remaining0 = BigNumber.from('0')
    } else if (feeGrowthInside0X128.lt(feeGrowthInside0SnapX128) && remaining0.eq('0')) {
      remaining0 = positionFees[poolDayData.date].amount0
      positionFees[poolDayData.date].amount0 = BigNumber.from('0')
    }

    if (positionFees[poolDayData.date].amount1.isNegative()) {
      positionFees[poolDayData.date].amount1 = positionFees[poolDayData.date].amount1.add(remaining1)
      remaining1 = BigNumber.from('0')
    } else if (feeGrowthInside0X128.lt(feeGrowthInside0SnapX128) && remaining1.eq('0')) {
      remaining1 = positionFees[poolDayData.date].amount1
      positionFees[poolDayData.date].amount1 = BigNumber.from('0')
    }

    prevTotalFeesSinceSnap = currentTotalFeesSinceSnap
  }
  return positionFees
}

export async function getDailyPositionFees(positionId: string, numDays: number): Promise<DailyFees> {
  // 1. get position and snaps
  let result = await client.query({
    query: POSITION_AND_SNAPS,
    variables: {
      positionId,
    },
  })

  const poolId = result.data.position.pool.id
  const position = result.data.position
  const positionSnapshots = result.data.positionSnapshots

  // 2. create tick ids from tickIdxes and pool address
  const relevantTicks: string[] = [
    poolId.concat('#').concat(position.tickLower.tickIdx),
    poolId.concat('#').concat(position.tickUpper.tickIdx),
  ]

  // 3. get the time from which to fetch day data
  let oldestSnapTimestamp = Number.MAX_VALUE
  for (const snap of positionSnapshots) {
    const snapTimestamp = Number(snap.timestamp)
    if (snapTimestamp < oldestSnapTimestamp) {
      oldestSnapTimestamp = snapTimestamp
    }
  }
  const minTimestamp = Math.max(dayjs().subtract(numDays, 'day').unix(), oldestSnapTimestamp)

  // 4. fetch positions snapshots and pool and tick day data
  result = await client.query({
    query: gql(buildQuery(poolId, minTimestamp, relevantTicks)),
  })

  // 5. compute fees from all the data
  return computeFees(result.data, position, positionSnapshots)
}

// (async function main() {
//     const dailyFees = await getDailyPositionFees('34054', 30);
//     console.log(dailyFees);
// })().catch(error => console.error(error));
