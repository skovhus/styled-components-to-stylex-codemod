import"./react-D4cBbUL-.js";import{f as e,s as t}from"./index-BEHMEpNn.js";import{a as n}from"./helpers-0uNrjOm7.js";var r=e(),i=t.input`
  -webkit-appearance: none;
  width: 200px;
  height: 4px;
  background-color: ${n(`bgBorderSolid`)};
  border-radius: 2px;
  outline: none;

  &::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background-color: ${n(`controlPrimary`)};
    cursor: pointer;
    transition: background-color 0.2s ease-in-out;

    &:hover {
      transition-duration: 0s;
      background-color: ${n(`controlPrimaryHover`)};
    }
  }
`,a=()=>(0,r.jsx)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:`16px`,padding:`16px`},children:(0,r.jsxs)(`label`,{children:[`Hover the thumb — it should change color:`,(0,r.jsx)(i,{type:`range`,min:`0`,max:`100`,defaultValue:`50`})]})});export{a as App};