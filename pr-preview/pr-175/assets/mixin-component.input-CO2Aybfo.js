import{j as i,c as e,s as o}from"./index-DHeQ_gfE.js";const n=o`
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
`,s=e.div`
  ${d}
  &:hover {
    color: blue;
  }
`,r=e.div`
  background-color: blue;
  ${n}
  font-weight: bold;
`,x=()=>i.jsxs("div",{children:[i.jsx(t,{children:"Hidden on mobile (base)"}),i.jsx(l,{children:"Red with mixin"}),i.jsx(s,{children:"Red default, blue hover mixin"}),i.jsx(r,{children:"Blue with mixin"})]});export{x as App};
