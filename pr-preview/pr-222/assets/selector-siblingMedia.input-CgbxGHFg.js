import{j as i,c as s}from"./index-C-Oz528S.js";const n=s.div`
  color: blue;
  padding: 8px;

  @media (min-width: 768px) {
    & + & {
      margin-top: 16px;
    }
  }
`,e=()=>i.jsxs("div",{style:{padding:16},children:[i.jsx(n,{children:"First"}),i.jsx(n,{children:"Second (margin-top on wide screens)"})]});export{e as App};
