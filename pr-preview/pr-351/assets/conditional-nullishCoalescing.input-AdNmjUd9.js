import{j as o,c as e}from"./index-CeRyEgL2.js";const i=e.hr`
  border: none;
  height: 1px;
  background: ${t=>t.$color??"#e0e0e0"};
  margin: 16px 0;
`,n=e.div`
  transition-delay: ${t=>t.$delay??0}ms;
  transition-property: opacity;
  transition-duration: 200ms;
  transition-timing-function: ease-out;
`,s=()=>o.jsxs("div",{children:[o.jsx(i,{}),o.jsx(i,{$color:"#bf4f74"}),o.jsx(n,{children:"Default delay"}),o.jsx(n,{$delay:100,children:"Custom delay"})]});export{s as App};
