import { client } from './apollo/client';
import { gql } from '@apollo/client/core';
import { PositionInOverview } from './interfaces/positions-overview';

const POSITIONS_QUERY = gql`
    query positions($owners: [String]) {
        bundle(id: "1") {
            ethPriceUSD
        }
        positions(where: { owner_in: $owners }) {
            id
            owner
            pool {
                id
                token0 {
                    id
                    symbol
                    decimals
                    derivedETH
                }
                token1 {
                    id
                    symbol
                    decimals
                    derivedETH
                }
                liquidity
                sqrtPrice
                tick
                feeTier
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
export async function getPositions(owners: string[]): Promise<PositionInOverview[]> {
    const positions: PositionInOverview[] = [];

    const result = await client.query({
        query: POSITIONS_QUERY,
        variables: {
            owners: owners,
        },
    });

    const ethPrice = Number(result.data.bundle.ethPriceUSD);

    for (const positionData of result.data.positions) {
        positions.push(new PositionInOverview(positionData, ethPrice));
    }

    return positions;
}

// (async function main() {
//     const owners = ['0x95ae3008c4ed8c2804051dd00f7a27dad5724ed1'];
//     const positions = await getPositions(owners);
//     console.log(positions);
// })().catch(error => console.error(error));
