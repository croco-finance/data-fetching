import { PositionInOverview } from './interfaces/positions-overview';
import { gql } from '@apollo/client/core';
import { client } from './apollo/client';
import { computeFees, DailyFees } from './fees/daily-position-fees';
import dayjs from 'dayjs';
import { getPositions } from './positions-overview';
import {
    ExpandedPositionInfo,
    FeesChartEntry,
    Interaction,
    InteractionType,
    Snapshot,
    Transaction,
} from './interfaces/expanded-position';
import { Pool, Position } from '@uniswap/v3-sdk';
import { TokenFees } from './fees/total-owner-pool-fees';
import { formatUnits } from 'ethers/lib/utils';

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
            depositedToken0
            depositedToken1
            withdrawnToken0
            withdrawnToken1
            collectedFeesToken0
            collectedFeesToken1
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
        }
        s${block}: pool(id: "${pool}", block: {number: ${block}}) {
            liquidity
            sqrtPrice
            tick
            token0 {
                derivedETH
            }
            token1 {
                derivedETH
            }
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
        query += `
        t${processedId}_first_smaller: tickDayDatas(first: 1, where: {tick: "${tickId}", date_lte: ${minTimestamp}}, orderBy: date, orderDirection: desc) {
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

function dailyFeesToChartFormat(
    dailyFees: DailyFees,
    decimals0: number,
    decimals1: number,
): FeesChartEntry[] {
    const entryArray: FeesChartEntry[] = [];
    for (let timestamp in dailyFees) {
        let tokenFees: TokenFees = dailyFees[timestamp];
        entryArray.push({
            date: Number(timestamp),
            feesToken0: Number(formatUnits(tokenFees.amount0, decimals0)),
            feesToken1: Number(formatUnits(tokenFees.amount1, decimals1)),
        });
    }
    return entryArray;
}

function getInteractions(snaps: Snapshot[]): Interaction[] {
    const interactions: Interaction[] = [];
    interactions.push({
        type: InteractionType.DEPOSIT,
        amountToken0: snaps[0].depositedToken0,
        amountToken1: snaps[0].depositedToken1,
        valueUSD:
            snaps[0].depositedToken0 * snaps[0].priceToken0 +
            snaps[0].depositedToken1 * snaps[0].priceToken1,
        transaction: snaps[0].transaction,
    });
    for (let i = 1; i < snaps.length; i++) {
        const prevSnap = snaps[i - 1];
        const curSnap = snaps[i];
        let interaction;
        if (
            prevSnap.depositedToken0 !== curSnap.depositedToken0 ||
            prevSnap.depositedToken1 !== curSnap.depositedToken1
        ) {
            interaction = {
                type: InteractionType.DEPOSIT,
                amountToken0: curSnap.depositedToken0 - prevSnap.depositedToken0,
                amountToken1: curSnap.depositedToken1 - prevSnap.depositedToken1,
                valueUSD: 0,
                transaction: curSnap.transaction,
            };
        } else if (
            prevSnap.withdrawnToken0 !== curSnap.withdrawnToken0 ||
            prevSnap.withdrawnToken1 !== curSnap.withdrawnToken1
        ) {
            interaction = {
                type: InteractionType.WITHDRAW,
                amountToken0: curSnap.withdrawnToken0 - prevSnap.withdrawnToken0,
                amountToken1: curSnap.withdrawnToken1 - prevSnap.withdrawnToken1,
                valueUSD: 0,
                transaction: curSnap.transaction,
            };
        } else {
            interaction = {
                type: InteractionType.COLLECT,
                amountToken0: curSnap.collectedFeesToken0 - prevSnap.collectedFeesToken0,
                amountToken1: curSnap.collectedFeesToken1 - prevSnap.collectedFeesToken1,
                valueUSD: 0,
                transaction: curSnap.transaction,
            };
        }
        interaction.valueUSD =
            interaction.amountToken0 * curSnap.priceToken0 +
            interaction.amountToken1 * curSnap.priceToken1;
        interactions.push(interaction);
    }
    return interactions;
}

async function getExpandedPosition(
    positionInOverview: PositionInOverview,
): Promise<ExpandedPositionInfo> {
    // 1. get position and snaps
    let result = await client.query({
        query: POSITION_AND_SNAPS,
        variables: {
            positionId: positionInOverview.tokenId.toString(),
        },
    });

    const poolId = result.data.position.pool.id;
    const rawPosition = result.data.position;
    const rawSnaps = result.data.positionSnapshots;

    // 2. create tick ids from tick indexes and pool address
    const relevantTicks: string[] = [
        poolId.concat('#').concat(rawPosition.tickLower.tickIdx),
        poolId.concat('#').concat(rawPosition.tickUpper.tickIdx),
    ];

    // 3. get the time from which to fetch day data and snap blocks
    const snapBlocks: string[] = [];
    let oldestSnapTimestamp = Number.MAX_VALUE;
    for (const snap of rawSnaps) {
        snapBlocks.push(snap.blockNumber);
        const snapTimestamp = Number(snap.timestamp);
        if (snapTimestamp < oldestSnapTimestamp) {
            oldestSnapTimestamp = snapTimestamp;
        }
    }
    const minTimestamp = Math.max(dayjs().subtract(30, 'day').unix(), oldestSnapTimestamp);

    // 4. fetch positions, snapshots, pool, tick day data and eth prices in snap creation times
    result = await client.query({
        query: gql(buildQuery(poolId, minTimestamp, relevantTicks, snapBlocks)),
    });

    // 5. compute daily fees from all the data
    const dailyFees = computeFees(result.data, rawPosition, rawSnaps);

    // 6. process snapshots
    let snapshots: Snapshot[] = [];
    for (const snap of rawSnaps) {
        const additionalPoolInfo = result.data['s' + snap.blockNumber];
        // additionalPoolInfo.tick is null when the positionSnapshot is the pool's
        // first snapshot. To avoid "Error: Invariant failed: TICK" error
        // I set current pool info instead of the snap's
        let pool = positionInOverview.pool;
        if (additionalPoolInfo.tick !== null) {
            pool = new Pool(
                positionInOverview.pool.token0,
                positionInOverview.pool.token1,
                positionInOverview.pool.fee,
                additionalPoolInfo.sqrtPrice,
                additionalPoolInfo.liquidity,
                parseInt(additionalPoolInfo.tick),
            );
        }

        const snapPosition = new Position({
            pool,
            liquidity: snap.liquidity,
            tickLower: positionInOverview.tickLower,
            tickUpper: positionInOverview.tickUpper,
        });
        const transaction: Transaction = {
            id: snap.transaction.id,
            timestamp: Number(snap.timestamp),
            txCostETH: Number(snap.transaction.gasUsed) * Number(snap.transaction.gasPrice),
            ethPriceUSD: Number(result.data['b' + snap.blockNumber].ethPriceUSD),
        };
        snapshots.push({
            depositedToken0: Number(snap.depositedToken0),
            depositedToken1: Number(snap.depositedToken1),
            withdrawnToken0: Number(snap.withdrawnToken0),
            withdrawnToken1: Number(snap.withdrawnToken1),
            collectedFeesToken0: Number(snap.collectedFeesToken0),
            collectedFeesToken1: Number(snap.collectedFeesToken1),
            amountToken0: snapPosition.amount0,
            amountToken1: snapPosition.amount1,
            priceToken0: Number(additionalPoolInfo.token0.derivedETH) * transaction.ethPriceUSD,
            priceToken1: Number(additionalPoolInfo.token1.derivedETH) * transaction.ethPriceUSD,
            transaction,
        });
    }

    // 7. create ExpandedPositionInfo and return
    return {
        collectedFeesToken0: snapshots[snapshots.length - 1].collectedFeesToken0,
        collectedFeesToken1: snapshots[snapshots.length - 1].collectedFeesToken1,
        dailyFees: dailyFeesToChartFormat(
            dailyFees,
            positionInOverview.pool.token0.decimals,
            positionInOverview.pool.token1.decimals,
        ),
        snapshots,
        interactions: getInteractions(snapshots),
    };
}

(async function main() {
    const owners = ['0x95ae3008c4ed8c2804051dd00f7a27dad5724ed1'];
    const positions = await getPositions(owners);
    const expandedPosition = await getExpandedPosition(positions[0]);
})().catch(error => console.error(error));
