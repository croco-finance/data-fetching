import { client } from './apollo/client';
import { gql } from '@apollo/client/core';

const VOLUME_QUERY = gql`
    query volume($id: String, $numDays: Int) {
        pool(id: $id){
            feeTier
        }
        poolDayDatas(where: {pool: $id}, first: $numDays, orderBy: date, orderDirection: desc) {
            volumeUSD
        }
    }
`;

async function getPool(address: string, numDays: number): Promise<number[]> {
    const result = await client.query({
        query: VOLUME_QUERY,
        variables: {
            id: address,
            numDays: numDays,
        },
    });

    const { pool, poolDayDatas } = result.data;

    return poolDayDatas.map((dayData: any) => {
        return Math.round(dayData.volumeUSD * pool.feeTier / 10000);
    });
}

(async function main() {
    const fees = await getPool('0xcbcdf9626bc03e24f779434178a73a0b4bad62ed', 7);
    console.log(fees);
})().catch((error) => console.error(error));