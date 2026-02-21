import{j as r,a as t}from"./index-BPaMQNp_.js";const i=t.button.withConfig({shouldForwardProp:o=>!o.startsWith("$")})`
  background: ${o=>o.$variant==="primary"?"#BF4F74":"#4F74BF"};
  color: white;
  padding: 8px 16px;
`,n=t.button.withConfig({shouldForwardProp:o=>!["customProp","anotherProp"].includes(o)})`
  background: ${o=>o.customProp||"#BF4F74"};
  padding: ${o=>(o.anotherProp||16)+"px"};
  color: white;
`,p=()=>r.jsxs("div",{children:[r.jsx(i,{$variant:"primary",children:"Primary"}),r.jsx(n,{customProp:"#4CAF50",anotherProp:24,children:"Custom"})]});export{p as App,n as ExplicitFilterButton,i as TransientButton};
