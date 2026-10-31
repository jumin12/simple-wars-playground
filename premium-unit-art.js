/* Resolution-independent engraved counters. Draw once into the unit sprite cache. */
(function (global) {
  'use strict';
  function mark(ctx, unit, r, period) {
    const type = unit.type, modern = period === 'modern';
    ctx.save(); ctx.scale(r, r); ctx.lineWidth = .105; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const line = (...points) => { ctx.beginPath(); points.forEach(([x,y],i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y)); ctx.stroke(); };
    const circle = (x,y,s,fill=false) => { ctx.beginPath(); ctx.arc(x,y,s,0,Math.PI*2); fill ? ctx.fill() : ctx.stroke(); };
    const box = (x,y,w,h) => { ctx.beginPath(); ctx.roundRect(x,y,w,h,.05); ctx.stroke(); };
    const horse = () => {
      ctx.beginPath(); ctx.moveTo(-.44,.5); ctx.bezierCurveTo(-.3,.02,-.3,-.3,-.08,-.48);
      ctx.lineTo(-.08,-.75); ctx.lineTo(.12,-.53); ctx.lineTo(.31,-.39); ctx.lineTo(.54,-.08);
      ctx.lineTo(.4,.1); ctx.lineTo(.11,-.02); ctx.bezierCurveTo(.08,.18,.32,.32,.39,.5); ctx.closePath(); ctx.stroke();
      circle(.16,-.29,.035,true); line([-.18,-.48],[-.35,-.22],[-.4,.16]);
    };
    const anchor = () => { line([0,-.55],[0,.49]); circle(0,-.67,.11); line([-.3,-.27],[.3,-.27]);
      ctx.beginPath(); ctx.moveTo(-.52,.02); ctx.bezierCurveTo(-.5,.58,.5,.58,.52,.02); ctx.stroke(); line([-.6,.15],[-.52,.02],[-.38,.13]); line([.38,.13],[.52,.02],[.6,.15]); };
    const vessel = cargo => {
      line([-.75,.22],[-.51,.58],[.49,.58],[.76,.22],[-.75,.22]);
      if (cargo) { box(-.4,-.25,.8,.46); line([0,-.25],[0,.21]); if(type==='supply'){line([-.38,-.04],[.38,-.04]);line([.48,-.5],[.48,.2]);line([.48,-.5],[.74,-.38],[.48,-.28]);} }
      else if(modern){box(-.35,-.13,.56,.33);box(-.16,-.43,.31,.3);line([.25,-.06],[.68,-.06]);line([.04,-.43],[.04,-.75]);}
      else {line([0,-.75],[0,.2]);line([.04,-.7],[.55,.08],[.04,.08]);line([-.05,-.57],[-.43,.05],[-.05,.05]);if(period==='ancient')for(let x=-.47;x<=.5;x+=.23)line([x,.46],[x-.18,.72]);}
      line([-.64,.76],[-.3,.8],[.02,.76],[.33,.8],[.64,.76]);
    };
    if (['ship','transport','supply'].includes(type) || type === 'convoy' && unit.convoySeaRoute) vessel(type !== 'ship');
    else if(type==='heavy') {
      if(modern) { box(-.65,-.28,1.3,.75); box(-.4,-.5,.75,.49); line([.03,-.28],[.81,-.58]); for(let x=-.44;x<.5;x+=.23)circle(x,.29,.09); }
      else {horse();line([-.65,-.65],[-.65,.65]);line([-.65,-.62],[-.35,-.52],[-.65,-.31]);if(period==='ancient'){circle(-.49,.62,.19);line([-.68,.35],[-.2,.35]);}}
    } else if(type==='motorized' || type==='convoy') {
      if(modern){box(-.7,-.35,.89,.74);box(.19,-.21,.47,.6);box(.29,-.13,.26,.24);circle(-.4,.46,.16);circle(.45,.46,.16);}
      else if(type==='convoy'){box(-.61,-.3,1.15,.55);circle(-.4,.47,.2);circle(.4,.47,.2);line([-.6,-.3],[-.42,-.6],[.34,-.6],[.54,-.3]);}
      else {horse();line([-.56,.62],[.6,-.6]);if(period==='napoleonic')line([-.57,.35],[-.35,.56]);}
    } else if(type==='mountaineer') {
      line([-.75,.53],[-.27,-.36],[.05,.1],[.3,-.65],[.77,.53]);
      if(period==='ancient') {line([-.5,-.63],[-.28,-.45],[-.04,-.68]);circle(-.27,-.47,.11);}
      else if(period==='medieval'){ctx.beginPath();ctx.moveTo(-.53,-.67);ctx.quadraticCurveTo(.05,-.3,-.53,.13);ctx.stroke();line([-.53,-.67],[-.53,.13]);line([-.66,-.25],[.06,-.25]);}
      else {line([-.58,.66],[.6,-.58]);line([.28,-.69],[.71,-.45]);}
    } else if(type==='marine') anchor();
    else if(period==='ancient'){line([-.57,.63],[.51,-.67]);line([.57,.63],[-.51,-.67]);circle(0,.06,.34);circle(0,.06,.09);line([.39,-.58],[.51,-.67],[.48,-.5]);}
    else if(period==='medieval'){line([-.52,.61],[.52,-.62]);line([-.6,-.15],[.12,.54]);line([.17,.46],[.59,.04]);line([-.15,-.58],[-.57,-.16]);}
    else if(period==='napoleonic'){line([-.6,.6],[.63,-.65]);line([.6,.6],[-.63,-.65]);line([-.63,.56],[-.42,.67]);line([.63,.56],[.42,.67]);line([-.47,-.45],[-.47,-.75]);line([.47,-.45],[.47,-.75]);}
    else {line([-.58,.58],[.58,-.58]);line([.58,.58],[-.58,-.58]);line([-.55,.2],[-.72,.37]);line([.55,.2],[.72,.37]);line([.2,-.2],[.36,-.04]);line([-.2,-.2],[-.36,-.04]);}
    ctx.restore();
  }
  function draw(ctx, unit, r, faction, supporter) {
    const period = unit._previewPeriod || (typeof wodGetRenderPeriod === 'function' ? wodGetRenderPeriod() : 'modern');
    ctx.save(); ctx.scale(r,r);
    const outer = () => {
      ctx.beginPath();
      if(period==='ancient') ctx.arc(0,0,1.13,0,Math.PI*2);
      else if(period==='medieval'){ctx.moveTo(-.97,-1.06);ctx.lineTo(.97,-1.06);ctx.lineTo(.91,.3);ctx.quadraticCurveTo(.75,.85,0,1.17);ctx.quadraticCurveTo(-.75,.85,-.91,.3);ctx.closePath();}
      else {const w=period==='napoleonic'?2.25:2.42;ctx.roundRect(-w/2,-.96,w,1.92,period==='napoleonic'?.33:.2);}
    };
    ctx.shadowColor='#0009';ctx.shadowBlur=r*.23;ctx.shadowOffsetY=r*.12;
    const metal=ctx.createLinearGradient(-1,-1,1,1);metal.addColorStop(0,'#fff1ad');metal.addColorStop(.2,'#bf7d27');metal.addColorStop(.43,'#ffe6a0');metal.addColorStop(.68,'#a3641a');metal.addColorStop(1,'#edc96a');
    outer();ctx.fillStyle=metal;ctx.fill();ctx.shadowColor='transparent';ctx.strokeStyle='#4c3217';ctx.lineWidth=.065;ctx.stroke();
    ctx.save();ctx.scale(.89,.87);outer();
    const face=ctx.createLinearGradient(0,-1,0,1);
    if(supporter){face.addColorStop(0,'#fff6dc');face.addColorStop(.5,'#e8d6a4');face.addColorStop(1,'#b6a077');}
    else {face.addColorStop(0,'#29343b');face.addColorStop(.5,'#0d171d');face.addColorStop(1,'#202832');}
    ctx.fillStyle=face;ctx.fill();ctx.strokeStyle=supporter?'#947140':'#e9ca74';ctx.lineWidth=.025;ctx.stroke();ctx.restore();
    ctx.save();ctx.scale(.79,.77);outer();ctx.setLineDash([.025,.075]);ctx.strokeStyle=supporter?'#a18551':'#9d8755';ctx.lineWidth=.02;ctx.stroke();ctx.restore();ctx.setLineDash([]);
    // Fine laurel engraving and four polished pins distinguish the premium rim.
    for(const side of [-1,1])for(let i=0;i<5;i++){
      const a=.38+i*.19,x=side*(.83-Math.sin(a)*.09),y=.62-i*.22;
      ctx.save();ctx.translate(x,y);ctx.rotate(side*(-.5+i*.05));ctx.fillStyle=supporter?'#b98b35':'#d4b469';ctx.beginPath();ctx.ellipse(0,0,.04,.095,0,0,Math.PI*2);ctx.fill();ctx.restore();
    }
    for(const [x,y] of [[-.87,-.66],[.87,-.66],[-.79,.59],[.79,.59]]) {ctx.fillStyle='#6b491d';ctx.beginPath();ctx.arc(x,y,.042,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff0ba';ctx.beginPath();ctx.arc(x-.012,y-.012,.018,0,Math.PI*2);ctx.fill();}
    ctx.strokeStyle=supporter?'#263d49':'#efcf7d';ctx.fillStyle=ctx.strokeStyle;ctx.translate(0,.01);mark(ctx,unit,.76,period);
    ctx.strokeStyle=faction||'#83c9a1';ctx.lineWidth=.09;ctx.beginPath();ctx.moveTo(-.33,.79);ctx.lineTo(.33,.79);ctx.stroke();
    if(supporter){ctx.fillStyle='#a16c20';ctx.beginPath();ctx.moveTo(-.22,-.85);ctx.lineTo(-.18,-.99);ctx.lineTo(-.07,-.9);ctx.lineTo(0,-1.04);ctx.lineTo(.07,-.9);ctx.lineTo(.18,-.99);ctx.lineTo(.22,-.85);ctx.closePath();ctx.fill();}
    ctx.restore();
  }
  global.wodDrawPremiumChip = draw;
  global.wodDrawPremiumMark = mark;
  global.wodDrawPremiumSelection = function(ctx, r, period) {
    ctx.save();ctx.scale(r*1.14,r*1.14);ctx.strokeStyle='#f1c40f';ctx.lineWidth=.08;ctx.beginPath();
    if(period==='ancient')ctx.arc(0,0,1.13,0,Math.PI*2);
    else if(period==='medieval'){ctx.moveTo(-.97,-1.06);ctx.lineTo(.97,-1.06);ctx.lineTo(.91,.3);ctx.quadraticCurveTo(.75,.85,0,1.17);ctx.quadraticCurveTo(-.75,.85,-.91,.3);ctx.closePath();}
    else{const w=period==='napoleonic'?2.25:2.42;ctx.roundRect(-w/2,-.96,w,1.92,period==='napoleonic'?.33:.2);}
    ctx.stroke();ctx.restore();
  };
})(typeof globalThis === 'undefined' ? window : globalThis);
