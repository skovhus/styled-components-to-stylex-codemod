import"./chunk-jRWAZmH_.js";import{f as e,p as t,s as n}from"./index-Ximph-zU.js";t();var r=e=>t=>t.theme.color[e],i=e(),a=n.div`
  width: 160px;
  height: 20px;
  border-radius: 6px;
  background-image: ${e=>`linear-gradient(90deg, transparent, ${r(e.$highlightColor)(e)}, transparent)`};
`,o=n.div`
  width: 160px;
  height: 20px;
  border-radius: 6px;
  background-image: ${e=>`linear-gradient(90deg, ${r(e.$startColor)(e)}, ${r(e.$endColor)(e)})`};
`,s=()=>(0,i.jsxs)(`div`,{style:{display:`grid`,gap:8,padding:12},children:[(0,i.jsx)(a,{$highlightColor:`accent`}),(0,i.jsx)(o,{$startColor:`labelBase`,$endColor:`accent`})]});export{s as App};