import { gql } from '@apollo/client/core';
import { client } from '../apollo/client';
import dayjs from 'dayjs';
import { BigNumber } from 'ethers';
import { getFeeGrowthInside, getTotalPositionFees, Tick } from './total-owner-pool-fees';

const TICK_IDS_QUERY = gql`
    query tickIds($owner: String, $pool: String) {
        positions(where: { owner: $owner, pool: $pool }) {
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
        positionSnapshots(
            where: { owner: $owner, pool: $pool }
            orderBy: timestamp
            orderDirection: asc
        ) {
            position {
                id
            }
            timestamp
            liquidity
            feeGrowthInside0LastX128
            feeGrowthInside1LastX128
        }
    }
`;

export interface TokenFees {
    feesToken0: BigNumber;
    feesToken1: BigNumber;
}

interface PositionFees {
    // key is timestamp
    [key: number]: TokenFees;
}

interface Fees {
    // key is position id
    [key: string]: PositionFees;
}

function buildQuery(
    owner: string,
    pool: string,
    minTimestamp: number,
    relevantTickIds: string[],
): string {
    let query = `{
            poolDayDatas(where: {pool: "${pool}", date_gt: ${minTimestamp}}, orderBy: date, orderDirection: asc) {
                date
                tick
                feeGrowthGlobal0X128
                feeGrowthGlobal1X128
            }`;
    for (const tickId of relevantTickIds) {
        const processedId = tickId.replace('#', '_').replace('-', '_');
        query += `
        t${processedId}: tickDayDatas(where: {tick: "${tickId}", date_gt: ${minTimestamp}}, orderBy: date, orderDirection: asc) {
            date
            tick {
                tickIdx
            }
            feeGrowthOutside0X128
            feeGrowthOutside1X128
        }`;
    }
    query += '}';
    return query;
}

function parseTickDayData(tickDayData: any): Tick {
    return {
        idx: BigNumber.from(tickDayData.tick.tickIdx),
        feeGrowthOutside0X128: BigNumber.from(tickDayData.feeGrowthOutside0X128),
        feeGrowthOutside1X128: BigNumber.from(tickDayData.feeGrowthOutside1X128),
    };
}

function parseTick(tick: any): Tick {
    return {
        idx: BigNumber.from(tick.tickIdx),
        feeGrowthOutside0X128: BigNumber.from(tick.feeGrowthOutside0X128),
        feeGrowthOutside1X128: BigNumber.from(tick.feeGrowthOutside1X128),
    };
}

function computeFees(data: any, positions: any, positionSnaps: any): Fees {
    const fees: Fees = {};
    // 1. Iterate over positions
    for (const position of positions) {
        const positionFees: PositionFees = {};
        // 2. get snaps belonging to a given position
        // (filter preserves order hence I can rely on snaps being sorted)
        const relevantSnaps = positionSnaps.filter(
            (snap: { position: { id: any } }) => snap.position.id == position.id,
        );
        // 3. pool day data older than the first snap
        const relevantPoolDayDatas = data.poolDayDatas.filter(
            (dayData: { date: number }) => dayData.date >= relevantSnaps[0].timestamp,
        );

        const lowerTickSnaps =
            data['t' + position.pool.id + '_' + position.tickLower.tickIdx.replace('-', '_')];
        const upperTickSnaps =
            data['t' + position.pool.id + '_' + position.tickUpper.tickIdx.replace('-', '_')];

        // 4. Iterate over pool day data
        let feeGrowthInside0LastX128 = BigNumber.from(relevantSnaps[0].feeGrowthInside0LastX128);
        let feeGrowthInside1LastX128 = BigNumber.from(relevantSnaps[0].feeGrowthInside1LastX128);
        let currentSnapIndex = 0;
        for (const poolDayData of relevantPoolDayDatas) {
            const lowerTickDayDataRaw = lowerTickSnaps.find(
                (tickSnap: { date: any }) => tickSnap.date == poolDayData.date,
            );
            const upperTickDayDataRaw = upperTickSnaps.find(
                (tickSnap: { date: any }) => tickSnap.date == poolDayData.date,
            );

            let lowerTickDayData: Tick;
            let upperTickDayData: Tick;

            if (lowerTickDayDataRaw === undefined) {
                lowerTickDayData = parseTick(position.tickLower);
            } else {
                lowerTickDayData = parseTickDayData(lowerTickDayDataRaw);
            }

            if (upperTickDayDataRaw === undefined) {
                upperTickDayData = parseTick(position.tickUpper);
            } else {
                upperTickDayData = parseTickDayData(upperTickDayDataRaw);
            }

            // 5. increment snap index if necessary
            if (
                currentSnapIndex < relevantSnaps.length - 1 &&
                relevantSnaps[currentSnapIndex + 1].timestamp <= poolDayData.date
            ) {
                currentSnapIndex += 1;
            }

            let [feeGrowthInside0X128, feeGrowthInside1X128] = getFeeGrowthInside(
                lowerTickDayData,
                upperTickDayData,
                BigNumber.from(poolDayData.tick),
                BigNumber.from(poolDayData.feeGrowthGlobal0X128),
                BigNumber.from(poolDayData.feeGrowthGlobal1X128),
            );
            positionFees[poolDayData.date] = getTotalPositionFees(
                feeGrowthInside0X128,
                feeGrowthInside1X128,
                feeGrowthInside0LastX128,
                feeGrowthInside1LastX128,
                BigNumber.from(relevantSnaps[currentSnapIndex].liquidity),
            );
            feeGrowthInside0LastX128 = feeGrowthInside0X128;
            feeGrowthInside1LastX128 = feeGrowthInside1X128;
        }
        fees[position.id] = positionFees;
    }
    return fees;
}

export async function getDailyOwnerPoolFees(
    owner: string,
    pool: string,
    numDays: number,
): Promise<Fees> {
    // 1. get relevant ticks from position
    let result = await client.query({
        query: TICK_IDS_QUERY,
        variables: {
            owner,
            pool,
        },
    });

    const positions = result.data.positions;
    const positionSnapshots = result.data.positionSnapshots;

    // 2. create tick ids from tickIdxes and pool address
    const relevantTicks: string[] = [];
    for (const position of positions) {
        let tickLowerId = pool.concat('#').concat(position.tickLower.tickIdx);
        let tickUpperId = pool.concat('#').concat(position.tickUpper.tickIdx);

        relevantTicks.push(tickLowerId);
        relevantTicks.push(tickUpperId);
    }

    // 3. get the time from which to fetch day data
    let oldestSnapTimestamp = Number.MAX_VALUE;
    for (const snap of positionSnapshots) {
        const snapTimestamp = Number(snap.timestamp);
        if (snapTimestamp < oldestSnapTimestamp) {
            oldestSnapTimestamp = snapTimestamp;
        }
    }
    const minTimestamp = Math.max(dayjs().subtract(numDays, 'day').unix(), oldestSnapTimestamp);

    // 4. fetch positions snapshots and pool and tick day data
    result = await client.query({
        query: gql(buildQuery(owner, pool, minTimestamp, relevantTicks)),
    });

    // 5. compute fees from all the data
    return computeFees(result.data, positions, positionSnapshots);
}

// (async function main() {
//     const dailyFees = await getDailyOwnerPoolFees(
//         '0x95ae3008c4ed8c2804051dd00f7a27dad5724ed1',
//         '0x151ccb92bc1ed5c6d0f9adb5cec4763ceb66ac7f',
//         30,
//     );
//     console.log(dailyFees);
// })().catch(error => console.error(error));
