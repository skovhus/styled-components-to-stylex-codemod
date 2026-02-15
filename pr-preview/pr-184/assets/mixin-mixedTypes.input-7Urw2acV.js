import{j as s,a as i,b as n}from"./index-CCuMpmjH.js";const t=n`
  color: red;
`,r=n`
  background-color: blue;
`,d=i.div`
  padding: 10px;
  ${t}
  ${r}
`,o=i.div`
  margin: 10px;
  ${r}
  ${t}
`,c=n`
  font-weight: bold;
`,e=i.div`
  padding: 5px;
  ${t}
  ${r}
  ${c}
`,a=()=>s.jsxs("div",{children:[s.jsx(d,{children:"CSS first"}),s.jsx(o,{children:"Styled first"}),s.jsx(e,{children:"Interleaved"})]});export{a as App};
