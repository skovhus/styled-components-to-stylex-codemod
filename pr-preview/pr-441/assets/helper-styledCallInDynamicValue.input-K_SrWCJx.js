import"./chunk-jRWAZmH_.js";import{c as e,m as t,p as n}from"./index-XwPV70ML.js";import{f as r,x as i}from"./helpers-D0E4EKp7.js";t();var a=e=>t=>t.theme.color[e],o=n(),s=e.div`
  width: 160px;
  height: 20px;
  border-radius: 6px;
  background-image: ${e=>`linear-gradient(90deg, transparent, ${a(e.$highlightColor)(e)}, transparent)`};
`,c=e.div`
  width: 160px;
  height: 20px;
  border-radius: 6px;
  background-image: ${e=>`linear-gradient(90deg, ${a(e.$startColor)(e)}, ${a(e.$endColor)(e)})`};
`,l=e.div`
  width: 160px;
  height: 20px;
  border-radius: 6px;
  background-image: ${e=>`linear-gradient(90deg, ${a(e.$highlightColor)(e)}, ${a(e.$highlightColor)(e)})`};
`,u=e.div`
  width: 160px;
  height: 20px;
  border-radius: 6px;
  background-image: ${e=>`linear-gradient(90deg, ${a(e.$highlightColor)(e)} ${e.$size}px, transparent)`};
`,d=e.div`
  width: 160px;
  height: 20px;
  border-radius: 6px;
  background-color: white;
  text-shadow: ${e=>i(e.$shadow)};
`,f=e.div`
  width: 160px;
  height: 20px;
  border-radius: 6px;
  background-color: white;
  text-shadow: ${e=>`${i(e.$shadowTone)}, ${r(e.$shadowTone)}`};
`,p=()=>(0,o.jsxs)(`div`,{style:{display:`grid`,gap:8,padding:12},children:[(0,o.jsx)(s,{$highlightColor:`accent`}),(0,o.jsx)(c,{$startColor:`labelBase`,$endColor:`accent`}),(0,o.jsx)(l,{$highlightColor:`accent`}),(0,o.jsx)(u,{$highlightColor:`accent`,$size:12}),(0,o.jsx)(d,{$shadow:`dark`}),(0,o.jsx)(f,{$shadowTone:`light`})]});export{p as App};