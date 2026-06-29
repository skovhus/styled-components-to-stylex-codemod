import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{m as t,u as n}from"./index-IKxwesSj.js";t();var r=e(),i=e=>(0,r.jsx)(`div`,{className:e.className,children:e.children});i.Option=e=>(0,r.jsx)(`div`,{"data-value":e.value,children:e.children}),i.Group=e=>(0,r.jsx)(`div`,{"data-label":e.label,children:e.children}),i.Separator=()=>(0,r.jsx)(`hr`,{});var a=n(i)`
  width: 240px;
  min-height: 140px;
  padding-block: 12px;
  padding-inline: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border: 2px solid #2f2f2f;
  border-radius: 8px;
  background-color: #f6f7fb;
  color: #1c1c1c;
`;function o(){return(0,r.jsxs)(`div`,{style:{display:`flex`,gap:16,padding:16},children:[(0,r.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:8},children:[(0,r.jsx)(`strong`,{children:`Default`}),(0,r.jsxs)(a,{children:[(0,r.jsxs)(a.Group,{label:`Fruits`,children:[(0,r.jsx)(a.Option,{value:`apple`,children:`Apple`}),(0,r.jsx)(a.Option,{value:`banana`,children:`Banana`})]}),(0,r.jsx)(a.Separator,{}),(0,r.jsx)(a.Group,{label:`Vegetables`,children:(0,r.jsx)(a.Option,{value:`carrot`,children:`Carrot`})})]})]}),(0,r.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:8},children:[(0,r.jsx)(`strong`,{children:`Favorites`}),(0,r.jsxs)(a,{children:[(0,r.jsxs)(a.Group,{label:`Top picks`,children:[(0,r.jsx)(a.Option,{value:`mango`,children:`Mango`}),(0,r.jsx)(a.Option,{value:`broccoli`,children:`Broccoli`})]}),(0,r.jsx)(a.Separator,{}),(0,r.jsx)(a.Option,{value:`water`,children:`Water`})]})]})]})}export{o as App};