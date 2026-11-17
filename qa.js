/* Hyggespil web-udgave: qa.js uden 🔞-indhold (Grænseløs og køn til 🔞-udfordringer er fjernet).
   Bygget på allanpersson/hyggespil (MIT). Resten er uændret: rettelser i love-puljen og i mysterierne. */
(function(){
const f0=window.HS_FINISH;
const RP=[['slaveoprev','slaveoprør'],['besudelsen','besættelsen'],['Forbuddet mod at arbejde i kirketiden','Tvungen konfirmation af alle unge']];
window.HS_FINISH=function(){f0&&f0();try{(DATA.law||[]).forEach(i=>{RP.forEach(p=>{if(i.q)i.q=i.q.split(p[0]).join(p[1]);if(i.e)i.e=i.e.split(p[0]).join(p[1]);i.o=i.o.map(o=>o.split(p[0]).join(p[1]))})})}catch(e){console.error('HS qa',e)}};

/* retter stavefejl i mysteriernes tekst, uanset hvor de genereres */
let mv;const FX=[['spørgt','spurgt']];const fx=s=>typeof s==='string'?FX.reduce((a,p)=>a.split(p[0]).join(p[1]),s):s;
Object.defineProperty(window,'HS_MYS',{configurable:true,get(){return mv},set(f){mv=function(){const m=f.apply(this,arguments);try{m.story=m.story.map(fx);m.s=fx(m.s);m.c=m.c.map(fx)}catch(e){}return m}}});
})();
