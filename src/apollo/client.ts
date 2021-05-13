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
