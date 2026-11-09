import crypto from 'node:crypto';
const ALLOWED_TARGETS=new Set(['post','story','avatar','cover']);
const MAX_BODY_BYTES=16*1024;
function send(res,status,payload){res.setHeader('Cache-Control','no-store, max-age=0');return res.status(status).json(payload)}
function signableValue(v){if(Array.isArray(v))return v.join(',');if(typeof v==='string'||typeof v==='number'||typeof v==='boolean')return String(v);throw new Error('Unsupported upload parameter value.')}
function buildSignature(params,secret){const pairs=Object.entries(params).filter(([k,v])=>!['file','api_key','cloud_name','resource_type','signature','source'].includes(k)&&v!==undefined&&v!==null&&v!=='').map(([k,v])=>[k,signableValue(v)]).sort(([a],[b])=>a.localeCompare(b));return crypto.createHash('sha1').update(pairs.map(([k,v])=>`${k}=${v}`).join('&')+secret).digest('hex')}
export default async function handler(req,res){
 if(req.method!=='POST'){res.setHeader('Allow','POST');return send(res,405,{error:'Method not allowed'})}
 try{
  const contentLength=Number(req.headers['content-length']||0); if(contentLength>MAX_BODY_BYTES)return send(res,413,{error:'Request too large.'});
  const auth=req.headers.authorization||''; const token=auth.startsWith('Bearer ')?auth.slice(7).trim():''; if(!token)return send(res,401,{error:'Authentication required.'});
  const supabaseUrl=process.env.SUPABASE_URL; const supabaseKey=process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY;
  const cloudName=process.env.CLOUDINARY_CLOUD_NAME; const apiKey=process.env.CLOUDINARY_API_KEY; const apiSecret=process.env.CLOUDINARY_API_SECRET;
  if(!supabaseUrl||!supabaseKey)return send(res,503,{error:'Supabase configuration is incomplete.'});
  if(!cloudName||!apiKey||!apiSecret)return send(res,503,{error:'Cloudinary signed upload configuration is incomplete.'});
  const authResponse=await fetch(`${supabaseUrl.replace(/\/$/,'')}/auth/v1/user`,{headers:{apikey:supabaseKey,Authorization:`Bearer ${token}`}});
  if(!authResponse.ok)return send(res,401,{error:'Invalid or expired authentication.'});
  const user=await authResponse.json(); if(!user?.id)return send(res,401,{error:'Authenticated user not found.'});
  const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{}); const target=String(body.target||'');
  if(!ALLOWED_TARGETS.has(target))return send(res,400,{error:'Invalid upload target.'});
  const timestamp=Number(body.timestamp); if(!Number.isInteger(timestamp)||Math.abs(Math.floor(Date.now()/1000)-timestamp)>600)return send(res,400,{error:'Invalid or expired timestamp.'});
  const assetFolder=`closer/${user.id}/${target}`; const signature=buildSignature({asset_folder:assetFolder,timestamp},apiSecret);
  return send(res,200,{signature,timestamp,api_key:apiKey,cloud_name:cloudName,asset_folder:assetFolder});
 }catch(error){console.error('Cloudinary signature error',error);return send(res,500,{error:'Unable to authorize upload.'})}
}
