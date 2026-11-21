// Pure vector math for body-relative motion retargeting. No camera or rendering dependencies.
const add=(a,b)=>a.map((n,i)=>n+b[i]), sub=(a,b)=>a.map((n,i)=>n-b[i]), mul=(a,k)=>a.map(n=>n*k), dot=(a,b)=>a.reduce((s,n,i)=>s+n*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=a=>Math.hypot(...a), unit=a=>norm(a)>1e-8?mul(a,1/norm(a)):null;
const rad=180/Math.PI;
export function bodyBasis(left,right,hips){
 const lateral=unit(sub(right,left));if(!lateral||norm(sub(right,left))<.08)return null;
 const upHint=hips?sub(mul(add(left,right),.5),hips):[0,1,0];
 const up=unit(sub(upHint,mul(lateral,dot(upHint,lateral))));if(!up||norm(cross(lateral,upHint))<.08)return null;
 const front=unit(cross(lateral,up));if(!front)return null;
 return {right:lateral,up,front,reference:hips?'torso':'shoulders + camera up'};
}
export function project(v,b){return [dot(v,b.right),dot(v,b.up),dot(v,b.front)];}
export function shoulderAngles(dir,side){
 const u=unit(dir);if(!u)return [null,null];
 const [x,y,z]=u;
 // Sagittal flexion: forward positive, behind torso negative. Undefined near a pure lateral pose.
 const pitch=Math.hypot(y,z)>.12?Math.atan2(z,-y)*rad:null;
 const lateral=side==='left'?-x:x;
 const abduction=Math.atan2(lateral,Math.hypot(y,z))*rad;
 return [pitch,abduction];
}
export function angle(a,b){const u=unit(a),v=unit(b);return u&&v?Math.acos(Math.max(-1,Math.min(1,dot(u,v))))*rad:null;}
export function filterDirection(previous,current,dt,amount){
 const v=unit(current);if(!v)return previous;const p=previous&&unit(previous);if(!p||amount<=0||dt>.4)return v;
 const similarity=Math.max(-1,Math.min(1,dot(p,v)));
 const omega=Math.acos(similarity), speed=omega/Math.max(.012,dt);
 const tau=(.018+.24*amount*amount)/(1+.65*speed);
 const alpha=1-Math.exp(-Math.max(.012,dt)/tau);
 if(similarity<-.995)return alpha>.65?v:p;
 if(omega<1e-5)return v;
 return unit(add(mul(p,Math.sin((1-alpha)*omega)/Math.sin(omega)),mul(v,Math.sin(alpha*omega)/Math.sin(omega))))||v;
}
