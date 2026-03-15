import"./react-D4cBbUL-.js";import{f as e,s as t}from"./index-BFw42tS8.js";var n=e(),r=`#BF4F74`,i=16,a=t.button`
  background: ${r};
  padding: ${i}px;
  border-radius: ${`4px`};
  color: white;
  border: none;
`,o=t.p`
  font-size: ${14}px;
  line-height: ${1.5};
  margin: ${i/2}px 0;
`,s=t.button`
  background: ${`#BF4F74`};
  color: ${`white`};
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
`,c={color:{primary:`#BF4F74`,secondary:`#4F74BF`},spacing:{sm:`8px`,md:`16px`}},l=t.div`
  background: ${c.color.primary};
  border: 1px solid ${c.color.secondary};
  padding: ${c.spacing.md};
  border-radius: 8px;
`,u=e=>e===`primary`?`#BF4F74`:`#4F74BF`,d=t.div`
  background: ${e=>u(e.$variant)};
  padding: 16px;
  color: white;
  border-radius: 4px;
`,f=()=>(0,n.jsxs)(`div`,{children:[(0,n.jsx)(a,{children:`Button`}),(0,n.jsx)(o,{children:`Some text`}),(0,n.jsx)(s,{children:`Conditional`}),(0,n.jsx)(l,{children:`Themed Card`}),(0,n.jsx)(d,{$variant:`primary`,children:`Primary`}),(0,n.jsx)(d,{$variant:`secondary`,children:`Secondary`})]});export{f as App};