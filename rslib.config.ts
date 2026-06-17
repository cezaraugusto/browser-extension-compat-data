import {defineConfig} from '@rslib/core'

export default defineConfig({
  lib: [
    {
      format: 'esm',
      syntax: ['node 18'],
      dts: true
    },
    {
      format: 'cjs',
      syntax: ['node 18']
    }
  ],
  output: {
    // Ship the compact index as a single asset next to the bundles instead of
    // inlining it into both ESM and CJS outputs.
    copy: [{from: './src/generated/index.json', to: 'index.json'}]
  }
})
