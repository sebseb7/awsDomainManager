import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  entry: './src/cli.jsx',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'cli.cjs',
  },
  target: 'node',
  mode: 'production',
  optimization: {
    minimize: false,
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env', '@babel/preset-react'],
          },
        },
      },
    ],
  },
  resolve: {
    extensions: ['.js', '.jsx'],
  },

  node: {
    __dirname: false,
    __filename: false,
  },

  ignoreWarnings: [
    {
      module: /node_modules\/ws\/lib\/buffer-util\.js/,
    },
    {
      module: /node_modules\/ws\/lib\/validation\.js/,
    },
  ],
};
