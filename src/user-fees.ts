import { gql } from '@apollo/client/core';
import { client } from './apollo/client';

const POSITIONS_QUERY = gql`
    query positions($owner: String, $pool: String) {
        positions(where: {owner: $owner, pool: $pool}){
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

async function getPositions(owner: string, pool: string): Promise<void> {
    const result = await client.query({
        query: POSITIONS_QUERY,
        variables: {
            owner: owner,
            pool: pool,
        },
    });

    const positions = result.data.positions;
    console.log(positions);
}

(async function main() {
    await getPositions('0x48c89d77ae34ae475e4523b25ab01e363dce5a78',
        '0xc2e9f25be6257c210d7adf0d4cd6e3e881ba25f8');
})().catch((error) => console.error(error));