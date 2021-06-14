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

export async function getLatestBlock(): Promise<number> {
    const result = await client.query({
        query: LATEST_INDEXED_BLOCK_QUERY,
    });

    return Number(result.data._meta.block.number);
}

const BLOCK_QUERY = gql`
    query block($timestamp: Int) {
        blocks(
            first: 1
            where: { timestamp_gte: $timestamp }
            orderBy: number
            orderDirection: asc
        ) {
            number
        }
    }
`;

export async function getBlockNumDaysAgo(numDays: number): Promise<number> {
    const result = await blockClient.query({
        query: BLOCK_QUERY,
        variables: {
            timestamp: dayjs().subtract(numDays, 'day').unix(),
        },
    });

    return Number(result.data.blocks[0].number);
}
