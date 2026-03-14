import{j as e,c as d}from"./index-CScyS67Z.js";function h(t){const{label:i,compact:a,highlighted:s,className:c,style:o}=t;return e.jsx("div",{className:c,style:o,children:e.jsx("span",{style:{fontWeight:s?"bold":"normal"},children:a?i.slice(0,3):i})})}const l=d(h)`
  background-color: #e0e0e0;
  padding: 12px;
  min-width: 80px;
  min-height: 40px;
  ${t=>t.compact?"transform: scale(0.75);":""}
  ${t=>t.highlighted?"border: 2px solid blue;":""}
`,n=()=>e.jsxs("div",{style:{display:"flex",gap:12,padding:16},children:[e.jsx(l,{label:"Default"}),e.jsx(l,{label:"Compact",compact:!0}),e.jsx(l,{label:"Highlighted",highlighted:!0}),e.jsx(l,{label:"Both",compact:!0,highlighted:!0})]});export{n as App,l as Card};
