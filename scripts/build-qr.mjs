import {build} from 'esbuild';
await build({
  entryPoints:['node_modules/qrcode-generator/dist/qrcode.mjs'],
  outfile:'live/vendor/qrcode.js',bundle:true,format:'esm',minify:true,
  banner:{js:'/*! qrcode-generator 2.0.4 | Copyright (c) 2009 Kazuhiko Arase | MIT | See qrcode.LICENSE.txt */'}
});
