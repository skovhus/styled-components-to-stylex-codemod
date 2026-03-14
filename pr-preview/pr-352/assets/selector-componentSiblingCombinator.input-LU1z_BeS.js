import{j as i,c as e}from"./index-DfKOu5b3.js";const o=e.a`
  display: flex;
  padding: 8px;
  background: papayawhip;
`,n=e.span`
  padding: 4px 8px;
  color: gray;

  ${o}:focus-visible + & {
    color: blue;
  }

  @media (min-width: 768px) {
    ${o}:hover + & {
      background: lightyellow;
    }
  }
`,p=()=>i.jsxs("div",{children:[i.jsx(o,{href:"#",children:"Link"}),i.jsx(n,{children:"Badge (blue when Link is focused, lightyellow bg on hover at 768px+)"})]});export{p as App};
