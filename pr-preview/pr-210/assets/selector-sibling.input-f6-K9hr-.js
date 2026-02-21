import{j as e,a as d}from"./index-YN29Czn-.js";const i=d.div`
  color: blue;
  padding: 8px 16px;

  /* Adjacent sibling: element immediately following */
  & + & {
    color: red;
    background: lime;
  }
`,n=()=>e.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:4,padding:16},children:[e.jsx(i,{children:"First (blue)"}),e.jsx(i,{children:"Second (red, lime - adjacent)"}),e.jsx(i,{children:"Third (red, lime - adjacent)"})]});export{n as App};
