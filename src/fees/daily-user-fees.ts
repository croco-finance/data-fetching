import { gql } from '@apollo/client/core';
import { client } from '../apollo/client';

const TICK_IDS_QUERY = gql`
    query tickIds($owner: String, $pool: String) {
        positions(where: { owner: $owner, pool: $pool }) {
            tickLower {
                tickIdx
            }
            tickUpper {
                tickIdx
            }
        }
    }
`;

function buildQuery(owner: string, pool: string, since: number, relevantTickIds: string[]): string {
    let query = `{
            positionSnapshots(where: {owner: "${owner}", pool: "${pool}"}) {
                position {
                    tickLower {
                        id
                    }
                    tickUpper {
                        id
                    }
                }
                liquidity
                feeGrowthInside0LastX128
                feeGrowthInside1LastX128
            }
            poolDayDatas(where: {pool: "${pool}", date_gt: ${since}}) {
                date
                feeGrowthGlobal0X128
                feeGrowthGlobal1X128
            }`;
    for (const tickId of relevantTickIds) {
        let processedId = tickId.replace('#', '_');
        processedId = processedId.replace('-', '_');
        query += `
        t${processedId}: tickDayDatas(where: {tick: "${tickId}", date_gt: ${since}}) {
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

async function getPositions(owner: string, pool: string): Promise<void> {
    let result = await client.query({
        query: TICK_IDS_QUERY,
        variables: {
            owner: owner,
            pool: pool,
        },
    });

    const relevantTicks: string[] = [];
    for (const position of result.data.positions) {
        let tickLowerId = pool.concat('#').concat(position.tickLower.tickIdx);
        let tickUpperId = pool.concat('#').concat(position.tickUpper.tickIdx);

        relevantTicks.push(tickLowerId);
        relevantTicks.push(tickUpperId);
    }

    result = await client.query({
        query: gql(buildQuery(owner, pool, 0, relevantTicks)),
    });

    console.log(result);
}

(async function main() {
    await getPositions(
        '0x48c89d77ae34ae475e4523b25ab01e363dce5a78',
        '0xc2e9f25be6257c210d7adf0d4cd6e3e881ba25f8',
    );
})().catch(error => console.error(error));
