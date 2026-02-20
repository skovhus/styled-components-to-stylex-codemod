import{j as e,a as t,b as r}from"./index-gYMuu76N.js";const s=t.div`
  position: absolute;
  ${n=>n.$zIndex!==void 0&&`z-index: ${n.$zIndex};`}
`,o=t.img`
  width: 100px;
  ${({$isBw:n})=>n&&r`
      filter: grayscale(100%);
    `}
`,i=t.p`
  font-size: 14px;
  ${n=>n.$renderingContext==="dialog"&&n.$lines===1&&r`
      background-color: hotpink;
    `}
`,x=()=>e.jsxs("div",{children:[e.jsx(s,{$zIndex:5,children:"With z-index"}),e.jsx(s,{children:"Without z-index"}),e.jsx(o,{$isBw:!0,src:"https://picsum.photos/100"}),e.jsx(o,{$isBw:!1,src:"https://picsum.photos/100"}),e.jsx(i,{$renderingContext:"dialog",$lines:1,children:"Both conditions met"}),e.jsx(i,{$renderingContext:"dialog",$lines:2,children:"Only renderingContext met"}),e.jsx(i,{$renderingContext:"page",$lines:1,children:"Only lines met"}),e.jsx(i,{children:"Neither condition met"})]});export{x as App};
