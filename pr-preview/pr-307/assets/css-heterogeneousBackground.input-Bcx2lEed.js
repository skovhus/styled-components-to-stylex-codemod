import{j as e,c as o}from"./index-4Xa_ODwx.js";const n=o.div`
  background: ${r=>r.$useGradient?"linear-gradient(90deg, red, blue)":"green"};
`,d=o.div`
  background: ${r=>r.$color==="red"?"crimson":r.$color==="blue"?"navy":"gray"};
`,c=o.div`
  background: none;
  padding: 8px;
`,l=()=>e.jsxs("div",{children:[e.jsx(n,{$useGradient:!1,children:"Solid Color"}),e.jsx(n,{$useGradient:!0,children:"Gradient"}),e.jsx(d,{$color:"red",children:"Red"}),e.jsx(d,{$color:"blue",children:"Blue"}),e.jsx(d,{$color:"default",children:"Default"}),e.jsx(c,{children:"No Background"})]});export{l as App};
