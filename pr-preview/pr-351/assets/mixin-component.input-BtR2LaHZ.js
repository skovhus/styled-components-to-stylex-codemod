import"./react-D4cBbUL-.js";import{f as e,s as t,u as n}from"./index-CvfJmPeC.js";var r=e(),i=n`
  @media (max-width: 767px) {
    display: none;
  }
`,a=n`
  color: red;
`,o=t.div`
  ${i}
`,s=t.div`
  color: red;
  padding: 16px;
  ${i}
`,c=t.div`
  ${a}
  &:hover {
    color: blue;
  }
`,l=t.div`
  background-color: blue;
  ${i}
  font-weight: bold;
`,u=()=>(0,r.jsxs)(`div`,{children:[(0,r.jsx)(o,{children:`Hidden on mobile (base)`}),(0,r.jsx)(s,{children:`Red with mixin`}),(0,r.jsx)(c,{children:`Red default, blue hover mixin`}),(0,r.jsx)(l,{children:`Blue with mixin`})]});export{u as App};