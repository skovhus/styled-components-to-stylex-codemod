import{j as o,c as e}from"./index-DJln-3ic.js";import{c as r}from"./helpers-Q9zGD7Df.js";const n=e.input`
  -webkit-appearance: none;
  width: 200px;
  height: 4px;
  background-color: ${r("bgBorderSolid")};
  border-radius: 2px;
  outline: none;

  &::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background-color: ${r("controlPrimary")};
    cursor: pointer;
    transition: background-color 0.2s ease-in-out;

    &:hover {
      transition-duration: 0s;
      background-color: ${r("controlPrimaryHover")};
    }
  }
`,a=()=>o.jsx("div",{style:{display:"flex",flexDirection:"column",gap:"16px",padding:"16px"},children:o.jsxs("label",{children:["Hover the thumb — it should change color:",o.jsx(n,{type:"range",min:"0",max:"100",defaultValue:"50"})]})});export{a as App};
