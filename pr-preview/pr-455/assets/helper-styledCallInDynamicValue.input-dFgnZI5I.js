import"./chunk-jRWAZmH_.js";import{c as e,m as t,p as n}from"./index-BUiihUH8.js";import{f as r,x as i}from"./helpers-Cyj_3Q85.js";t();var a=e=>t=>t.theme.color[e],o=n(),s=e.div`
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
  min-height: 40px;
  border-radius: 6px;
  padding: 8px;
  color: white;
  background-color: ${e=>a(e.$color??`labelFaint`)(e)} !important;
`,d=e.div`
  width: 160px;
  height: 20px;
  border-radius: 6px;
  background-image: ${e=>`linear-gradient(90deg, ${a(e.$highlightColor)(e)} ${e.$size}px, transparent)`};
`,f=e.div`
  width: 160px;
  height: 20px;
  border-radius: 6px;
  background-color: white;
  text-shadow: ${e=>i(e.$shadow)};
`,p=e.div`
  width: 160px;
  height: 20px;
  border-radius: 6px;
  background-color: white;
  text-shadow: ${e=>`${i(e.$shadowTone)}, ${r(e.$shadowTone)}`};
`,m=()=>(0,o.jsxs)(`div`,{style:{display:`grid`,gap:8,padding:12},children:[(0,o.jsx)(s,{$highlightColor:`accent`}),(0,o.jsx)(c,{$startColor:`labelBase`,$endColor:`accent`}),(0,o.jsx)(l,{$highlightColor:`accent`}),(0,o.jsx)(u,{children:`Default faint panel`}),(0,o.jsx)(u,{$color:`accent`,children:`Accent panel`}),(0,o.jsx)(d,{$highlightColor:`accent`,$size:12}),(0,o.jsx)(f,{$shadow:`dark`}),(0,o.jsx)(p,{$shadowTone:`light`})]});export{m as App};