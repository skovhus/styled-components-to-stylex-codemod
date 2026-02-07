import{j as r,d as s}from"./index-B_Qk8Tgf.js";const i=s.button`
  color: ${e=>e.$primary?"white":"#BF4F74"};
  font-size: 1em;
  margin: 1em;
  padding: 0.25em 1em;
  border-radius: 3px;
  ${e=>e.hollow?"border: 2px solid #bf4f74":`background: ${e.$primary?"#BF4F74":"white"}`};
`,l=s.span`
  display: inline-block;
  ${e=>e.size==="small"?"font-size: 10px":`background: ${e.size==="large"?"blue":"gray"}`};
`,a=()=>r.jsxs("div",{children:[r.jsx(i,{children:"Normal"}),r.jsx(i,{$primary:!0,children:"Primary"}),r.jsx("br",{}),r.jsx(i,{hollow:!0,children:"Hollow"}),r.jsx(i,{hollow:!0,$primary:!0,children:"Primary Hollow"}),r.jsx("br",{}),r.jsx(l,{size:"small",children:"Small"}),r.jsx(l,{size:"medium",children:"Medium"}),r.jsx(l,{size:"large",children:"Large"})]});export{a as App};
