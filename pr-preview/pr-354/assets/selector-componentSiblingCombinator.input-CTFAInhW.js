import{j as e,c as o}from"./index-B2uPh2kr.js";const n=o.a`
  display: flex;
  padding: 8px;
  background: papayawhip;
`,i=o.span`
  padding: 4px 8px;
  color: gray;

  ${n}:focus-visible + & {
    color: blue;
  }

  @media (min-width: 768px) {
    ${n}:hover + & {
      background: lightyellow;
    }
  }
`,r=o.span`
  color: gray;
  padding: 4px 8px;

  ${n}:hover & {
    color: green;
  }
`,d=()=>e.jsxs("div",{children:[e.jsx(n,{href:"#",children:"Link"}),e.jsx(i,{children:"Badge (blue when Link is focused, lightyellow bg on hover at 768px+)"}),e.jsx(n,{href:"#",children:e.jsx(r,{children:"Nested in Link (green on hover)"})})]});export{d as App};
