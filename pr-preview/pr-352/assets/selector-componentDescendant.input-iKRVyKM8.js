import{j as r,c as e}from"./index-DyIJ1_wz.js";const p=e.div`
  padding: 16px;
  background: papayawhip;
`,d=e.div`
  color: gray;
  padding: 8px;

  ${p} & {
    color: blue;
    background: lavender;
  }
`,i=()=>r.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:16,padding:16},children:[r.jsx(d,{children:"Outside Wrapper (gray)"}),r.jsx(p,{children:r.jsx(d,{children:"Inside Wrapper (blue, lavender)"})})]});export{i as App};
