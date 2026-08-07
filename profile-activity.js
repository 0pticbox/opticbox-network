import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, isSupabaseConfigured } from './supabase-config.js';
const root = document.getElementById('profile-activity');
const count = document.getElementById('profile-activity-count');
const params = new URLSearchParams(location.search);
let profileId = params.get('id');
const requestedHandle = String(params.get('handle') || '').trim().replace(/^@+/, '').replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 32);
function safeUrl(value){try{const u=new URL(String(value||'').trim());return ['http:','https:'].includes(u.protocol)?u.href:''}catch{return''}}
function dateText(value){const d=new Date(value);return Number.isNaN(d.getTime())?'':new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric'}).format(d)}
function eventDate(value){if(!value)return'';const d=new Date(`${value}T12:00:00`);return Number.isNaN(d.getTime())?'':new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric'}).format(d)}
function empty(text='No community posts yet.'){root.replaceChildren();const p=document.createElement('p');p.className='review-empty';p.textContent=text;root.append(p);if(count)count.textContent='0 posts'}
function render(rows){
  root.replaceChildren();
  if(count) count.textContent=`${rows.length} ${rows.length===1?'post':'posts'}`;
  if(!rows.length){empty();return;}
  for(const post of rows){
    const article=document.createElement('article');article.className='profile-activity-card';
    const badge=document.createElement('span');badge.className='activity-post-badge';badge.textContent=post.post_type==='event'?'GOING TO':post.post_type==='listening'?'NOW LISTENING':'POST';article.append(badge);
    if(post.title){const title=document.createElement('strong');title.textContent=post.title;article.append(title)}
    let detail='';if(post.post_type==='event')detail=[eventDate(post.event_date),post.city].filter(Boolean).join(' · ');if(post.post_type==='listening'&&post.subtitle)detail=`by ${post.subtitle}`;
    if(detail){const p=document.createElement('p');p.textContent=detail;article.append(p)}
    if(post.caption){const p=document.createElement('p');p.textContent=post.caption;article.append(p)}
    const image=safeUrl(post.image_url);if(image){const img=document.createElement('img');img.className='profile-activity-image';img.src=image;img.alt=post.title?`Image for ${post.title}`:'Community post image';img.loading='lazy';article.append(img)}
    const link=safeUrl(post.media_url);if(link){const a=document.createElement('a');a.className='retro-button';a.href=link;a.target='_blank';a.rel='noopener';a.textContent=post.post_type==='event'?'Event page':post.post_type==='listening'?'Listen':'Open link';article.append(a)}
    const small=document.createElement('small');small.textContent=dateText(post.created_at);article.append(small);root.append(article);
  }
}
async function run(){
  if(!root)return;
  if(!isSupabaseConfigured()){empty();return;}
  const{createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.1/+esm');const supabase=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
  if(!profileId&&requestedHandle){const lookup=await supabase.from('profiles').select('id').ilike('profile_handle',requestedHandle).limit(1).maybeSingle();if(!lookup.error)profileId=lookup.data?.id||''}
  if(!profileId){empty();return;}
  const result=await supabase.from('activity_posts').select('id,post_type,title,subtitle,caption,media_url,image_url,event_date,city,created_at').eq('user_id',profileId).eq('visible',true).order('created_at',{ascending:false}).limit(20);
  if(result.error)empty('Activity could not load.');else render(result.data||[]);
}
run().catch(()=>empty('Activity could not load.'));
