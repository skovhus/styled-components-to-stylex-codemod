import{j as r,c as d}from"./index-DkGxyC9P.js";const e=d.div`
  padding: 16px;
  background: papayawhip;
`,n=d.div`
  color: gray;
  padding: 8px;

  ${e} & {
    color: blue;
    background: lavender;
  }
`,o=d.div`
  color: gray;
  padding: 8px;

  ${e}:hover & {
    color: red;
  }

  ${e} & {
    background: lavender;
  }
`,p=d.div`
  color: gray;
  padding: 8px;

  ${e}:hover & {
    color: green;
  }
`,i=()=>r.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:16,padding:16},children:[r.jsx(n,{children:"Outside Wrapper (gray)"}),r.jsxs(e,{children:[r.jsx(n,{children:"Inside Wrapper (blue, lavender)"}),r.jsx(o,{children:"Inside Wrapper (hover=red, bg=lavender)"}),r.jsx(p,{children:"Inside Wrapper (hover=green)"})]})]});export{i as App};
