import"./chunk-jRWAZmH_.js";import{f as e,p as t,s as n}from"./index-BXDnwBLP.js";import{b as r}from"./helpers-BfwgNcTO.js";t();var i=e=>t=>t.theme.color[e],a=e(),o=n.div`
  width: 160px;
  height: 20px;
  border-radius: 6px;
  background-image: ${e=>`linear-gradient(90deg, transparent, ${i(e.$highlightColor)(e)}, transparent)`};
`,s=n.div`
  width: 160px;
  height: 20px;
  border-radius: 6px;
  background-image: ${e=>`linear-gradient(90deg, ${i(e.$startColor)(e)}, ${i(e.$endColor)(e)})`};
`,c=n.div`
  width: 160px;
  height: 20px;
  border-radius: 6px;
  background-image: ${e=>`linear-gradient(90deg, ${i(e.$highlightColor)(e)}, ${i(e.$highlightColor)(e)})`};
`,l=n.div`
  width: 160px;
  height: 20px;
  border-radius: 6px;
  background-color: white;
  text-shadow: ${e=>r(e.$shadow)};
`,u=()=>(0,a.jsxs)(`div`,{style:{display:`grid`,gap:8,padding:12},children:[(0,a.jsx)(o,{$highlightColor:`accent`}),(0,a.jsx)(s,{$startColor:`labelBase`,$endColor:`accent`}),(0,a.jsx)(c,{$highlightColor:`accent`}),(0,a.jsx)(l,{$shadow:`dark`})]});export{u as App};