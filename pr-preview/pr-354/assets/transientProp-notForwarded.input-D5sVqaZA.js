import{j as i,c as r}from"./index-C8Fi2W22.js";function n(e){const{column:c,gap:l,className:s,style:t,children:o}=e;return i.jsx("div",{className:s,style:{display:"flex",flexDirection:c?"column":"row",gap:l,...t},children:o})}const d=r(n)`
  overflow-y: auto;
  background-color: ${e=>e.$applyBackground?"gray":"inherit"};
`,a=r.div`
  padding: ${e=>e.$size==="large"?"16px":"8px"};
  background: ${e=>e.$isActive?"blue":"gray"};
  color: white;
`,x=r.img`
  opacity: ${e=>e.$isInactive?.5:1};
  border-radius: 50%;
`,u=()=>i.jsxs("div",{children:[i.jsxs(d,{$applyBackground:!0,column:!0,gap:10,children:[i.jsx("div",{children:"Item 1"}),i.jsx("div",{children:"Item 2"})]}),i.jsx(a,{$isActive:!0,$size:"large",children:"Active large box"}),i.jsx(a,{$size:"small",children:"Small inactive box"}),i.jsx(x,{$isInactive:!0,src:"/avatar.png",alt:"Avatar"})]});export{u as App,a as Box,x as Image,d as Scrollable};
