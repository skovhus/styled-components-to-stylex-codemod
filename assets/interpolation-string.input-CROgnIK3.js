import{j as o,a as r}from"./index-CeQ9WA9b.js";const a="#BF4F74",t=16,e="4px",c=r.button`
  background: ${a};
  padding: ${t}px;
  border-radius: ${e};
  color: white;
  border: none;
`,s=14,p=1.5,x=r.p`
  font-size: ${s}px;
  line-height: ${p};
  margin: ${t/2}px 0;
`,l=r.button`
  background: ${"#BF4F74"};
  color: ${"white"};
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
`,d={color:{primary:"#BF4F74",secondary:"#4F74BF"},spacing:{md:"16px"}},m=r.div`
  background: ${d.color.primary};
  border: 1px solid ${d.color.secondary};
  padding: ${d.spacing.md};
  border-radius: 8px;
`,h=n=>n==="primary"?"#BF4F74":"#4F74BF",i=r.div`
  background: ${n=>h(n.$variant)};
  padding: 16px;
  color: white;
  border-radius: 4px;
`,u=()=>o.jsxs("div",{children:[o.jsx(c,{children:"Button"}),o.jsx(x,{children:"Some text"}),o.jsx(l,{children:"Conditional"}),o.jsx(m,{children:"Themed Card"}),o.jsx(i,{$variant:"primary",children:"Primary"}),o.jsx(i,{$variant:"secondary",children:"Secondary"})]});export{u as App};
