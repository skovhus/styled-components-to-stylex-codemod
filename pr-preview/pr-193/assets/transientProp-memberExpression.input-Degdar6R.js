import{j as i,a as r}from"./index-BeauJk6N.js";import{m as o,U as a}from"./user-avatar-B_rmjETc.js";const t=r(o.div)`
  background: white;
  border-radius: ${e=>e.$isOpen?"8px":"20px"};
  overflow: hidden;
`,s=r(a)`
  box-shadow: 0 0 0 2px ${e=>e.$highlightColor??"transparent"};
  border-radius: 50%;
`,l=()=>i.jsxs("div",{children:[i.jsx(t,{$isOpen:!0,initial:{height:40},animate:{height:200},children:"Open content"}),i.jsx(t,{$isOpen:!1,initial:{height:40},animate:{height:40},children:"Closed"}),i.jsx(s,{user:"Alice",size:"small",$highlightColor:"blue"}),i.jsx(s,{user:"Bob",size:"tiny"})]});export{l as App};
