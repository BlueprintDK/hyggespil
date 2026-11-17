/* Hyggespil web-udgave: q9.js uden 🔞-puljer. Kun rettelsen i love-puljen er tilbage. */
(function(){
const f0=window.HS_FINISH;
window.HS_FINISH=function(){f0&&f0();try{(DATA.law||[]).forEach(i=>{if(i.e)i.e=i.e.replace('både måske og','både mundtlige og')})}catch(e){}};
})();
