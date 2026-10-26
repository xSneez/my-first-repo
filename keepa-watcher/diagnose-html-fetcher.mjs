/** A small explicit read-only diagnostic run; no automatic upload and no raw HTML logs. */
import { appendFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runProductPageJobs, createProductPageFetcher, FETCHER_VERSION } from './html-fetcher.mjs';
const args=process.argv.slice(2);
function option(name) { const index=args.indexOf(name); return index>=0 ? args[index+1] : undefined; }
const defaultCases=[
  {asin:'B0CNCR2PYV',land:'de'}, {asin:'B00NGVEP5Q',land:'fr'},
  {asin:'B0DSFY6TT5',land:'fr'}, {asin:'B0F6N7CS4B',land:'de'},
  {asin:'B0F6N7CS4B',land:'it'},
];
let jobs=defaultCases;
if(option('--cases')) jobs=JSON.parse(readFileSync(resolve(option('--cases')),'utf8'));
if(!Array.isArray(jobs)||!jobs.length||jobs.length>1000) throw new Error('Use 1..1000 explicit cases.');
const output=resolve(option('--output')??`html-fetch-diagnose-${Date.now()}.jsonl`);
console.log(JSON.stringify({version:FETCHER_VERSION,cases:jobs.length,output,mode:'promotion'}));
// --probe enables only this explicit read-only diagnostic process; it never edits .env.
const run = args.includes('--probe')
  ? createProductPageFetcher({runtimeEnv:{...process.env,AMAZON_HTML_ENABLED:'true'}}).runProductPageJobs
  : runProductPageJobs;
const counts=await run(jobs,{
  onResult:async(job,result)=>{
    const {html,...metadata}=result;
    const entry={t:new Date().toISOString(),asin:job.asin,land:job.land??job.country,
      htmlReceived:typeof html==='string',...metadata};
    appendFileSync(output,JSON.stringify(entry)+'\n','utf8');
    console.log(JSON.stringify({asin:entry.asin,land:entry.land,reason:entry.reason,http:entry.httpStatus,
      selectedAsin:entry.selectedAsin,canonicalAsin:entry.canonicalAsin,contentType:entry.contentType,
      decodedHtmlBytes:entry.decodedHtmlBytes,durationMs:entry.durationMs,cacheDisposition:entry.cacheDisposition}));
  },
});
console.log(JSON.stringify({counts,output}));
process.exitCode=counts.failed||counts.deferred||counts.stopped?1:0;
