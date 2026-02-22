import{j as e,a as n}from"./index-CrR4Sy2L.js";const o=n.div`
  background: ${r=>r.$useGradient?"linear-gradient(90deg, red, blue)":"green"};
`,d=n.div`
  background: ${r=>r.$color==="red"?"crimson":r.$color==="blue"?"navy":"gray"};
`,i=()=>e.jsxs("div",{children:[e.jsx(o,{$useGradient:!1,children:"Solid Color"}),e.jsx(o,{$useGradient:!0,children:"Gradient"}),e.jsx(d,{$color:"red",children:"Red"}),e.jsx(d,{$color:"blue",children:"Blue"}),e.jsx(d,{$color:"default",children:"Default"})]});export{i as App};
