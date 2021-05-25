import { gql } from '@apollo/client/core';
import { client } from './apollo/client';

const POSITIONS_QUERY = gql`
    query positions($userId: String, $poolId: String) {
        positions(where: {operator: $userId, pool: $poolId}){
            pool {
                tick
                feeGrowthGlobal0X128
                feeGrowthGlobal1X128
            }
            tickLower {
                feeGrowthOutside0X128
                feeGrowthOutside1X128
            }
            tickUpper {
                feeGrowthOutside0X128
                feeGrowthOutside1X128
            }
            liquidity
            feeGrowthInside0LastX128
            feeGrowthInside1LastX128
        }
    }
`;

async function getPositions(userAddress: string, poolAddress: string): Promise<void> {
    const result = await client.query({
        query: POSITIONS_QUERY,
        variables: {
            userId: userAddress,
            poolId: poolAddress,
        },
    });

    const positions = result.data.positions;
    console.log(positions);
}

(async function main() {
    await getPositions('0x0000000000000000000000000000000000000000',
        '0xc2e9f25be6257c210d7adf0d4cd6e3e881ba25f8');
})().catch((error) => console.error(error));