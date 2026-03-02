import{j as e,c as l}from"./index-DZ9IcVcS.js";const t=l("div").withConfig({shouldForwardProp:o=>o!=="debugName"})`
  display: flex;
  border: 1px solid #333;
  padding: 8px;
`,n=l(t)`
  background-color: #d9f6ff;
`,s=()=>e.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:12,padding:16},children:[e.jsx(n,{children:"Default content"}),e.jsx(n,{as:"input",onChange:o=>console.log("Changed to "+o.target.value),value:"Hello"})]});export{s as App,n as Content,t as Flex};
