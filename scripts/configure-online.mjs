import { writeFile } from 'node:fs/promises';
const value=process.env.ONLINE_API_BASE || '';
if(value){const u=new URL(value);if(u.pathname!=='/'||u.search||u.hash||u.username||u.password||(u.protocol!=='https:'&&!(u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname))))throw Error('ONLINE_API_BASE must be an HTTPS origin.');}
await writeFile(new URL('../live/config.js',import.meta.url),`// Generated backend origin; no credentials belong in this file.\nexport const API_BASE = ${JSON.stringify(value ? new URL(value).origin : '')};\n`);
console.log(value?'Online server origin configured.':'Online server remains unconfigured; screen preview stays available.');
