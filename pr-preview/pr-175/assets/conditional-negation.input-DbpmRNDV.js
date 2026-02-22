import{j as i,a as s}from"./index-CiQoHq7f.js";const o=s.div`
  ${e=>e.$open?"":"pointer-events: none; opacity: 0.1;"}
`,t=s.div`
  inset: 0;
  ${e=>e.$visible?"opacity: 1;":"opacity: 0;"}
`,n=()=>i.jsxs("div",{children:[i.jsx(o,{$open:!0,children:"Visible tooltip"}),i.jsx(o,{$open:!1,children:"Hidden tooltip"}),i.jsx(o,{children:"Default hidden tooltip"}),i.jsx(t,{$visible:!0,children:"Visible overlay"}),i.jsx(t,{$visible:!1,children:"Hidden overlay"})]});export{n as App,t as Overlay,o as Tooltip};
