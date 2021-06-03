import { gql } from '@apollo/client/core';
import { client } from '../apollo/client';
import dayjs from 'dayjs';
import { BigNumber } from 'ethers';
import { getFeeGrowthInside, getFees, Tick } from './total-user-fees';

const TICK_IDS_QUERY = gql`
    query tickIds($owner: String, $pool: String) {
        positions(where: { owner: $owner, pool: $pool }) {
            id
            pool {
                id
            }
            tickLower {
                tickIdx
            }
            tickUpper {
                tickIdx
            }
        }
    }
`;

export interface FeesItem {
    feesToken0: BigNumber;
    feesToken1: BigNumber;
}

interface PositionFees {
    // key is timestamp
    [key: number]: FeesItem;
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
            positionSnapshots(where: {owner: "${owner}", pool: "${pool}"}, orderBy: timestamp, orderDirection: asc) {
                position {
                    id
                }
                timestamp
                liquidity
                feeGrowthInside0LastX128
                feeGrowthInside1LastX128
            }
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
        id: BigNumber.from(tickDayData.tick.tickIdx),
        feeGrowthOutside0X128: BigNumber.from(tickDayData.feeGrowthOutside0X128),
        feeGrowthOutside1X128: BigNumber.from(tickDayData.feeGrowthOutside1X128),
    };
}

function computeFees(data: any, positions: any): Fees {
    const fees: Fees = {};
    // 1. Iterate over positions
    for (const position of positions) {
        const positionFees: PositionFees = {};
        // 2. get snaps belonging to a given position
        const relevantSnaps = data.positionSnapshots.filter(
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
        let feeGrowthInside0LastX128;
        let feeGrowthInside1LastX128;
        let mostRelevantSnap = relevantSnaps[0];
        for (const poolDayData of relevantPoolDayDatas) {
            const lowerTickDayData = lowerTickSnaps.find(
                (tickSnap: { date: any }) => tickSnap.date == poolDayData.date,
            );
            const upperTickDayData = upperTickSnaps.find(
                (tickSnap: { date: any }) => tickSnap.date == poolDayData.date,
            );

            // 5. find the closest snap preceding day data
            for (const snap of relevantSnaps) {
                if (
                    snap.timestamp <= poolDayData.date &&
                    snap.timestamp > mostRelevantSnap.timestamp
                ) {
                    mostRelevantSnap = snap;
                }
            }

            if (lowerTickDayData !== undefined && upperTickDayData !== undefined) {
                let [feeGrowthInside0X128, feeGrowthInside1X128] = getFeeGrowthInside(
                    parseTickDayData(lowerTickDayData),
                    parseTickDayData(upperTickDayData),
                    BigNumber.from(poolDayData.tick),
                    BigNumber.from(poolDayData.feeGrowthGlobal0X128),
                    BigNumber.from(poolDayData.feeGrowthGlobal1X128),
                );
                if (
                    feeGrowthInside0LastX128 !== undefined &&
                    feeGrowthInside1LastX128 !== undefined
                ) {
                    positionFees[poolDayData.date] = getFees(
                        feeGrowthInside0X128,
                        feeGrowthInside1X128,
                        feeGrowthInside0LastX128,
                        feeGrowthInside1LastX128,
                        BigNumber.from(mostRelevantSnap.liquidity),
                    );
                }
                feeGrowthInside0LastX128 = feeGrowthInside0X128;
                feeGrowthInside1LastX128 = feeGrowthInside1X128;
            }
        }
        fees[position.id] = positionFees;
    }
    return fees;
}

async function getDailyFees(owner: string, pool: string, numDays: number): Promise<void> {
    let result = await client.query({
        query: TICK_IDS_QUERY,
        variables: {
            owner: owner,
            pool: pool,
        },
    });
    const positions = result.data.positions;

    const relevantTicks: string[] = [];
    for (const position of positions) {
        let tickLowerId = pool.concat('#').concat(position.tickLower.tickIdx);
        let tickUpperId = pool.concat('#').concat(position.tickUpper.tickIdx);

        relevantTicks.push(tickLowerId);
        relevantTicks.push(tickUpperId);
    }

    const minTimestamp = dayjs().subtract(numDays, 'day').unix();
    result = await client.query({
        query: gql(buildQuery(owner, pool, minTimestamp, relevantTicks)),
    });

    const dailyFees = computeFees(result.data, positions);

    console.log(dailyFees);
}

(async function main() {
    await getDailyFees(
        '0x95ae3008c4ed8c2804051dd00f7a27dad5724ed1',
        '0x151ccb92bc1ed5c6d0f9adb5cec4763ceb66ac7f',
        30,
    );
})().catch(error => console.error(error));
