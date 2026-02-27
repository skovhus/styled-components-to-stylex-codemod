import{j as o,c as s}from"./index-BRaI0QXY.js";const d=s.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`,r=s.div`
  color: blue;
  padding: 8px;

  & + & {
    border-top: 1px solid gray;
  }
`,i=()=>o.jsxs(d,{children:[o.jsx(r,{children:"First"}),o.jsx(r,{children:"Second (should have border-top)"})]});export{i as App};
