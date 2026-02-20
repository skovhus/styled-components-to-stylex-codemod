import{j as i,a as e,b as o}from"./index-7MIUcVpt.js";const n=o`
  @media (max-width: 767px) {
    display: none;
  }
`,d=o`
  color: red;
`,t=e.div`
  ${n}
`,l=e.div`
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
`,c=()=>i.jsxs("div",{children:[i.jsx(t,{children:"Hidden on mobile (base)"}),i.jsx(l,{children:"Red with mixin"}),i.jsx(r,{children:"Red default, blue hover mixin"}),i.jsx(s,{children:"Blue with mixin"})]});export{c as App};
