import { PositionInOverview } from './interfaces/positions-overview';
import { gql } from '@apollo/client/core';
import { client } from './apollo/client';
import { computeFees } from './fees/daily-position-fees';
import dayjs from 'dayjs';
import { getPositions } from './positions-overview';

const POSITION_AND_SNAPS = gql`
    query positionAndSnaps($positionId: String) {
        position(id: $positionId) {
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
            where: { position: $positionId }
            orderBy: timestamp
            orderDirection: asc
        ) {
            blockNumber
            timestamp
            liquidity
            collectedFeesToken0
            collectedFeesToken1
            withdrawnToken0
            withdrawnToken1
            feeGrowthInside0LastX128
            feeGrowthInside1LastX128
            transaction {
                id
                gasUsed
                gasPrice
            }
        }
    }
`;

function buildQuery(
    pool: string,
    minTimestamp: number,
    relevantTickIds: string[],
    snapBlocks: string[],
): string {
    let query = `{
            poolDayDatas(where: {pool: "${pool}", date_gt: ${minTimestamp}}, orderBy: date, orderDirection: asc) {
                date
                tick
                feeGrowthGlobal0X128
                feeGrowthGlobal1X128
            }`;
    for (const block of snapBlocks) {
        query += `
        b${block}: bundle(id: "1", block: {number: ${block}}) {
            ethPriceUSD
        }`;
    }
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

async function getExpandedPosition(positionInOverview: PositionInOverview): Promise<void> {
    // 1. get position and snaps
    let result = await client.query({
        query: POSITION_AND_SNAPS,
        variables: {
            positionId: positionInOverview.tokenId.toString(),
        },
    });

    const poolId = result.data.position.pool.id;
    const position = result.data.position;
    const positionSnapshots = result.data.positionSnapshots;

    // 2. create tick ids from tickIdxes and pool address
    const relevantTicks: string[] = [
        poolId.concat('#').concat(position.tickLower.tickIdx),
        poolId.concat('#').concat(position.tickUpper.tickIdx),
    ];

    // 3. get the time from which to fetch day data
    const snapBlocks: string[] = [];
    let oldestSnapTimestamp = Number.MAX_VALUE;
    for (const snap of positionSnapshots) {
        snapBlocks.push(snap.blockNumber);
        const snapTimestamp = Number(snap.timestamp);
        if (snapTimestamp < oldestSnapTimestamp) {
            oldestSnapTimestamp = snapTimestamp;
        }
    }
    const minTimestamp = Math.max(dayjs().subtract(30, 'day').unix(), oldestSnapTimestamp);

    // 4. fetch positions snapshots and pool and tick day data
    result = await client.query({
        query: gql(buildQuery(poolId, minTimestamp, relevantTicks, snapBlocks)),
    });

    // 5. compute fees from all the data
    const dailyFees = computeFees(result.data, position, positionSnapshots);
    // TODO
}

(async function main() {
    const owners = ['0x95ae3008c4ed8c2804051dd00f7a27dad5724ed1'];
    const positions = await getPositions(owners);
    const expandedPosition = await getExpandedPosition(positions[0]);
})().catch(error => console.error(error));
