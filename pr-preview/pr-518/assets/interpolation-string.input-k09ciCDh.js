import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{l as t}from"./index-RR7uz_zw.js";var n=e(),r=`#BF4F74`,i=16,a=`8`,o=t.button`
  background: ${r};
  padding: ${i}px;
  border-radius: ${`4px`};
  color: white;
  border: none;
`,s=t.p`
  font-size: ${14}px;
  line-height: ${1.5};
  margin: ${i/2}px 0;
`,c=t.p`
  margin: ${a}px 0;
`,l=t.button`
  background: ${`#BF4F74`};
  color: ${`white`};
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
`,u={color:{primary:`#BF4F74`,secondary:`#4F74BF`},spacing:{sm:`8px`,md:`16px`}},d=t.div`
  background: ${u.color.primary};
  border: 1px solid ${u.color.secondary};
  padding: ${u.spacing.md};
  border-radius: 8px;
`,f=e=>e===`primary`?`#BF4F74`:`#4F74BF`,p=t.div`
  background: ${e=>f(e.$variant)};
  padding: 16px;
  color: white;
  border-radius: 4px;
`,m=()=>(0,n.jsxs)(`div`,{children:[(0,n.jsx)(o,{children:`Button`}),(0,n.jsx)(s,{children:`Some text`}),(0,n.jsx)(c,{children:`String spacing`}),(0,n.jsx)(l,{children:`Conditional`}),(0,n.jsx)(d,{children:`Themed Card`}),(0,n.jsx)(p,{$variant:`primary`,children:`Primary`}),(0,n.jsx)(p,{$variant:`secondary`,children:`Secondary`})]});export{m as App};