const { VueLoaderPlugin } = require('vue-loader');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
var path = require('path')
function config(obj)
{
  var base = {
    module: {
      rules: [
        {
          test: /\.css$/i,
          use: [
            "vue-style-loader",
            {
              loader:"css-loader",
              options: {
                esModule: false,
              },
            }
          ]
        },
        {
          test: /\.vue$/,
          loader: "vue-loader"
        },
        {
          test: /\.ts$/,
          loader: 'ts-loader'
        }      
      ],
    },
    resolve: {
      extensions: [
        '.ts','.js'
      ],
    },  
    plugins: [
      new VueLoaderPlugin(),
      new CleanWebpackPlugin()
    ],
    devtool : process.env.SOURCE_MAP?'source-map':false,
  };
  return Object.assign(obj,base);  
}

module.exports = (env,arg)=>[
  config({
    target: "node",
    entry: {
      'extension': './src/extension.ts',
    },
    output: {
      path: path.resolve(__dirname, './out/'),
      filename: '[name].js',
      libraryTarget: 'commonjs2',
    },
    externals:{
      'vscode':'commonjs vscode'
    }
  }),
  config({
    entry: {
      'index': './src/media/index.js',
    },
    output: {
      path: path.resolve(__dirname, './media/'),
      filename: '[name].js',
    },
  })
];
