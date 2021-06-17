import { gql } from '@apollo/client/core';
import { blockClient, client } from '../apollo/client';
import dayjs from 'dayjs';

const LATEST_INDEXED_BLOCK_QUERY = gql`
    query block {
        _meta {
            block {
                number
            }
        }
    }
`;

export async function getLatestIndexedBlock(): Promise<number> {
    const result = await client.query({
        query: LATEST_INDEXED_BLOCK_QUERY,
    });

    return Number(result.data._meta.block.number);
}

const BLOCK_QUERY = gql`
    query block($timestampMin: Int, $timestampMax: Int) {
        blocks(
            first: 1
            where: { timestamp_gt: $timestampMin, timestamp_lt: $timestampMax }
            orderBy: timestamp
            orderDirection: asc
        ) {
            number
        }
    }
`;

export async function getBlockNumDaysAgo(numDays: number): Promise<number> {
    const timestampMin = dayjs().subtract(numDays, 'day').unix();
    const timestampMax = timestampMin + 300;
    const result = await blockClient.query({
        query: BLOCK_QUERY,
        variables: {
            timestampMin,
            timestampMax,
        },
    });

    return Number(result.data.blocks[0].number);
}
