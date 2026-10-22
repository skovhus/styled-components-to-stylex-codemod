import{t as e}from"./jsx-runtime-CF8L0Gwd.js";import{i as t}from"./styled-components.browser.esm-Dy4oaG3m.js";var n=e(),r=t.a`
  display: flex;
  padding: 8px;
  background: papayawhip;
`,i=t.span`
  padding: 4px 8px;
  color: gray;

  ${r}:focus-visible ~ & {
    color: blue;
  }

  @media (min-width: 768px) {
    ${r}:hover ~ & {
      background: lightyellow;
    }
  }
`,a=t.span`
  color: gray;
  padding: 4px 8px;

  ${r}:hover & {
    color: green;
  }
`,o=()=>(0,n.jsxs)(`div`,{children:[(0,n.jsx)(r,{href:`#`,children:`Link`}),(0,n.jsx)(i,{children:`Badge (blue when Link is focused, lightyellow bg on hover at 768px+)`}),(0,n.jsx)(r,{href:`#`,children:(0,n.jsx)(a,{children:`Nested in Link (green on hover)`})})]});export{o as App};