import{j as e,c as n}from"./index-DHeQ_gfE.js";const o=n.div`
  background: ${r=>r.$useGradient?"linear-gradient(90deg, red, blue)":"green"};
`,d=n.div`
  background: ${r=>r.$color==="red"?"crimson":r.$color==="blue"?"navy":"gray"};
`,c=()=>e.jsxs("div",{children:[e.jsx(o,{$useGradient:!1,children:"Solid Color"}),e.jsx(o,{$useGradient:!0,children:"Gradient"}),e.jsx(d,{$color:"red",children:"Red"}),e.jsx(d,{$color:"blue",children:"Blue"}),e.jsx(d,{$color:"default",children:"Default"})]});export{c as App};
