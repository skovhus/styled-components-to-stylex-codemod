import{j as r,c as a}from"./index-DU6bk0xL.js";const t=a.div`
  display: flex;
  flex-direction: ${n=>n.column?"column":"row"};
  gap: ${n=>n.gap?`${n.gap}px`:"0"};
`,e=a(t)`
  padding: 8px;
`,i=a.button`
  background: ${n=>n.variant==="primary"?"blue":"gray"};
  font-size: ${n=>n.size?`${n.size}px`:"14px"};
`;function c(){return r.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:8,padding:16},children:[r.jsx(e,{column:!0,gap:8,style:{backgroundColor:"#f0f0f0"},children:"Wrapper with column and gap"}),r.jsx(i,{variant:"primary",size:18,onClick:()=>alert("clicked"),children:"Primary Button"}),r.jsx(i,{variant:"secondary",children:"Secondary Button"})]})}export{c as App,i as Button,e as Wrapper};
