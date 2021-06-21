import { client } from './apollo/client';
import { gql } from '@apollo/client/core';
import { BigNumber } from 'ethers';
import { getFeeGrowthInside, getTotalPositionFees, parseTick } from './fees/total-owner-pool-fees';
import { Positions } from './interfaces/positions-overview';

const POSITIONS_QUERY = gql`
    query positions($owners: [String]) {
        positions(where: { owner_in: $owners }) {
            pool {
                tick
                feeGrowthGlobal0X128
                feeGrowthGlobal1X128
            }
            tickLower {
                idx: tickIdx
                feeGrowthOutside0X128
                feeGrowthOutside1X128
            }
            tickUpper {
                idx: tickIdx
                feeGrowthOutside0X128
                feeGrowthOutside1X128
            }
            liquidity
            collectedFeesToken0
            collectedFeesToken1
            feeGrowthInside0LastX128
            feeGrowthInside1LastX128
        }
    }
`;

/**
 * Returns data about all positions for given owner addresses
 * @param owners an array of owner addresses
 */
export async function getPositions(owners: string[]): Promise<Positions> {
    const positions: Positions = {};

    const result = await client.query({
        query: POSITIONS_QUERY,
        variables: {
            owners: owners,
        },
    });

    for (const position of result.data.positions) {
        let [feeGrowthInside0X128, feeGrowthInside1X128] = getFeeGrowthInside(
            parseTick(position.tickLower),
            parseTick(position.tickUpper),
            BigNumber.from(position.pool.tick),
            BigNumber.from(position.pool.feeGrowthGlobal0X128),
            BigNumber.from(position.pool.feeGrowthGlobal1X128),
        );
        let fees = getTotalPositionFees(
            feeGrowthInside0X128,
            feeGrowthInside1X128,
            BigNumber.from(position.feeGrowthInside0LastX128),
            BigNumber.from(position.feeGrowthInside1LastX128),
            BigNumber.from(position.liquidity),
        );

        console.log(fees);
    }

    // TODO

    return positions;
}

(async function main() {
    const owners = ['0x95ae3008c4ed8c2804051dd00f7a27dad5724ed1'];
    const positions = await getPositions(owners);
    console.log(positions);
})().catch(error => console.error(error));
