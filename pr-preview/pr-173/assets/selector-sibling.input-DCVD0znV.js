import{j as e,a as l}from"./index-CpVFPXAI.js";const i=l.div`
  color: blue;
  padding: 8px 16px;

  /* Adjacent sibling: element immediately following */
  & + & {
    color: red;
    background: lime;
  }

  /* General sibling: all following siblings */
  & ~ & {
    border-bottom: 2px solid gray;
  }
`,d=()=>e.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:4,padding:16},children:[e.jsx(i,{children:"First (blue)"}),e.jsx(i,{children:"Second (red, lime - adjacent)"}),e.jsx(i,{children:"Third (red, lime - adjacent)"})]});export{d as App};
