import{j as i,c as s}from"./index-DyIJ1_wz.js";const n=s.a`
  display: flex;
  padding: 8px;
  background: papayawhip;
`,a=s.span`
  padding: 4px 8px;
  color: gray;

  ${n}:focus-visible + & {
    color: blue;
  }
`,p=()=>i.jsxs("div",{children:[i.jsx(n,{href:"#",children:"Link"}),i.jsx(a,{children:"Badge (blue when Link is focused, adjacent sibling)"})]});export{p as App};
