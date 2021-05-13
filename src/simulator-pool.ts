import { gql } from '@apollo/client/core';
import { client } from './apollo/client';

export interface Token {
    address: string;
    symbol: string;
    priceUsd: number;
}

export interface Pool {
    address: string
    tokens: Token[]
}

const POOL_QUERY = gql`
    query pool($id: String) {
        pool(id: $id) {
            token0 {
                id
                symbol
                derivedETH
            }
            token1 {
                id
                symbol
                derivedETH
            }
        }
        bundle(id:1) {
            ethPriceUSD
        }
    }
`;

async function getPool(address: string): Promise<Pool> {
    const result = await client.query({
        query: POOL_QUERY,
        variables: {
            id: address,
        },
    });
    const { pool, bundle } = result.data;

    const token0: Token = {
        address: pool.token0.id,
        symbol: pool.token0.symbol,
        priceUsd: pool.token0.derivedETH * bundle.ethPriceUSD,
    };

    const token1: Token = {
        address: pool.token1.id,
        symbol: pool.token1.symbol,
        priceUsd: pool.token1.derivedETH * bundle.ethPriceUSD,
    };

    return {
        address: address,
        tokens: [token0, token1],
    };
}

(async function main() {
    const pool = await getPool('0xcbcdf9626bc03e24f779434178a73a0b4bad62ed');
    console.log(pool);
})().catch((error) => console.error(error));