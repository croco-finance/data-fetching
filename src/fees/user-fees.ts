import { gql } from '@apollo/client/core';
import { client } from '../apollo/client';

interface Tick {
    id: number;
    feeGrowthOutside0X128: number;
    feeGrowthOutside1X128: number;
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
                id: tickIdx
                feeGrowthOutside0X128
                feeGrowthOutside1X128
            }
            tickUpper {
                id: tickIdx
                feeGrowthOutside0X128
                feeGrowthOutside1X128
            }
            liquidity
            feeGrowthInside0LastX128
            feeGrowthInside1LastX128
        }
    }
`;

// reimplementation of Tick.getFeeGrowthInside
function getFeeGrowthInside(
    tickLower: Tick,
    tickUpper: Tick,
    tickCurrentId: number,
    feeGrowthGlobal0X128: number,
    feeGrowthGlobal1X128: number,
): [number, number] {
    // calculate fee growth below
    let feeGrowthBelow0X128: number;
    let feeGrowthBelow1X128: number;
    if (tickCurrentId >= tickLower.id) {
        feeGrowthBelow0X128 = tickLower.feeGrowthOutside0X128;
        feeGrowthBelow1X128 = tickLower.feeGrowthOutside1X128;
    } else {
        feeGrowthBelow0X128 = feeGrowthGlobal0X128 - tickLower.feeGrowthOutside0X128;
        feeGrowthBelow1X128 = feeGrowthGlobal1X128 - tickLower.feeGrowthOutside1X128;
    }

    // calculate fee growth above
    let feeGrowthAbove0X128: number;
    let feeGrowthAbove1X128: number;
    if (tickCurrentId < tickUpper.id) {
        feeGrowthAbove0X128 = tickUpper.feeGrowthOutside0X128;
        feeGrowthAbove1X128 = tickUpper.feeGrowthOutside1X128;
    } else {
        feeGrowthAbove0X128 = feeGrowthGlobal0X128 - tickUpper.feeGrowthOutside0X128;
        feeGrowthAbove1X128 = feeGrowthGlobal1X128 - tickUpper.feeGrowthOutside1X128;
    }

    let feeGrowthInside0X128 = feeGrowthGlobal0X128 - feeGrowthBelow0X128 - feeGrowthAbove0X128;
    let feeGrowthInside1X128 = feeGrowthGlobal1X128 - feeGrowthBelow1X128 - feeGrowthAbove1X128;

    return [feeGrowthInside0X128, feeGrowthInside1X128];
}

async function getPositions(owner: string, pool: string): Promise<void> {
    const result = await client.query({
        query: POSITIONS_QUERY,
        variables: {
            owner: owner,
            pool: pool,
        },
    });

    const positions = result.data.positions;
    for (const position of positions) {
        let [feeGrowthInside0X128, feeGrowthInside1X128] = getFeeGrowthInside(
            position.tickLower,
            position.tickUpper,
            position.pool.tick,
            position.pool.feeGrowthGlobal0X128,
            position.pool.feeGrowthGlobal1X128,
        );
        // TODO
    }
}

(async function main() {
    await getPositions(
        '0x48c89d77ae34ae475e4523b25ab01e363dce5a78',
        '0xc2e9f25be6257c210d7adf0d4cd6e3e881ba25f8',
    );
})().catch(error => console.error(error));
