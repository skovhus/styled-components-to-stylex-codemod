import{j as o,c as r}from"./index-FP_Cx-M0.js";const e="#BF4F74",t=16,c="4px",a=r.button`
  background: ${e};
  padding: ${t}px;
  border-radius: ${c};
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
`,u=()=>o.jsxs("div",{children:[o.jsx(a,{children:"Button"}),o.jsx(x,{children:"Some text"}),o.jsx(l,{children:"Conditional"}),o.jsx(m,{children:"Themed Card"}),o.jsx(i,{$variant:"primary",children:"Primary"}),o.jsx(i,{$variant:"secondary",children:"Secondary"})]});export{u as App};
