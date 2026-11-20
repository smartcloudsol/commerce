const path = require('path');
const webpack = require('webpack');
const base = require('@wordpress/scripts/config/webpack.config');

module.exports = {
  ...base,
  plugins: [
    ...base.plugins,
    new webpack.DefinePlugin({
      WPSUITE_COMMERCE_PREMIUM: JSON.stringify(process.env.WPSUITE_PREMIUM === 'true'),
    }),
  ],
  entry: { index: path.resolve(__dirname, 'src/index.tsx') },
  resolve: {
    ...base.resolve,
    modules: [process.env.COMMERCE_NODE_MODULES || 'node_modules', 'node_modules'],
  },
  externals: {
    ...base.externals,
    '@mantine/core': 'WpSuiteMantine',
    'aws-amplify': 'WpSuiteAmplify',
    'aws-amplify/auth': 'WpSuiteAmplify',
    'aws-amplify/auth/cognito': 'WpSuiteAmplify',
    'aws-amplify/api': 'WpSuiteAmplify',
    'aws-amplify/utils': 'WpSuiteAmplify',
    '@smart-cloud/aws-amplify-ui': 'WpSuiteAmplify',
    '@smart-cloud/aws-amplify-ui-react': 'WpSuiteAmplify',
    '@smart-cloud/aws-amplify-ui-react-core': 'WpSuiteAmplify',
    'country-data-list': 'WpSuiteAmplify',
    crypto: 'WpSuiteCrypto',
    jose: 'WpSuiteJose',
  },
  optimization: {
    ...base.optimization,
    splitChunks: false,
    runtimeChunk: false,
  },
};
