import { Miniflare } from 'miniflare';
const mf=new Miniflare({modules:true,scriptPath:new URL('../server/dist/worker.mjs',import.meta.url).pathname,compatibilityDate:'2026-07-30',host:'127.0.0.1',port:8787,
  durableObjects:{ROOMS:{className:'Room',useSQLite:true},REGISTRY:{className:'Registry',useSQLite:true}},
  bindings:{ALLOWED_ORIGINS:'http://127.0.0.1:8080'}});
await mf.ready;console.log('Online integration server ready on 8787');
process.on('SIGTERM',async()=>{await mf.dispose();process.exit(0);});process.on('SIGINT',async()=>{await mf.dispose();process.exit(0);});
