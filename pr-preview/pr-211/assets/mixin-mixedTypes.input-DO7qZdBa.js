import{j as s,c as i,s as n}from"./index-FP_Cx-M0.js";const t=n`
  color: red;
`,d=n`
  background-color: blue;
`,r=i.div`
  padding: 10px;
  ${t}
  ${d}
`,c=i.div`
  margin: 10px;
  ${d}
  ${t}
`,o=n`
  font-weight: bold;
`,e=i.div`
  padding: 5px;
  ${t}
  ${d}
  ${o}
`,l=()=>s.jsxs("div",{children:[s.jsx(r,{children:"CSS first"}),s.jsx(c,{children:"Styled first"}),s.jsx(e,{children:"Interleaved"})]});export{l as App};
