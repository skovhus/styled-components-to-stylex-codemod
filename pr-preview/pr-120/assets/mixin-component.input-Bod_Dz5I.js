import{j as i,d as e,l as o}from"./index-B4qiiF0X.js";const n=o`
  @media (max-width: 767px) {
    display: none;
  }
`,d=o`
  color: red;
`,l=e.div`
  ${n}
`,t=e.div`
  color: red;
  padding: 16px;
  ${n}
`,r=e.div`
  ${d}
  &:hover {
    color: blue;
  }
`,s=e.div`
  background-color: blue;
  ${n}
  font-weight: bold;
`,c=()=>i.jsxs("div",{children:[i.jsx(l,{children:"Hidden on mobile (base)"}),i.jsx(t,{children:"Red with mixin"}),i.jsx(r,{children:"Red default, blue hover mixin"}),i.jsx(s,{children:"Blue with mixin"})]});export{c as App};
