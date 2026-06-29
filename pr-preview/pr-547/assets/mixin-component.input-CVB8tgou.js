import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{l as t,u as n}from"./index-DvNPP0vU.js";var r=e(),i=t`
  @media (max-width: 767px) {
    display: none;
  }
`,a=t`
  color: red;
`,o=n.div`
  ${i}
`,s=n.div`
  color: red;
  padding: 16px;
  ${i}
`,c=n.div`
  ${a}
  &:hover {
    color: blue;
  }
`,l=n.div`
  background-color: blue;
  ${i}
  font-weight: bold;
`,u=()=>(0,r.jsxs)(`div`,{children:[(0,r.jsx)(o,{children:`Hidden on mobile (base)`}),(0,r.jsx)(s,{children:`Red with mixin`}),(0,r.jsx)(c,{children:`Red default, blue hover mixin`}),(0,r.jsx)(l,{children:`Blue with mixin`})]});export{u as App};