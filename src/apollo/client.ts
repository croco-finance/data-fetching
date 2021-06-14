// The following import is necessary only for node-js environment
import 'cross-fetch/polyfill';
import { ApolloClient, InMemoryCache } from '@apollo/client';

export const client = new ApolloClient({
    uri: 'https://api.thegraph.com/subgraphs/name/benesjan/uniswap-v3-subgraph',
    cache: new InMemoryCache(),
    queryDeduplication: false,
    defaultOptions: {
        watchQuery: {
            fetchPolicy: 'cache-and-network',
        },
    },
});

export const healthClient = new ApolloClient({
    uri: 'https://api.thegraph.com/index-node/graphql',
    cache: new InMemoryCache(),
});

export const blockClient = new ApolloClient({
    uri: 'https://api.thegraph.com/subgraphs/name/blocklytics/ethereum-blocks',
    cache: new InMemoryCache(),
    queryDeduplication: true,
    defaultOptions: {
        watchQuery: {
            fetchPolicy: 'network-only',
        },
        query: {
            fetchPolicy: 'network-only',
            errorPolicy: 'all',
        },
    },
});
