import type { R2Bucket } from '@cloudflare/workers-types';

/** Stream a private R2 audio object after its route has verified school access. */
export async function privateDomanAudioResponse(bucket:R2Bucket,key:string,mimeType:string):Promise<Response>{
  const object=await bucket.get(key);
  if(!object)return new Response('Audio no encontrado.',{status:404});
  const headers=new Headers();
  object.writeHttpMetadata(headers);
  headers.set('content-type',mimeType);
  headers.set('content-length',String(object.size));
  headers.set('cache-control','private, no-store');
  headers.set('x-content-type-options','nosniff');
  headers.set('accept-ranges','none');
  return new Response(object.body,{headers});
}
